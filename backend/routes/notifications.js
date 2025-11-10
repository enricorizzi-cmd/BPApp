const express = require('express');
const productionLogger = require('../lib/production-logger');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, supabase }) {
  
  // ---- Inizializza NotificationManager per notifiche manuali/automatiche ----
  let notificationManager = null;
  if (supabase && webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      const NotificationManagerFactory = require('../lib/notification-manager');
      notificationManager = NotificationManagerFactory({
        supabase,
        webpush,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      });
      productionLogger.info('[Notifications] NotificationManager initialized successfully');
    } catch (error) {
      productionLogger.error('[Notifications] Error initializing NotificationManager:', error);
    }
  } else {
    productionLogger.warn('[Notifications] NotificationManager not initialized - missing dependencies');
  }
  
  // ===== INVIO NOTIFICHE MANUALI =====
  
  // POST - Invia notifica manuale
  router.post('/send', auth, async (req, res) => {
    try {
      const { text, recipients, type } = req.body;
      
      // SICUREZZA: Blocca notifiche automatiche a tutti gli utenti
      if (recipients === 'all' && type === 'automatic') {
        productionLogger.warn(`[SECURITY] Blocked automatic notification to all users from ${req.user.id}`);
        return res.status(400).json({ 
          error: 'Automatic notifications cannot be sent to all users' 
        });
      }
      
      // Solo le notifiche manuali richiedono admin, quelle automatiche possono essere inviate da chiunque
      if (type !== 'automatic' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only for manual notifications' });
      }
      if (!text || !recipients) {
        return res.status(400).json({ error: 'Text and recipients required' });
      }
      
      // Log per audit sicurezza
      productionLogger.info(`[NOTIFICATION] Type: ${type}, Recipients: ${recipients}, SentBy: ${req.user.id}, Text: ${text.substring(0, 50)}...`);
      
      // ✅ MIGRAZIONE: Usa Supabase invece di file JSON legacy
      // Fallback a file JSON se NotificationManager non disponibile o Supabase fallisce
      let sent = 0;
      let failed = 0;
      let cleaned = 0;
      let totalSubs = 0;
      
      // Payload notifica
      const payload = {
        title: 'Battle Plan',
        body: text,
        tag: type === 'automatic' ? 'bp-automatic' : 'bp-manual',
        url: '/',
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      };
      
      // ✅ PRIORITÀ 1: Usa NotificationManager (Supabase) se disponibile
      if (notificationManager && supabase) {
        try {
          if (recipients === 'all') {
            // Per 'all', otteniamo tutti gli utenti e inviamo a ciascuno
            const { data: allUsers, error: usersError } = await supabase
              .from('app_users')
              .select('id')
              .limit(1000); // Limite ragionevole
            
            if (usersError) {
              productionLogger.error('[Notifications] Error getting all users:', usersError);
              throw usersError;
            }
            
            const userIds = (allUsers || []).map(u => u.id);
            totalSubs = userIds.length;
            
            // Invia a tutti gli utenti
            for (const userId of userIds) {
              try {
                const result = await notificationManager.sendPushNotification(userId, payload);
                sent += result.sent;
                failed += result.failed;
                cleaned += result.cleaned;
              } catch (error) {
                productionLogger.error(`[Notifications] Error sending to user ${userId}:`, error);
                failed++;
              }
            }
          } else if (Array.isArray(recipients)) {
            // Per array di userId, invia a ciascuno
            totalSubs = recipients.length;
            
            for (const userId of recipients) {
              // ✅ VALIDAZIONE: Verifica che userId sia valido
              if (!userId || typeof userId !== 'string') {
                productionLogger.warn(`[Notifications] Invalid userId in recipients: ${userId}`);
                continue;
              }
              
              try {
                const result = await notificationManager.sendPushNotification(userId, payload);
                sent += result.sent;
                failed += result.failed;
                cleaned += result.cleaned;
              } catch (error) {
                productionLogger.error(`[Notifications] Error sending to user ${userId}:`, error);
                failed++;
              }
            }
          }
          
          productionLogger.info(`[Notifications] Sent via NotificationManager: sent=${sent}, failed=${failed}, cleaned=${cleaned}, total=${totalSubs}`);
          
          // ✅ OTTIMIZZAZIONE: Aggiorna delivery_status per notifiche automatiche frontend banner
          if (type === 'automatic' && Array.isArray(recipients) && sent > 0 && notificationManager) {
            try {
              // Determina notification_type basato su payload tag
              // Frontend banner push usa tag 'bp-sale' o 'bp-nncf'
              const tag = payload.tag || '';
              let notificationType = 'automatic';
              if (tag === 'bp-nncf') {
                notificationType = 'nncf';
              } else if (tag === 'bp-sale') {
                notificationType = 'sale';
              }
              
              // Se abbiamo un resourceId (appointmentId) nel body, usalo per tracking
              // Altrimenti usa il primo recipient come fallback
              const resourceId = req.body.resourceId || req.body.appointmentId || (recipients.length > 0 ? recipients[0] : null);
              
              if (resourceId && notificationType !== 'automatic') {
                // Marca come inviata per ogni recipient che ha ricevuto la notifica
                for (const userId of recipients) {
                  if (sent > 0) { // Solo se almeno una notifica è stata inviata
                    await notificationManager.markNotificationSent(
                      userId,
                      resourceId,
                      notificationType,
                      null,
                      false // usa appointmentid per retrocompatibilità
                    );
                    productionLogger.debug(`[Notifications] Marked notification as sent: userId=${userId}, resourceId=${resourceId}, type=${notificationType}`);
                  }
                }
              }
            } catch (trackingError) {
              productionLogger.error('[Notifications] Error updating delivery_status:', trackingError);
              // Non bloccare la risposta se il tracking fallisce
            }
          }
        } catch (error) {
          productionLogger.error('[Notifications] Error using NotificationManager, falling back to legacy:', error);
          // Fallback a file JSON legacy
          notificationManager = null;
        }
      }
      
      // ✅ FALLBACK: Usa file JSON legacy se NotificationManager non disponibile
      if (!notificationManager) {
        productionLogger.warn('[Notifications] Using legacy file JSON method (NotificationManager not available)');
        
        let subs = [];
        try {
          const subsDb = await readJSON('push_subscriptions.json');
          const allSubs = subsDb.subs || subsDb.subscriptions || [];
          
          if (recipients === 'all') {
            subs = allSubs.map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys||{}) }).filter(x => x && x.endpoint);
          } else if (Array.isArray(recipients)) {
            subs = allSubs
              .filter(s => recipients.includes(String(s.userId)))
              .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys||{}) })
              .filter(x => x && x.endpoint);
          }
          
          totalSubs = subs.length;
          
          if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
            for (const sub of subs) {
              try {
                await webpush.sendNotification(sub, JSON.stringify(payload));
                sent++;
              } catch (error) {
                // Log solo errori significativi, ignora subscription scadute/invalide
                if (error.statusCode === 410 || error.statusCode === 404) {
                  // Silenzioso: subscription scadute sono normali
                } else {
                  console.error('[Notifications] Failed to send to subscription:', error.message);
                }
                failed++;
              }
            }
          } else {
            productionLogger.warn('[Notifications] Push notifications not configured');
          }
        } catch (e) {
          console.error('[Notifications] Error loading subscriptions from legacy file:', e);
        }
      }
      
      // Salva nel log
      try {
        let log = [];
        try {
          const logDb = await readJSON('notifications_log.json');
          log = logDb.notifications || [];
        } catch (e) {
          log = [];
        }
        
        log.unshift({
          id: Date.now().toString(),
          text: text,
          recipients: recipients === 'all' ? 'all' : recipients,
          sent: sent,
          failed: failed,
          cleaned: cleaned || 0,
          total: totalSubs || 0,
          sentBy: req.user.id,
          sentAt: new Date().toISOString(),
          type: type || 'manual'
        });
        
        // Mantieni solo gli ultimi 100 log
        if (log.length > 100) {
          log = log.slice(0, 100);
        }
        
        await writeJSON('notifications_log.json', { notifications: log });
      } catch (e) {
        console.error('[Notifications] Error saving log:', e);
      }
      
      res.json({ 
        ok: true, 
        sent: sent, 
        failed: failed, 
        cleaned: cleaned || 0,
        total: totalSubs || 0
      });
      
    } catch (error) {
      console.error('[Notifications] Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });
  
  // GET - Log notifiche manuali
  router.get('/manual-log', auth, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      
      let log = [];
      try {
        const logDb = await readJSON('notifications_log.json');
        log = (logDb.notifications || []).filter(n => n.type === 'manual');
      } catch (e) {
        log = [];
      }
      
      res.json({ notifications: log });
    } catch (error) {
      console.error('[Notifications] Error loading manual log:', error);
      res.status(500).json({ error: 'Failed to load log' });
    }
  });
  
  return router;
};
