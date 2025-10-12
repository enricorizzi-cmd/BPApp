const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase }) {
  
  // Helper functions per Supabase
  async function checkPushSent(userId, appointmentId, notificationType) {
    try {
      const { data, error } = await supabase
        .from('push_notifications_sent')
        .select('id')
        .eq('userid', userId)
        .eq('appointmentid', appointmentId)
        .eq('notification_type', notificationType)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }
      
      return !!data; // Return true if notification was sent
    } catch (error) {
      console.error('[Push Tracking] Error checking sent status:', error);
      return false; // Default to false on error
    }
  }
  
  async function markPushSent(userId, appointmentId, notificationType) {
    try {
      const { error } = await supabase
        .from('push_notifications_sent')
        .upsert({
          id: `push_${userId}_${appointmentId}_${notificationType}`,
          userid: userId,
          appointmentid: appointmentId,
          notification_type: notificationType,
          sent_at: new Date().toISOString(),
          createdat: new Date().toISOString()
        }, { 
          onConflict: 'id' // Use the unique constraint on id
        });
      
      if (error) {
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('[Push Tracking] Error marking as sent:', error);
      return false;
    }
  }
  
  // GET - Check if push notification was already sent
  router.get('/check', auth, async (req, res) => {
    try {
      const { appointmentId, notificationType } = req.query;
      
      if (!appointmentId || !notificationType) {
        return res.status(400).json({ error: 'Missing appointmentId or notificationType' });
      }
      
      const wasSent = await checkPushSent(req.user.id, appointmentId, notificationType);
      
      res.json({ sent: wasSent });
    } catch (error) {
      console.error('[Push Tracking] Error in check endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST - Mark push notification as sent
  router.post('/mark-sent', auth, async (req, res) => {
    try {
      const { appointmentId, notificationType } = req.body;
      
      if (!appointmentId || !notificationType) {
        return res.status(400).json({ error: 'Missing appointmentId or notificationType' });
      }
      
      const success = await markPushSent(req.user.id, appointmentId, notificationType);
      
      if (success) {
        res.json({ ok: true });
      } else {
        res.status(500).json({ error: 'Failed to mark as sent' });
      }
    } catch (error) {
      console.error('[Push Tracking] Error in mark-sent endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET - Get all sent notifications for a user (for debugging)
  router.get('/history', auth, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('push_notifications_sent')
        .select('*')
        .eq('userid', req.user.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      
      if (error) {
        throw error;
      }
      
      res.json({ notifications: data || [] });
    } catch (error) {
      console.error('[Push Tracking] Error in history endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  return router;
};
