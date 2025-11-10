/**
 * Notification Manager - Gestione centralizzata notifiche push
 * Risolve problemi di delivery inconsistente e duplicati
 */

const logger = require('./production-logger');

module.exports = function({ supabase, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }) {
  
  // Invia notifica push con cleanup automatico subscription invalide
  // ✅ Aggiunte validazioni e logging per sicurezza
  async function sendPushNotification(userId, payload, options = {}) {
    try {
      // ✅ VALIDAZIONE INPUT
      if (!userId || typeof userId !== 'string') {
        logger.error(`[NotificationManager] Invalid userId: ${userId}`);
        return { sent: 0, failed: 0, cleaned: 0 };
      }
      
      if (!payload || typeof payload !== 'object') {
        logger.error(`[NotificationManager] Invalid payload:`, payload);
        return { sent: 0, failed: 0, cleaned: 0 };
      }
      
      // ✅ Verifica che utente esista (validazione sicurezza)
      const { data: user, error: userError } = await supabase
        .from('app_users')
        .select('id, name, email')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        logger.error(`[NotificationManager] User not found: ${userId}`, userError);
        return { sent: 0, failed: 0, cleaned: 0 };
      }
      
      // ✅ LOGGING per audit trail
      logger.info(`[NotificationManager] Sending push to user ${userId} (${user.name || user.email})`);
      logger.debug(`[NotificationManager] Payload:`, {
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url
      });
      
      logger.debug(`Sending push to user ${userId}`);
      
      // Ottieni subscription valide per l'utente
      const subscriptions = await getValidSubscriptions(userId);
      if (subscriptions.length === 0) {
        logger.debug(`No valid subscriptions for user ${userId}`);
        return { sent: 0, failed: 0, cleaned: 0 };
      }
      
      logger.debug(`[NotificationManager] Found ${subscriptions.length} subscriptions for user ${userId}`);
      
      let sent = 0;
      let failed = 0;
      let cleaned = 0;
      
      // Invia a tutte le subscription
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload));
          sent++;
          logger.debug(`Sent to subscription ${sub.endpoint.substring(0, 50)}...`);
        } catch (error) {
          failed++;
          logger.error(`Failed to send:`, error.message);
          
          // Cleanup subscription invalida
          if (error.statusCode === 410 || error.statusCode === 404) {
            await deleteInvalidSubscription(userId, sub);
            cleaned++;
            console.log(`[NotificationManager] Cleaned invalid subscription for user ${userId}`);
          }
        }
      }
      
      logger.info(`[NotificationManager] Notification sent: sent=${sent}, failed=${failed}, cleaned=${cleaned} for user ${userId}`);
      
      return { sent, failed, cleaned };
    } catch (error) {
      console.error('[NotificationManager] Error sending push notification:', error);
      logger.error('[NotificationManager] Error sending push notification:', {
        userId,
        error: error.message,
        stack: error.stack
      });
      return { sent: 0, failed: 1, cleaned: 0 };
    }
  }
  
  // Ottieni subscription valide per utente
  // ✅ Aggiunte validazioni e logging
  async function getValidSubscriptions(userId) {
    try {
      // ✅ Validazione input
      if (!userId || typeof userId !== 'string') {
        logger.error(`[NotificationManager] Invalid userId in getValidSubscriptions: ${userId}`);
        return [];
      }
      
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('userid', userId);
      
      if (error) {
        logger.error(`[NotificationManager] Error getting subscriptions for ${userId}:`, error);
        throw error;
      }
      
      // ✅ Validazione risultati
      if (!data || data.length === 0) {
        logger.debug(`[NotificationManager] No subscriptions found for user ${userId}`);
        return [];
      }
      
      logger.debug(`[NotificationManager] Found ${data.length} subscriptions for user ${userId}`);
      
      return (data || []).map(row => ({
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      }));
    } catch (error) {
      console.error('[NotificationManager] Error getting subscriptions:', error);
      logger.error('[NotificationManager] Error getting subscriptions:', {
        userId,
        error: error.message
      });
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
  // Supporta sia appointmentid (retrocompatibilità) che resource_id (per lead)
  async function markNotificationSent(userId, resourceId, notificationType, deviceId = null, useResourceId = false) {
    try {
      // Genera ID univoco basato su resourceId e notificationType
      const trackingId = `${resourceId}_${notificationType}`;
      
      const trackingData = {
        id: trackingId,
        userid: userId,
        resource_id: useResourceId ? resourceId : null,
        appointmentid: useResourceId ? null : resourceId,
        notification_type: notificationType,
        device_id: deviceId,
        delivery_status: 'sent',
        sent_at: new Date().toISOString(),
        createdat: new Date().toISOString()
      };
      
      console.log(`[DEBUG_TRACKING] Attempting to mark notification as sent:`, trackingData);
      
      const { error } = await supabase
        .from('push_notifications_sent')
        .upsert(trackingData, {
          onConflict: 'id'
        });
      
      if (error) {
        console.error(`[DEBUG_TRACKING] Supabase error marking notification:`, error);
        throw error;
      }
      
      console.log(`[DEBUG_TRACKING] Successfully marked notification as sent: ${trackingId}`);
      return true;
    } catch (error) {
      console.error(`[DEBUG_TRACKING] Error marking notification as sent:`, error);
      console.error(`[DEBUG_TRACKING] Error details:`, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return false;
    }
  }
  
  // Verifica se notifica è già stata inviata (controlla sia appointmentid che resource_id)
  // Supporta sia appointmentid (retrocompatibilità) che resource_id (per lead)
  async function isNotificationSent(resourceId, notificationType, useResourceId = false) {
    try {
      console.log(`[DEBUG_TRACKING] Checking if notification already sent: ${resourceId}_${notificationType} (useResourceId: ${useResourceId})`);
      
      // Mappa i tipi per controllare entrambi i sistemi (frontend/backend)
      const frontendType = notificationType === 'post_sale' ? 'sale' : 
                          notificationType === 'post_nncf' ? 'nncf' : notificationType;
      const backendType = notificationType;
      
      // Controlla sia appointmentid che resource_id per retrocompatibilità
      // Cerca in entrambi i campi per supportare vecchi e nuovi record
      const { data, error } = await supabase
        .from('push_notifications_sent')
        .select('id')
        .eq('notification_type', notificationType)
        .or(`appointmentid.eq.${resourceId},resource_id.eq.${resourceId}`)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // Se non trovato con notification_type esatto, prova con frontend/backend mapping
        const { data: altData, error: altError } = await supabase
          .from('push_notifications_sent')
          .select('id')
          .or(`appointmentid.eq.${resourceId},resource_id.eq.${resourceId}`)
          .or(`notification_type.eq.${frontendType},notification_type.eq.${backendType}`)
          .single();
        
        if (altError && altError.code !== 'PGRST116') {
          console.error(`[DEBUG_TRACKING] Error checking notification status:`, altError);
          throw altError;
        }
        
        const alreadySent = !!altData;
        console.log(`[DEBUG_TRACKING] Notification ${resourceId} (${frontendType}/${backendType}) already sent: ${alreadySent}`);
        return alreadySent;
      }
      
      const alreadySent = !!data;
      console.log(`[DEBUG_TRACKING] Notification ${resourceId} (${notificationType}) already sent: ${alreadySent}`);
      return alreadySent;
    } catch (error) {
      console.error(`[DEBUG_TRACKING] Error checking notification status:`, error);
      console.error(`[DEBUG_TRACKING] Error details:`, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return true; // Fail-safe: assume già inviata
    }
  }
  
  // Processa notifiche post-appuntamento
  async function processPostAppointmentNotifications() {
    try {
      console.log('[NotificationManager] Processing post-appointment notifications...');
      
      // Trova appuntamenti di vendita recenti (ultimi 7 giorni) non ancora notificati
      // Allineato con frontend LOOKBACK_DAYS = 7
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      console.log(`[DEBUG_SCANSIONE] Scanning appointments from ${sevenDaysAgo} to ${now}`);
      
      const queryStartTime = Date.now();
      // Query senza filtri su answered - li filtriamo dopo in base al tipo (NNCF vs vendita)
      // Questo evita problemi con .or() multipli in Supabase
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf')
        .eq('type', 'vendita')
        .gte('end_time', sevenDaysAgo)
        .lte('end_time', now)
        .limit(100) // Limite per evitare memory spike
        .order('end_time', { ascending: false }); // Ordine per processare i più recenti
      
      const queryTime = Date.now() - queryStartTime;
      console.log(`[QueryOptimization] Query executed in ${queryTime}ms, found ${appointments?.length || 0} appointments`);
      
      if (error) {
        console.error(`[DEBUG_SCANSIONE] Query error:`, error);
        throw error;
      }
      
      // Debug dettagliato degli appuntamenti trovati
      if (appointments && appointments.length > 0) {
        console.log(`[DEBUG_SCANSIONE] Found ${appointments.length} appointments:`);
        appointments.forEach((apt, index) => {
          console.log(`[DEBUG_SCANSIONE] ${index + 1}. ID: ${apt.id}, Client: ${apt.client}, NNCF: ${apt.nncf}, SaleAnswered: ${apt.salepromptanswered}, NNCFAnswered: ${apt.nncfpromptanswered}, EndTime: ${apt.end_time}`);
        });
      } else {
        console.log(`[DEBUG_SCANSIONE] No appointments found in time range`);
      }
      
      // Filtra appuntamenti in base al tipo per evitare notifiche duplicate
      const filteredAppointments = (appointments || []).filter(appointment => {
        if (appointment.nncf) {
          // Appuntamento NNCF: controlla solo nncfpromptanswered
          const shouldNotify = appointment.nncfpromptanswered === null || appointment.nncfpromptanswered === false;
          console.log(`[DEBUG_FILTRO] NNCF Appointment ${appointment.id}: nncfpromptanswered=${appointment.nncfpromptanswered}, shouldNotify=${shouldNotify}`);
          return shouldNotify;
        } else {
          // Appuntamento vendita normale: controlla solo salepromptanswered
          const shouldNotify = appointment.salepromptanswered === null || appointment.salepromptanswered === false;
          console.log(`[DEBUG_FILTRO] Sale Appointment ${appointment.id}: salepromptanswered=${appointment.salepromptanswered}, shouldNotify=${shouldNotify}`);
          return shouldNotify;
        }
      });
      
      console.log(`[DEBUG_FILTRO] Filtered ${filteredAppointments.length} appointments from ${appointments?.length || 0} total (removed ${(appointments?.length || 0) - filteredAppointments.length} already answered)`);
      
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
          console.log(`[DEBUG_PUSH] Processing appointment ${appointment.id} (${notificationType})`);
          
          // Controlla se già inviata
          const alreadySent = await isNotificationSent(appointment.id, notificationType);
          console.log(`[DEBUG_PUSH] Appointment ${appointment.id} already sent: ${alreadySent}`);
          if (alreadySent) {
            console.log(`[DEBUG_PUSH] Skipping appointment ${appointment.id} - already sent`);
            continue;
          }
          
          // Invia notifica con payload completo e testi corretti
          const when = new Date(appointment.end_time).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
          const payload = {
            title: appointment.nncf ? "🎯 Nuovo Cliente?" : "💰 Hai Venduto?",
            body: appointment.nncf 
              ? `Ehi, ${appointment.client} è diventato cliente? Appuntamento del ${when}`
              : `Allora, hai venduto a ${appointment.client}? Appuntamento del ${when}`,
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
          
          console.log(`[DEBUG_PUSH] Sending notification to user ${appointment.userid} for appointment ${appointment.id}`);
          const result = await sendPushNotification(appointment.userid, payload);
          console.log(`[DEBUG_PUSH] Send result for ${appointment.id}: sent=${result.sent}, failed=${result.failed}, cleaned=${result.cleaned}`);
          
          // Marca come inviata solo se almeno una delivery è riuscita
          if (result.sent > 0) {
            console.log(`[DEBUG_PUSH] Marking notification as sent for ${appointment.id} (${notificationType})`);
            const marked = await markNotificationSent(appointment.userid, appointment.id, notificationType);
            console.log(`[DEBUG_PUSH] Mark result for ${appointment.id}: ${marked ? 'SUCCESS' : 'FAILED'}`);
            if (marked) processed++;
          } else {
            console.log(`[DEBUG_PUSH] Not marking ${appointment.id} as sent - no successful deliveries`);
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

  // Processa notifiche per feedback vendite riordini
  async function processVenditeRiordiniNotifications() {
    try {
      console.log('[NotificationManager] Processing vendite riordini notifications...');
      
      // Trova preventivi con data_feedback = oggi alle 19:00
      const now = new Date();
      const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentHour = now.getHours();
      
      // Solo se siamo alle 19:00 (con tolleranza di 1 minuto)
      if (currentHour !== 19) {
        console.log(`[VenditeRiordini] Not 19:00 yet (current: ${currentHour}:${now.getMinutes()}), skipping`);
        return 0;
      }
      
      console.log(`[VenditeRiordini] Processing feedback notifications for ${today}`);
      
      // Trova preventivi con data_feedback = oggi e stato != 'confermato' e != 'rifiutato'
      const { data: vendite, error } = await supabase
        .from('vendite_riordini')
        .select('id, consultantid, cliente, valore_proposto, data_feedback, stato')
        .eq('data_feedback', today)
        .not('stato', 'in', '(confermato,rifiutato)')
        .limit(100);
      
      if (error) {
        console.error('[VenditeRiordini] Query error:', error);
        throw error;
      }
      
      if (!vendite || vendite.length === 0) {
        console.log('[VenditeRiordini] No vendite found for today');
        return 0;
      }
      
      console.log(`[VenditeRiordini] Found ${vendite.length} vendite for feedback notification`);
      
      let processed = 0;
      
      // Processa ogni vendita
      for (const vendita of vendite) {
        try {
          // Verifica se notifica già inviata
          const alreadySent = await isVenditeRiordiniNotificationSent(vendita.id);
          if (alreadySent) {
            console.log(`[VenditeRiordini] Notification already sent for ${vendita.id}`);
            continue;
          }
          
          // Ottieni nome utente per personalizzazione
          const { data: user, error: userError } = await supabase
            .from('app_users')
            .select('name')
            .eq('id', vendita.consultantid)
            .single();
          
          if (userError) {
            console.error(`[VenditeRiordini] Error getting user name for ${vendita.consultantid}:`, userError);
            continue;
          }
          
          const userName = user?.name || 'Consulente';
          
          // Crea payload notifica
          const payload = {
            title: "📋 Feedback Preventivo",
            body: `Hey ${userName}! come è andata la proposta piano a "${vendita.cliente}"? VSS:${vendita.valore_proposto}€`,
            url: "/#vendite-riordini",
            tag: 'bp-vendite-feedback',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: {
              venditaId: vendita.id,
              cliente: vendita.cliente,
              valoreProposto: vendita.valore_proposto,
              type: 'vendite-feedback',
              url: "/#vendite-riordini"
            }
          };
          
          console.log(`[VenditeRiordini] Sending notification to user ${vendita.consultantid} for vendita ${vendita.id}`);
          const result = await sendPushNotification(vendita.consultantid, payload);
          console.log(`[VenditeRiordini] Send result for ${vendita.id}: sent=${result.sent}, failed=${result.failed}, cleaned=${result.cleaned}`);
          
          // Marca come inviata solo se almeno una delivery è riuscita
          if (result.sent > 0) {
            console.log(`[VenditeRiordini] Marking notification as sent for ${vendita.id}`);
            const marked = await markVenditeRiordiniNotificationSent(vendita.consultantid, vendita.id);
            console.log(`[VenditeRiordini] Mark result for ${vendita.id}: ${marked ? 'SUCCESS' : 'FAILED'}`);
            if (marked) processed++;
          } else {
            console.log(`[VenditeRiordini] Not marking ${vendita.id} as sent - no successful deliveries`);
          }
          
        } catch (error) {
          console.error(`[VenditeRiordini] Error processing vendita ${vendita.id}:`, error);
        }
      }
      
      console.log(`[VenditeRiordini] Processed ${processed} notifications`);
      return processed;
      
    } catch (error) {
      console.error('[NotificationManager] Error processing vendite riordini notifications:', error);
      return 0;
    }
  }
  
  // Verifica se notifica vendite riordini è già stata inviata
  async function isVenditeRiordiniNotificationSent(venditaId) {
    try {
      // Cerca sia in appointmentid che resource_id per retrocompatibilità
      const { data, error } = await supabase
        .from('push_notifications_sent')
        .select('id')
        .eq('notification_type', 'vendite-feedback')
        .or(`appointmentid.eq.${venditaId},resource_id.eq.${venditaId}`)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error(`[VenditeRiordini] Error checking notification status:`, error);
        throw error;
      }
      
      return !!data;
    } catch (error) {
      console.error(`[VenditeRiordini] Error checking notification status:`, error);
      return true; // Fail-safe: assume già inviata
    }
  }
  
  // Marca notifica vendite riordini come inviata
  async function markVenditeRiordiniNotificationSent(userId, venditaId) {
    try {
      // Usa markNotificationSent con useResourceId=false (usa appointmentid per retrocompatibilità)
      return await markNotificationSent(userId, venditaId, 'vendite-feedback', null, false);
    } catch (error) {
      console.error(`[VenditeRiordini] Error marking notification as sent:`, error);
      return false;
    }
  }

  return {
    sendPushNotification,
    markNotificationSent,
    isNotificationSent,
    processPostAppointmentNotifications,
    cleanupInvalidSubscriptions,
    sendBPReminderNotification,
    processVenditeRiordiniNotifications,
    isVenditeRiordiniNotificationSent,
    markVenditeRiordiniNotificationSent
  };
};
