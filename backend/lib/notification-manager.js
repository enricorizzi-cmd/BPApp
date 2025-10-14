/**
 * Notification Manager - Gestione centralizzata notifiche push
 * Risolve problemi di delivery inconsistente e duplicati
 */

module.exports = function({ supabase, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }) {
  
  // Invia notifica push con cleanup automatico subscription invalide
  async function sendPushNotification(userId, payload, options = {}) {
    try {
      console.log(`[NotificationManager] Sending push to user ${userId}`);
      
      // Ottieni subscription valide per l'utente
      const subscriptions = await getValidSubscriptions(userId);
      if (subscriptions.length === 0) {
        console.log(`[NotificationManager] No valid subscriptions for user ${userId}`);
        return { sent: 0, failed: 0, cleaned: 0 };
      }
      
      let sent = 0;
      let failed = 0;
      let cleaned = 0;
      
      // Invia a tutte le subscription
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload));
          sent++;
          console.log(`[NotificationManager] Sent to subscription ${sub.endpoint.substring(0, 50)}...`);
        } catch (error) {
          failed++;
          console.error(`[NotificationManager] Failed to send:`, error.message);
          
          // Cleanup subscription invalida
          if (error.statusCode === 410 || error.statusCode === 404) {
            await deleteInvalidSubscription(userId, sub);
            cleaned++;
            console.log(`[NotificationManager] Cleaned invalid subscription for user ${userId}`);
          }
        }
      }
      
      return { sent, failed, cleaned };
    } catch (error) {
      console.error('[NotificationManager] Error sending push notification:', error);
      return { sent: 0, failed: 1, cleaned: 0 };
    }
  }
  
  // Ottieni subscription valide per utente
  async function getValidSubscriptions(userId) {
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('userid', userId);
      
      if (error) throw error;
      
      return (data || []).map(row => ({
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      }));
    } catch (error) {
      console.error('[NotificationManager] Error getting subscriptions:', error);
      return [];
    }
  }
  
  // Rimuovi subscription invalida
  async function deleteInvalidSubscription(userId, subscription) {
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('userid', userId)
        .eq('endpoint', subscription.endpoint);
      
      if (error) throw error;
      console.log(`[NotificationManager] Deleted invalid subscription for user ${userId}`);
    } catch (error) {
      console.error('[NotificationManager] Error deleting subscription:', error);
    }
  }
  
  // Marca notifica come inviata (tracking atomico)
  async function markNotificationSent(userId, appointmentId, notificationType, deviceId = null) {
    try {
      const { error } = await supabase
        .from('push_notifications_sent')
        .upsert({
          id: `${appointmentId}_${notificationType}`,
          userid: userId,
          appointmentid: appointmentId,
          notification_type: notificationType,
          device_id: deviceId,
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          createdat: new Date().toISOString()
        }, {
          onConflict: 'id'
        });
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[NotificationManager] Error marking notification as sent:', error);
      return false;
    }
  }
  
  // Verifica se notifica è già stata inviata
  async function isNotificationSent(appointmentId, notificationType) {
    try {
      const { data, error } = await supabase
        .from('push_notifications_sent')
        .select('id')
        .eq('appointmentid', appointmentId)
        .eq('notification_type', notificationType)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('[NotificationManager] Error checking notification status:', error);
      return true; // Fail-safe: assume già inviata
    }
  }
  
  // Processa notifiche post-appuntamento
  async function processPostAppointmentNotifications() {
    try {
      console.log('[NotificationManager] Processing post-appointment notifications...');
      
      // Trova appuntamenti di vendita recenti (ultime 2 ore) non ancora notificati
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      
      const queryStartTime = Date.now();
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf') // AGGIUNTO: nncf per determinare tipo notifica
        .eq('type', 'vendita')
        .gte('end_time', twoHoursAgo)
        .lte('end_time', new Date().toISOString())
        .or('salepromptanswered.is.null,salepromptanswered.eq.false')
        .or('nncfpromptanswered.is.null,nncfpromptanswered.eq.false')
        .limit(100) // Limite per evitare memory spike
        .order('end_time', { ascending: false }); // Ordine per processare i più recenti
      
      const queryTime = Date.now() - queryStartTime;
      console.log(`[QueryOptimization] Query executed in ${queryTime}ms, found ${appointments?.length || 0} appointments`);
      
      if (error) throw error;
      
      // Filtra appuntamenti in base al tipo per evitare notifiche duplicate
      const filteredAppointments = (appointments || []).filter(appointment => {
        if (appointment.nncf) {
          // Appuntamento NNCF: controlla solo nncfpromptanswered
          return appointment.nncfpromptanswered === null || appointment.nncfpromptanswered === false;
        } else {
          // Appuntamento vendita normale: controlla solo salepromptanswered
          return appointment.salepromptanswered === null || appointment.salepromptanswered === false;
        }
      });
      
      console.log(`[NotificationManager] Filtered ${filteredAppointments.length} appointments from ${appointments?.length || 0} total (removed ${(appointments?.length || 0) - filteredAppointments.length} already answered)`);
      
      // Gestione overflow se ci sono più di 100 appuntamenti
      if (filteredAppointments && filteredAppointments.length === 100) {
        console.log(`[QueryOptimization] Processed first 100 appointments (most recent)`);
        console.log(`[QueryOptimization] Remaining appointments will be processed in next cycle`);
      }
      
      // Memory monitoring
      const startMemory = process.memoryUsage();
      console.log(`[MemoryMetrics] Start: ${Math.round(startMemory.heapUsed / 1024 / 1024)}MB`);
      
      let processed = 0;
      const batchSize = 20;
      const appointmentsList = filteredAppointments || [];
      
      // Processa in batch per evitare memory spike
      for (let i = 0; i < appointmentsList.length; i += batchSize) {
        const batch = appointmentsList.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(appointmentsList.length / batchSize);
        
        console.log(`[BatchProcessing] Processing batch ${batchNumber}/${totalBatches} (${batch.length} appointments)`);
        
        // Processa batch
        for (const appointment of batch) {
          const notificationType = appointment.nncf ? 'post_nncf' : 'post_sale';
          
          // Controlla se già inviata
          const alreadySent = await isNotificationSent(appointment.id, notificationType);
          if (alreadySent) continue;
          
          // Invia notifica con payload completo
          const payload = {
            title: appointment.nncf ? "🎯 Nuovo Cliente?" : "💰 Hai Venduto?",
            body: `Appuntamento con ${appointment.client} - ${appointment.nncf ? 'È diventato cliente?' : 'Hai chiuso la vendita?'}`,
            url: "/#appointments",
            tag: appointment.nncf ? 'bp-post-nncf' : 'bp-post-sale',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: {
              appointmentId: appointment.id,
              client: appointment.client,
              type: appointment.nncf ? 'nncf' : 'sale',
              url: "/#appointments"
            }
          };
          
          const result = await sendPushNotification(appointment.userid, payload);
          
          // Marca come inviata solo se almeno una delivery è riuscita
          if (result.sent > 0) {
            await markNotificationSent(appointment.userid, appointment.id, notificationType);
            processed++;
          }
        }
        
        // Pausa tra batch per non bloccare event loop
        if (i + batchSize < appointmentsList.length) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms pause
        }
        
        // Memory check ogni 5 batch
        if (batchNumber % 5 === 0) {
          const currentMemory = process.memoryUsage();
          console.log(`[MemoryMetrics] Batch ${batchNumber}: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`);
        }
      }
      
      // Memory finale
      const endMemory = process.memoryUsage();
      console.log(`[MemoryMetrics] End: ${Math.round(endMemory.heapUsed / 1024 / 1024)}MB, Delta: ${Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024)}MB`);
      
      console.log(`[NotificationManager] Processed ${processed} post-appointment notifications`);
      return processed;
    } catch (error) {
      console.error('[NotificationManager] Error processing post-appointment notifications:', error);
      return 0;
    }
  }
  
  // Cleanup subscription invalide (ottimizzato)
  async function cleanupInvalidSubscriptions() {
    try {
      console.log('[NotificationManager] Cleaning up invalid subscriptions...');
      
      // 1. Cleanup subscription senza lastseen aggiornato da >7 giorni
      const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
      const { data: oldSubscriptions, error: oldError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .or(`lastseen.is.null,lastseen.lt.${sevenDaysAgo}`);
      
      if (oldError) throw oldError;
      
      let cleaned = 0;
      
      // Rimuovi subscription vecchie senza test (assumiamo morte)
      for (const sub of oldSubscriptions || []) {
        await deleteInvalidSubscription(sub.userid, {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        });
        cleaned++;
        console.log(`[NotificationManager] Removed old subscription for user ${sub.userid} (lastseen: ${sub.lastseen || 'never'})`);
      }
      
      // 2. Test solo subscription recenti (ultimi 7 giorni) per errori 404/410
      const { data: recentSubscriptions, error: recentError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .gte('lastseen', sevenDaysAgo);
      
      if (recentError) throw recentError;
      
      for (const sub of recentSubscriptions || []) {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        };
        
        try {
          // Test subscription con payload vuoto
          await webpush.sendNotification(subscription, JSON.stringify({ test: true }));
        } catch (error) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await deleteInvalidSubscription(sub.userid, subscription);
            cleaned++;
            console.log(`[NotificationManager] Removed invalid subscription for user ${sub.userid} (${error.statusCode})`);
          }
        }
      }
      
      console.log(`[NotificationManager] Cleaned ${cleaned} invalid subscriptions (${oldSubscriptions?.length || 0} old + ${cleaned - (oldSubscriptions?.length || 0)} invalid)`);
      return cleaned;
    } catch (error) {
      console.error('[NotificationManager] Error cleaning subscriptions:', error);
      return 0;
    }
  }
  
  // Invia notifica "Ricordati di compilare il BP"
  async function sendBPReminderNotification(userId) {
    try {
      const payload = {
        title: "📋 Ricordati di compilare il BP",
        body: "Non dimenticare di aggiornare il tuo Battle Plan con i risultati di oggi!",
        url: "/#periods",
        tag: 'bp-reminder',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
          type: 'bp-reminder',
          url: "/#periods"
        }
      };
      
      return await sendPushNotification(userId, payload);
    } catch (error) {
      console.error('[NotificationManager] Error sending BP reminder:', error);
      return { sent: 0, failed: 1, cleaned: 0 };
    }
  }

  return {
    sendPushNotification,
    markNotificationSent,
    isNotificationSent,
    processPostAppointmentNotifications,
    cleanupInvalidSubscriptions,
    sendBPReminderNotification
  };
};
