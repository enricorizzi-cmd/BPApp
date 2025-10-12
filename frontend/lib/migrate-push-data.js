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
      console.log('[Migrate Push Data] Starting migration...');
      
      // Controlla se ci sono dati da migrare
      const pushKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('bp_push_')) {
          pushKeys.push(key);
        }
      }
      
      if (pushKeys.length === 0) {
        console.log('[Migrate Push Data] No push data to migrate');
        return;
      }
      
      console.log(`[Migrate Push Data] Found ${pushKeys.length} push records to migrate`);
      
      // Migra ogni record
      let migratedCount = 0;
      for (const key of pushKeys) {
        try {
          // Parse key: bp_push_{kind}_{appointmentId}
          const parts = key.split('_');
          if (parts.length >= 4) {
            const kind = parts[2]; // 'sale' or 'nncf'
            const appointmentId = parts.slice(3).join('_'); // In case ID contains underscores
            
            // Verifica se il record esiste già nel database
            const response = await fetch(`/api/push-tracking/check?appointmentId=${appointmentId}&notificationType=${kind}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('bp_token')}`
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              if (!data.sent) {
                // Migra il record
                const migrateResponse = await fetch('/api/push-tracking/mark-sent', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('bp_token')}`
                  },
                  body: JSON.stringify({
                    appointmentId: appointmentId,
                    notificationType: kind
                  })
                });
                
                if (migrateResponse.ok) {
                  migratedCount++;
                  console.log(`[Migrate Push Data] Migrated ${kind} push for appointment ${appointmentId}`);
                } else {
                  console.warn(`[Migrate Push Data] Failed to migrate ${key}:`, await migrateResponse.text());
                }
              } else {
                console.log(`[Migrate Push Data] ${key} already exists in database`);
              }
            } else {
              console.warn(`[Migrate Push Data] Failed to check ${key}:`, await response.text());
            }
          }
        } catch (error) {
          console.warn(`[Migrate Push Data] Error migrating ${key}:`, error);
        }
      }
      
      // Rimuovi i record migrati dal localStorage
      if (migratedCount > 0) {
        for (const key of pushKeys) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            console.warn(`[Migrate Push Data] Failed to remove ${key} from localStorage:`, e);
          }
        }
        console.log(`[Migrate Push Data] Removed ${migratedCount} records from localStorage`);
      }
      
      console.log(`[Migrate Push Data] Migration completed. Migrated ${migratedCount} records`);
      
    } catch (error) {
      console.error('[Migrate Push Data] Migration failed:', error);
    }
  }
})();
