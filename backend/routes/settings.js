const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO }) {
  
  // ===== IMPOSTAZIONI CLASSIFICHE =====
  
  // GET - Carica impostazioni classifiche
  router.get('/classifications', auth, async (req, res) => {
    try {
      const settings = await readJSON('settings.json');
      const weights = settings.classifications?.weights || {
        vss: 1.0,
        vsd: 2.0,
        telefonate: 0.1,
        appuntamenti: 0.5
      };
      
      res.json({ weights });
    } catch (error) {
      console.error('[Settings] Error loading classifications:', error);
      res.json({ weights: {
        vss: 1.0,
        vsd: 2.0,
        telefonate: 0.1,
        appuntamenti: 0.5
      }});
    }
  });
  
  // POST - Salva impostazioni classifiche
  router.post('/classifications', auth, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      
      const { weights } = req.body;
      if (!weights) {
        return res.status(400).json({ error: 'Weights required' });
      }
      
      let settings = {};
      try {
        settings = await readJSON('settings.json');
      } catch (e) {
        settings = {};
      }
      
      settings.classifications = { weights };
      await writeJSON('settings.json', settings);
      
      res.json({ ok: true });
    } catch (error) {
      console.error('[Settings] Error saving classifications:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  });
  
  // ===== IMPOSTAZIONI PROVVIGIONI =====
  
  // GET - Carica impostazioni provvigioni
  router.get('/commissions', auth, async (req, res) => {
    try {
      const settings = await readJSON('settings.json');
      const commissions = settings.commissions || {
        senior_vss: 5.0,
        senior_vsd: 8.0,
        junior_vss: 3.0,
        junior_vsd: 5.0
      };
      
      res.json({ commissions });
    } catch (error) {
      console.error('[Settings] Error loading commissions:', error);
      res.json({ commissions: {
        senior_vss: 5.0,
        senior_vsd: 8.0,
        junior_vss: 3.0,
        junior_vsd: 5.0
      }});
    }
  });
  
  // POST - Salva impostazioni provvigioni
  router.post('/commissions', auth, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      
      const { commissions } = req.body;
      if (!commissions) {
        return res.status(400).json({ error: 'Commissions required' });
      }
      
      let settings = {};
      try {
        settings = await readJSON('settings.json');
      } catch (e) {
        settings = {};
      }
      
      settings.commissions = commissions;
      await writeJSON('settings.json', settings);
      
      res.json({ ok: true });
    } catch (error) {
      console.error('[Settings] Error saving commissions:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  });
  
  // ===== NOTIFICHE SISTEMA =====
  
  // GET - Carica notifiche sistema
  router.get('/system-notifications', auth, async (req, res) => {
    try {
      const settings = await readJSON('settings.json');
      const notifications = settings.systemNotifications || {
        'weekend-reminder': 'Completa il BP della settimana',
        'post-appointment': 'Hai venduto a {client}? Appuntamento del {date}'
      };
      
      res.json({ notifications });
    } catch (error) {
      console.error('[Settings] Error loading system notifications:', error);
      res.json({ notifications: {
        'weekend-reminder': 'Completa il BP della settimana',
        'post-appointment': 'Hai venduto a {client}? Appuntamento del {date}'
      }});
    }
  });
  
  // POST - Salva notifiche sistema
  router.post('/system-notifications', auth, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      
      const { type, text } = req.body;
      if (!type || !text) {
        return res.status(400).json({ error: 'Type and text required' });
      }
      
      let settings = {};
      try {
        settings = await readJSON('settings.json');
      } catch (e) {
        settings = {};
      }
      
      if (!settings.systemNotifications) {
        settings.systemNotifications = {};
      }
      
      settings.systemNotifications[type] = text;
      await writeJSON('settings.json', settings);
      
      res.json({ ok: true });
    } catch (error) {
      console.error('[Settings] Error saving system notification:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  });
  
  return router;
};
