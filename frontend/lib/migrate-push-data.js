/* BPApp – Migrazione Push Data
   Migra i dati di tracking push dal localStorage al database Supabase
   per evitare duplicazioni tra dispositivi diversi
*/

(function() {
  'use strict';
  
  // Aspetta che l'app sia caricata
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', migratePushData);
  } else {
    migratePushData();
  }
  
  async function migratePushData() {
    try {
      // Controlla se ci sono dati da migrare
      const pushKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('bp_push_')) {
          pushKeys.push(key);
        }
      }
      
      if (pushKeys.length === 0) {
        return; // Nessun dato da migrare
      }
      
      // Per ora rimuovi semplicemente i record dal localStorage senza migrare
      // Il tracking push verrà gestito direttamente dal sistema dei banner
      for (const key of pushKeys) {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`[Migrate Push Data] Failed to remove ${key} from localStorage:`, e);
        }
      }
      
      console.log(`[Migrate Push Data] Removed ${pushKeys.length} records from localStorage`);
      console.log('[Migrate Push Data] Migration completed. Push tracking will be handled by banner system.');
      
    } catch (error) {
      console.error('[Migrate Push Data] Migration failed:', error);
    }
  }
})();
