const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase }) {
  
  // Helper functions per Supabase
  async function getSettingsFromSupabase() {
    try {
      const { data, error } = await supabase.from('settings').select('data').eq('id', 'main').single();
      if (error) throw error;
      return data?.data || {};
    } catch (error) {
      console.error('[Settings] Error reading from Supabase:', error);
      return {};
    }
  }
  
  async function saveSettingsToSupabase(settingsData) {
    try {
      const { error } = await supabase.from('settings').upsert({
        id: 'main',
        data: settingsData,
        updatedat: new Date().toISOString()
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[Settings] Error saving to Supabase:', error);
      throw error;
    }
  }
  
  // ===== IMPOSTAZIONI CLASSIFICHE =====
  
  // GET - Carica impostazioni classifiche
  router.get('/classifications', auth, async (req, res) => {
    try {
      const settings = await getSettingsFromSupabase();
      const weights = settings.weights || {
        VSS: 1.0,
        VSDPersonale: 2.0,
        VSDIndiretto: 1.5,
        GI: 1.8,
        Telefonate: 0.1,
        AppFissati: 0.5,
        AppFatti: 0.8,
        CorsiLeadership: 0.3,
        iProfile: 0.2,
        MBS: 0.4,
        NNCF: 0.6
      };
      
      res.json({ weights });
    } catch (error) {
      console.error('[Settings] Error loading classifications:', error);
      res.json({ weights: {
        VSS: 1.0,
        VSDPersonale: 2.0,
        VSDIndiretto: 1.5,
        GI: 1.8,
        Telefonate: 0.1,
        AppFissati: 0.5,
        AppFatti: 0.8,
        CorsiLeadership: 0.3,
        iProfile: 0.2,
        MBS: 0.4,
        NNCF: 0.6
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
      
      let settings = await getSettingsFromSupabase();
      settings.weights = weights;
      await saveSettingsToSupabase(settings);
      
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
      const settings = await getSettingsFromSupabase();
      const commissions = settings.commissions || {
        gi: 0.15,
        vsdJunior: 0.20,
        vsdSenior: 0.25
      };
      
      res.json({ commissions });
    } catch (error) {
      console.error('[Settings] Error loading commissions:', error);
      res.json({ commissions: {
        gi: 0.15,
        vsdJunior: 0.20,
        vsdSenior: 0.25
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
      
      let settings = await getSettingsFromSupabase();
      settings.commissions = commissions;
      await saveSettingsToSupabase(settings);
      
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
