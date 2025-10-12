/* BPApp – Test Banner Persistence
   Test per verificare che i banner non si ripresentino dopo risposta
*/

(function() {
  'use strict';
  
  // Abilita debug per i banner
  window.DEBUG_BANNERS = true;
  
  // Test function
  window.testBannerPersistence = async function() {
    console.log('[Test Banner Persistence] Starting test...');
    
    try {
      // 1. Carica gli appuntamenti
      const response = await fetch('/api/appointments', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('bp_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const appointments = data.appointments || [];
      
      console.log(`[Test] Found ${appointments.length} appointments`);
      
      // 2. Trova appuntamenti di vendita recenti
      const now = Date.now();
      const venditaAppointments = appointments.filter(apt => {
        const end = +new Date(apt.end || apt.start || 0);
        const isVendita = String(apt.type || '').toLowerCase() === 'vendita';
        const isRecent = end > (now - 7 * 24 * 60 * 60 * 1000); // Ultimi 7 giorni
        return isVendita && isRecent && end < now;
      });
      
      console.log(`[Test] Found ${venditaAppointments.length} recent vendita appointments`);
      
      // 3. Verifica stato dei banner
      venditaAppointments.forEach(apt => {
        console.log(`[Test] Appointment ${apt.id}:`, {
          client: apt.client,
          type: apt.type,
          end: apt.end,
          nncf: apt.nncf,
          nncfPromptAnswered: apt.nncfPromptAnswered,
          salePromptAnswered: apt.salePromptAnswered,
          salePromptSnoozedUntil: apt.salePromptSnoozedUntil,
          nncfPromptSnoozedUntil: apt.nncfPromptSnoozedUntil
        });
      });
      
      // 4. Test di risposta banner
      if (venditaAppointments.length > 0) {
        const testAppt = venditaAppointments[0];
        console.log(`[Test] Testing banner response for appointment ${testAppt.id}`);
        
        // Simula risposta al banner
        const updateResponse = await fetch('/api/appointments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('bp_token')}`
          },
          body: JSON.stringify({
            id: testAppt.id,
            salePromptAnswered: true
          })
        });
        
        if (updateResponse.ok) {
          console.log('[Test] Banner response saved successfully');
          
          // Verifica che sia stato salvato
          const verifyResponse = await fetch('/api/appointments', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('bp_token')}`
            }
          });
          
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            const updatedAppt = verifyData.appointments.find(a => a.id === testAppt.id);
            
            if (updatedAppt && updatedAppt.salePromptAnswered) {
              console.log('[Test] ✅ Banner persistence verified');
            } else {
              console.log('[Test] ❌ Banner persistence failed');
            }
          }
        } else {
          console.log('[Test] ❌ Failed to save banner response');
        }
      }
      
    } catch (error) {
      console.error('[Test] Error:', error);
    }
  };
  
  // Auto-run test se richiesto
  if (window.location.search.includes('test-banners')) {
    setTimeout(() => {
      window.testBannerPersistence();
    }, 2000);
  }
  
})();
