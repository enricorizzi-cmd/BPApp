const express = require('express');
const router = express.Router();

module.exports = function({ auth, supabase }) {
  
  // Inizializza tracking persistente per notifiche cicli
  const cycleNotificationTracking = require('../lib/cycle-notification-tracking')({ supabase });
  
  // GET - Cronologia notifiche cicli per l'utente corrente
  router.get('/history', auth, async (req, res) => {
    try {
      const notifications = await cycleNotificationTracking.getCycleNotificationsHistory(req.user.id);
      res.json({ notifications });
    } catch (error) {
      console.error('[Cycle Notifications] Error loading history:', error);
      res.status(500).json({ error: 'Failed to load notification history' });
    }
  });
  
  // GET - Verifica se una notifica è già stata inviata
  router.get('/check', auth, async (req, res) => {
    try {
      const { cycleId, deadline } = req.query;
      
      if (!cycleId || !deadline) {
        return res.status(400).json({ error: 'Missing cycleId or deadline' });
      }
      
      const alreadySent = await cycleNotificationTracking.checkCycleNotificationSent(cycleId, deadline);
      res.json({ sent: alreadySent });
    } catch (error) {
      console.error('[Cycle Notifications] Error checking sent status:', error);
      res.status(500).json({ error: 'Failed to check notification status' });
    }
  });
  
  return router;
};
