const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }) {
  
  // ===== INVIO NOTIFICHE MANUALI =====
  
  // POST - Invia notifica manuale
  router.post('/send', auth, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      
      const { text, recipients, type } = req.body;
      if (!text || !recipients) {
        return res.status(400).json({ error: 'Text and recipients required' });
      }
      
      // Carica sottoscrizioni push
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
      } catch (e) {
        console.error('[Notifications] Error loading subscriptions:', e);
      }
      
      // Invia notifiche
      const payload = {
        title: 'Battle Plan',
        body: text,
        tag: type === 'automatic' ? 'bp-automatic' : 'bp-manual',
        url: '/'
      };
      
      let sent = 0;
      let failed = 0;
      
      if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub, JSON.stringify(payload));
            sent++;
          } catch (error) {
            console.error('[Notifications] Failed to send to subscription:', error.message);
            failed++;
          }
        }
      } else {
        console.warn('[Notifications] Push notifications not configured');
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
          total: subs.length,
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
        total: subs.length 
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
