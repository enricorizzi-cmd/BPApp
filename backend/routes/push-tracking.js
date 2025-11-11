const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase }) {
  
  // Helper functions per Supabase
  // Supporta sia appointmentid (retrocompatibilità) che resource_id (per lead)
  async function checkPushSent(userId, resourceId, notificationType) {
    try {
      // ✅ FIX: Mappa i tipi per controllare entrambi i sistemi
      // Il backend cron job salva come 'post_sale'/'post_nncf', ma il frontend cerca 'sale'/'nncf'
      // Quindi quando il frontend passa 'sale', dobbiamo cercare sia 'sale' che 'post_sale'
      const typesToCheck = [];
      if (notificationType === 'sale') {
        typesToCheck.push('sale', 'post_sale');
      } else if (notificationType === 'nncf') {
        typesToCheck.push('nncf', 'post_nncf');
      } else if (notificationType === 'post_sale') {
        typesToCheck.push('sale', 'post_sale');
      } else if (notificationType === 'post_nncf') {
        typesToCheck.push('nncf', 'post_nncf');
      } else {
        typesToCheck.push(notificationType);
      }
      
      // Cerca sia in appointmentid che resource_id per retrocompatibilità
      // Cerca con tutti i tipi possibili (sale/post_sale o nncf/post_nncf)
      let query = supabase
        .from('push_notifications_sent')
        .select('id')
        .eq('userid', userId)
        .or(`appointmentid.eq.${resourceId},resource_id.eq.${resourceId}`);
      
      // Aggiungi filtro per notification_type usando .in() per cercare tutti i tipi possibili
      if (typesToCheck.length === 1) {
        query = query.eq('notification_type', typesToCheck[0]);
      } else {
        query = query.in('notification_type', typesToCheck);
      }
      
      const { data, error } = await query.maybeSingle(); // Usa maybeSingle per gestire meglio "not found"
      
      if (error) {
        console.error('[Push Tracking] Error checking sent status:', error);
        return false; // Default to false on error
      }
      
      return !!data; // Return true if notification was sent
    } catch (error) {
      console.error('[Push Tracking] Error checking sent status:', error);
      return false; // Default to false on error
    }
  }
  
  async function markPushSent(userId, resourceId, notificationType) {
    try {
      const trackingId = `${resourceId}_${notificationType}`;
      
      const { error } = await supabase
        .from('push_notifications_sent')
        .upsert({
          id: trackingId,
          userid: userId,
          appointmentid: resourceId, // Usa appointmentid per retrocompatibilità (useResourceId=false)
          resource_id: null,
          notification_type: notificationType,
          delivery_status: 'sent', // ✅ AGGIUNTO: Marca come consegnata
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
