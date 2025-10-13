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
      
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('type', 'vendita')
        .gte('end_time', twoHoursAgo)
        .lte('end_time', new Date().toISOString())
        .or('salepromptanswered.is.null,salepromptanswered.eq.false')
        .or('nncfpromptanswered.is.null,nncfpromptanswered.eq.false');
      
      if (error) throw error;
      
      let processed = 0;
      for (const appointment of appointments || []) {
        const notificationType = appointment.nncf ? 'post_nncf' : 'post_sale';
        
        // Controlla se già inviata
        const alreadySent = await isNotificationSent(appointment.id, notificationType);
        if (alreadySent) continue;
        
        // Invia notifica
        const payload = {
          title: appointment.nncf ? "🎯 Nuovo Cliente?" : "💰 Hai Venduto?",
          body: `Appuntamento con ${appointment.client} - ${appointment.nncf ? 'È diventato cliente?' : 'Hai chiuso la vendita?'}`,
          url: "/#appointments"
        };
        
        const result = await sendPushNotification(appointment.userid, payload);
        
        // Marca come inviata solo se almeno una delivery è riuscita
        if (result.sent > 0) {
          await markNotificationSent(appointment.userid, appointment.id, notificationType);
          processed++;
        }
      }
      
      console.log(`[NotificationManager] Processed ${processed} post-appointment notifications`);
      return processed;
    } catch (error) {
      console.error('[NotificationManager] Error processing post-appointment notifications:', error);
      return 0;
    }
  }
  
  // Cleanup subscription invalide
  async function cleanupInvalidSubscriptions() {
    try {
      console.log('[NotificationManager] Cleaning up invalid subscriptions...');
      
      const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*');
      
      if (error) throw error;
      
      let cleaned = 0;
      for (const sub of subscriptions || []) {
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
          }
        }
      }
      
      console.log(`[NotificationManager] Cleaned ${cleaned} invalid subscriptions`);
      return cleaned;
    } catch (error) {
      console.error('[NotificationManager] Error cleaning subscriptions:', error);
      return 0;
    }
  }
  
  return {
    sendPushNotification,
    markNotificationSent,
    isNotificationSent,
    processPostAppointmentNotifications,
    cleanupInvalidSubscriptions
  };
};
