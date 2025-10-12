const express = require('express');
const router = express.Router();

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase }) {
  
  // Helper functions per Supabase
  async function getUserPreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('userid', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }
      
      return data ? data.preferences : null;
    } catch (error) {
      console.error('[User Preferences] Error getting preferences:', error);
      return null;
    }
  }
  
  async function updateUserPreferences(userId, preferences) {
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          id: `pref_${userId}`,
          userid: userId,
          preferences: preferences,
          updatedat: new Date().toISOString()
        });
      
      if (error) {
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('[User Preferences] Error updating preferences:', error);
      return false;
    }
  }
  
  // GET - Ottieni le preferenze utente
  router.get('/', auth, async (req, res) => {
    try {
      const preferences = await getUserPreferences(req.user.id);
      
      if (preferences) {
        res.json({ preferences });
      } else {
        // Restituisci preferenze di default se non esistono
        const defaultPreferences = {
          profile: {
            name: req.user.name,
            role: req.user.role,
            grade: req.user.grade
          },
          ui: {
            sidebarCollapsed: false,
            defaultPeriod: 'mensile',
            theme: 'auto'
          },
          notifications: {
            enabled: true,
            pushEnabled: true,
            emailEnabled: true
          },
          work: {
            timezone: 'Europe/Rome',
            workingHours: {
              start: '09:00',
              end: '18:00'
            }
          }
        };
        
        res.json({ preferences: defaultPreferences });
      }
    } catch (error) {
      console.error('[User Preferences] Error in GET endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST - Aggiorna le preferenze utente
  router.post('/', auth, async (req, res) => {
    try {
      const { preferences } = req.body;
      
      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ error: 'Invalid preferences object' });
      }
      
      const success = await updateUserPreferences(req.user.id, preferences);
      
      if (success) {
        res.json({ ok: true });
      } else {
        res.status(500).json({ error: 'Failed to update preferences' });
      }
    } catch (error) {
      console.error('[User Preferences] Error in POST endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PATCH - Aggiorna solo una sezione delle preferenze
  router.patch('/', auth, async (req, res) => {
    try {
      const { section, data } = req.body;
      
      if (!section || !data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid section or data' });
      }
      
      // Ottieni le preferenze attuali
      const currentPreferences = await getUserPreferences(req.user.id) || {};
      
      // Aggiorna solo la sezione specificata
      const updatedPreferences = {
        ...currentPreferences,
        [section]: {
          ...currentPreferences[section],
          ...data
        }
      };
      
      const success = await updateUserPreferences(req.user.id, updatedPreferences);
      
      if (success) {
        res.json({ ok: true });
      } else {
        res.status(500).json({ error: 'Failed to update preferences' });
      }
    } catch (error) {
      console.error('[User Preferences] Error in PATCH endpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  return router;
};
