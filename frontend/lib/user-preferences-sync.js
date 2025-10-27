/* BPApp – User Preferences Sync
   Sincronizza le preferenze utente tra dispositivi usando il database Supabase
   Sostituisce l'uso di localStorage per dati che devono essere consistenti
*/

(function() {
  'use strict';
  
  const NS = (window.BP = window.BP || {});
  const UPS = (NS.UserPreferencesSync = NS.UserPreferencesSync || {});
  
  // Cache locale per evitare chiamate API frequenti
  let _preferencesCache = null;
  let _lastSync = 0;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minuti
  
  // Helper per chiamate API
  async function apiCall(method, url, data = null) {
    try {
      // Usa lo stesso sistema di getToken() per coerenza
      const token = localStorage.getItem('bp_token') || sessionStorage.getItem('bp_token') || '';
      
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      // Aggiungi Authorization solo se c'è un token
      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
      
      if (data) {
        options.body = JSON.stringify(data);
      }
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[User Preferences Sync] API call failed:', error);
      throw error;
    }
  }
  
  // Carica le preferenze dal database
  async function loadPreferences() {
    try {
      const now = Date.now();
      
      // Usa cache se ancora valida
      if (_preferencesCache && (now - _lastSync) < CACHE_DURATION) {
        return _preferencesCache;
      }
      
      const data = await apiCall('GET', '/api/user-preferences');
      _preferencesCache = data.preferences;
      _lastSync = now;
      
      return _preferencesCache;
    } catch (error) {
      // Se è un errore 401, non loggare (utente non autenticato è normale)
      if (error.message && error.message.includes('401')) {
        console.log('[User Preferences Sync] No authenticated user (expected)');
      } else {
        console.error('[User Preferences Sync] Failed to load preferences:', error);
      }
      
      // Fallback alle preferenze di default
      return {
        profile: {
          name: '',
          role: 'consultant',
          grade: 'junior'
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
    }
  }
  
  // Salva le preferenze nel database
  async function savePreferences(preferences) {
    try {
      await apiCall('POST', '/api/user-preferences', { preferences });
      
      // Aggiorna cache locale
      _preferencesCache = preferences;
      _lastSync = Date.now();
      
      return true;
    } catch (error) {
      console.error('[User Preferences Sync] Failed to save preferences:', error);
      return false;
    }
  }
  
  // Aggiorna solo una sezione delle preferenze
  async function updateSection(section, data) {
    try {
      await apiCall('PATCH', '/api/user-preferences', { section, data });
      
      // Aggiorna cache locale
      if (_preferencesCache) {
        _preferencesCache[section] = {
          ..._preferencesCache[section],
          ...data
        };
        _lastSync = Date.now();
      }
      
      return true;
    } catch (error) {
      console.error('[User Preferences Sync] Failed to update section:', error);
      return false;
    }
  }
  
  // Ottieni una preferenza specifica
  async function getPreference(path) {
    const preferences = await loadPreferences();
    
    // Supporta path come 'ui.sidebarCollapsed' o 'profile.name'
    const keys = path.split('.');
    let value = preferences;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  }
  
  // Imposta una preferenza specifica
  async function setPreference(path, value) {
    const keys = path.split('.');
    const preferences = await loadPreferences();
    
    // Naviga fino al penultimo livello
    let current = preferences;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Imposta il valore finale
    current[keys[keys.length - 1]] = value;
    
    return await savePreferences(preferences);
  }
  
  // Migra dati esistenti da localStorage
  async function migrateFromLocalStorage() {
    try {
      console.log('[User Preferences Sync] Starting migration from localStorage...');
      
      const preferences = await loadPreferences();
      let hasChanges = false;
      
      // Migra preferenze UI
      const sidebarCollapsed = localStorage.getItem('bp_sidebar_collapsed');
      if (sidebarCollapsed !== null && preferences.ui.sidebarCollapsed === false) {
        preferences.ui.sidebarCollapsed = sidebarCollapsed === 'true';
        hasChanges = true;
        localStorage.removeItem('bp_sidebar_collapsed');
      }
      
      const defaultPeriod = localStorage.getItem('bp_default_period');
      if (defaultPeriod && preferences.ui.defaultPeriod === 'mensile') {
        preferences.ui.defaultPeriod = defaultPeriod;
        hasChanges = true;
        localStorage.removeItem('bp_default_period');
      }
      
      const theme = localStorage.getItem('bp_theme');
      if (theme && preferences.ui.theme === 'auto') {
        preferences.ui.theme = theme;
        hasChanges = true;
        localStorage.removeItem('bp_theme');
      }
      
      // Migra preferenze notifiche
      const notificationsEnabled = localStorage.getItem('bp_notifications_enabled');
      if (notificationsEnabled !== null && preferences.notifications.enabled === true) {
        preferences.notifications.enabled = notificationsEnabled === 'true';
        hasChanges = true;
        localStorage.removeItem('bp_notifications_enabled');
      }
      
      const pushEnabled = localStorage.getItem('bp_push_enabled');
      if (pushEnabled !== null && preferences.notifications.pushEnabled === true) {
        preferences.notifications.pushEnabled = pushEnabled === 'true';
        hasChanges = true;
        localStorage.removeItem('bp_push_enabled');
      }
      
      // Migra preferenze lavoro
      const timezone = localStorage.getItem('bp_timezone');
      if (timezone && preferences.work.timezone === 'Europe/Rome') {
        preferences.work.timezone = timezone;
        hasChanges = true;
        localStorage.removeItem('bp_timezone');
      }
      
      if (hasChanges) {
        await savePreferences(preferences);
        console.log('[User Preferences Sync] Migration completed successfully');
      } else {
        console.log('[User Preferences Sync] No data to migrate');
      }
      
    } catch (error) {
      console.error('[User Preferences Sync] Migration failed:', error);
    }
  }
  
  // API pubblica
  UPS.load = loadPreferences;
  UPS.save = savePreferences;
  UPS.updateSection = updateSection;
  UPS.get = getPreference;
  UPS.set = setPreference;
  UPS.migrate = migrateFromLocalStorage;
  
  // Avvia migrazione automatica all'inizializzazione
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', migrateFromLocalStorage);
  } else {
    migrateFromLocalStorage();
  }
  
})();
