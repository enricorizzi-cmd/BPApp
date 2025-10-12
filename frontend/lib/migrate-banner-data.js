/* BPApp - Migrazione dati banner da localStorage a database
   Questo script migra tutti i dati dei banner post-vendita da localStorage al database Supabase
   per garantire consistenza tra dispositivi diversi.
*/

(function() {
  'use strict';

  // Chiavi localStorage da migrare
  const BANNER_KEYS = {
    // Banner post-vendita principali
    DONE: 'bp_done_',           // bp_done_sale_{id} / bp_done_nncf_{id}
    SNOOZE: 'bp_snooze_',       // bp_snooze_sale_{id} / bp_snooze_nncf_{id}  
    PENDING: 'bp_pending_',     // bp_pending_sale_{id} / bp_pending_nncf_{id}
    
    // Banner NNCF legacy
    SEEN_NNCF: 'bp_seen_nncf_appt',
    
    // Client status banner
    BANNER_SEEN: 'bp_banner_seen'
  };

  const KIND_SALE = 'sale';
  const KIND_NNCF = 'nncf';

  // Helper per leggere localStorage
  function getLocalStorageData() {
    const data = {
      done: {},
      snooze: {},
      pending: {},
      seenNncf: null,
      bannerSeen: {}
    };

    try {
      // Scansiona tutte le chiavi localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        const value = localStorage.getItem(key);

        // Banner done
        if (key.startsWith(BANNER_KEYS.DONE)) {
          const suffix = key.substring(BANNER_KEYS.DONE.length);
          const parts = suffix.split('_');
          if (parts.length >= 2) {
            const kind = parts[0];
            const id = parts.slice(1).join('_');
            if (value === '1') {
              data.done[`${kind}_${id}`] = true;
            }
          }
        }

        // Banner snooze
        if (key.startsWith(BANNER_KEYS.SNOOZE)) {
          const suffix = key.substring(BANNER_KEYS.SNOOZE.length);
          const parts = suffix.split('_');
          if (parts.length >= 2) {
            const kind = parts[0];
            const id = parts.slice(1).join('_');
            try {
              const timestamp = new Date(value);
              if (!isNaN(timestamp.getTime())) {
                data.snooze[`${kind}_${id}`] = timestamp.toISOString();
              }
            } catch (e) {
              console.warn('Invalid snooze timestamp:', key, value);
            }
          }
        }

        // Banner pending
        if (key.startsWith(BANNER_KEYS.PENDING)) {
          const suffix = key.substring(BANNER_KEYS.PENDING.length);
          const parts = suffix.split('_');
          if (parts.length >= 2) {
            const kind = parts[0];
            const id = parts.slice(1).join('_');
            try {
              const timestamp = new Date(value);
              if (!isNaN(timestamp.getTime())) {
                data.pending[`${kind}_${id}`] = timestamp.toISOString();
              }
            } catch (e) {
              console.warn('Invalid pending timestamp:', key, value);
            }
          }
        }

        // NNCF seen
        if (key === BANNER_KEYS.SEEN_NNCF) {
          data.seenNncf = value;
        }

        // Banner seen
        if (key === BANNER_KEYS.BANNER_SEEN) {
          try {
            data.bannerSeen = JSON.parse(value || '{}');
          } catch (e) {
            console.warn('Invalid banner seen data:', value);
          }
        }
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }

    return data;
  }

  // Helper per migrare i dati al database
  async function migrateToDatabase(localData) {
    const updates = [];
    const now = new Date().toISOString();

    try {
      // Ottieni tutti gli appuntamenti per mappare gli ID
      const response = await fetch('/api/appointments', {
        headers: {
          'Authorization': `Bearer ${window.bpAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }

      const result = await response.json();
      const appointments = result.appointments || [];

      // Crea mappa ID -> appuntamento
      const apptMap = {};
      appointments.forEach(appt => {
        if (appt.id) {
          apptMap[appt.id] = appt;
        }
      });

      // Processa banner done -> salePromptAnswered/nncfPromptAnswered
      for (const [key, done] of Object.entries(localData.done)) {
        const [kind, id] = key.split('_', 2);
        const appt = apptMap[id];
        
        if (appt && !appt.salePromptAnswered && !appt.nncfPromptAnswered) {
          const field = kind === KIND_NNCF ? 'nncfPromptAnswered' : 'salePromptAnswered';
          updates.push({
            id: id,
            [field]: true,
            updatedAt: now
          });
        }
      }

      // Processa banner snooze -> salePromptSnoozedUntil/nncfPromptSnoozedUntil
      for (const [key, snoozeUntil] of Object.entries(localData.snooze)) {
        const [kind, id] = key.split('_', 2);
        const appt = apptMap[id];
        
        if (appt) {
          const field = kind === KIND_NNCF ? 'nncfPromptSnoozedUntil' : 'salePromptSnoozedUntil';
          const currentSnooze = appt[field];
          
          // Solo se il nuovo snooze è più recente
          if (!currentSnooze || new Date(snoozeUntil) > new Date(currentSnooze)) {
            updates.push({
              id: id,
              [field]: snoozeUntil,
              updatedAt: now
            });
          }
        }
      }

      // Processa NNCF seen -> nncfPromptAnswered per l'ultimo NNCF
      if (localData.seenNncf) {
        const seenId = localData.seenNncf;
        const appt = apptMap[seenId];
        
        if (appt && appt.nncf && !appt.nncfPromptAnswered) {
          updates.push({
            id: seenId,
            nncfPromptAnswered: true,
            updatedAt: now
          });
        }
      }

      // Processa banner seen -> nncfPromptAnswered per tutti gli appuntamenti visti
      for (const [apptId, seen] of Object.entries(localData.bannerSeen)) {
        if (seen && apptMap[apptId] && apptMap[apptId].nncf && !apptMap[apptId].nncfPromptAnswered) {
          updates.push({
            id: apptId,
            nncfPromptAnswered: true,
            updatedAt: now
          });
        }
      }

      // Applica tutti gli aggiornamenti
      let successCount = 0;
      let errorCount = 0;

      for (const update of updates) {
        try {
          const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${window.bpAuthToken()}`
            },
            body: JSON.stringify(update)
          });

          if (response.ok) {
            successCount++;
          } else {
            console.warn('Failed to update appointment:', update.id, response.status);
            errorCount++;
          }
        } catch (e) {
          console.error('Error updating appointment:', update.id, e);
          errorCount++;
        }
      }

      console.log(`Migration completed: ${successCount} successful, ${errorCount} errors`);

      return {
        success: successCount,
        errors: errorCount,
        total: updates.length
      };

    } catch (e) {
      console.error('Migration failed:', e);
      throw e;
    }
  }

  // Funzione principale di migrazione
  async function migrateBannerData() {
    console.log('Starting banner data migration...');

    try {
      // 1. Leggi dati da localStorage
      const localData = getLocalStorageData();
      console.log('LocalStorage data found:', localData);

      // 2. Migra al database
      const result = await migrateToDatabase(localData);
      console.log('Migration result:', result);

      // 3. Pulisci localStorage dopo migrazione riuscita
      if (result.errors === 0) {
        console.log('Cleaning up localStorage...');
        
        // Rimuovi tutte le chiavi banner
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith(BANNER_KEYS.DONE) ||
            key.startsWith(BANNER_KEYS.SNOOZE) ||
            key.startsWith(BANNER_KEYS.PENDING) ||
            key === BANNER_KEYS.SEEN_NNCF ||
            key === BANNER_KEYS.BANNER_SEEN
          )) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach(key => {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            console.warn('Failed to remove key:', key, e);
          }
        });

        console.log(`Removed ${keysToRemove.length} localStorage keys`);
      }

      return result;

    } catch (e) {
      console.error('Migration failed:', e);
      throw e;
    }
  }

  // Esporta funzione globale
  window.migrateBannerData = migrateBannerData;

  // Auto-migrazione al caricamento se non già fatto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Controlla se esiste già un flag di migrazione
      if (!localStorage.getItem('bp_banner_migration_done')) {
        migrateBannerData().then(() => {
          localStorage.setItem('bp_banner_migration_done', '1');
        }).catch(e => {
          console.error('Auto-migration failed:', e);
        });
      }
    });
  } else {
    // Document già caricato
    if (!localStorage.getItem('bp_banner_migration_done')) {
      migrateBannerData().then(() => {
        localStorage.setItem('bp_banner_migration_done', '1');
      }).catch(e => {
        console.error('Auto-migration failed:', e);
      });
    }
  }

})();
