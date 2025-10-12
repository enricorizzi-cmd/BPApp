/* BPApp – Debug Banner State
   Script per debuggare lo stato dei banner e verificare che non si ripresentino
*/

(function() {
  'use strict';
  
  // Debug disabilitato per produzione
  window.DEBUG_BANNERS = false;
  
  // Debug function
  window.debugBannerState = async function() {
    console.log('[Debug Banner State] Starting debug...');
    
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
      
      console.log(`[Debug] Found ${appointments.length} appointments`);
      
      // 2. Trova appuntamenti di vendita recenti
      const now = Date.now();
      const venditaAppointments = appointments.filter(apt => {
        const end = +new Date(apt.end || apt.start || 0);
        const isVendita = String(apt.type || '').toLowerCase() === 'vendita';
        const isRecent = end > (now - 7 * 24 * 60 * 60 * 1000); // Ultimi 7 giorni
        return isVendita && isRecent && end < now;
      });
      
      console.log(`[Debug] Found ${venditaAppointments.length} recent vendita appointments`);
      
      // 3. Verifica stato dei banner per ogni appuntamento
      venditaAppointments.forEach(apt => {
        const end = +new Date(apt.end || apt.start || 0);
        const bannerDelayMs = 1 * 60 * 1000; // 1 minuto
        const shouldShowBanner = end < (now - bannerDelayMs);
        
        console.log(`[Debug] Appointment ${apt.id}:`, {
          client: apt.client,
          type: apt.type,
          end: apt.end,
          nncf: apt.nncf,
          nncfPromptAnswered: apt.nncfPromptAnswered,
          salePromptAnswered: apt.salePromptAnswered,
          salePromptSnoozedUntil: apt.salePromptSnoozedUntil,
          nncfPromptSnoozedUntil: apt.nncfPromptSnoozedUntil,
          shouldShowBanner: shouldShowBanner,
          bannerState: {
            saleAnswered: !!apt.salePromptAnswered,
            saleSnoozed: apt.salePromptSnoozedUntil ? new Date(apt.salePromptSnoozedUntil).getTime() > now : false,
            nncfAnswered: !!apt.nncfPromptAnswered,
            nncfSnoozed: apt.nncfPromptSnoozedUntil ? new Date(apt.nncfPromptSnoozedUntil).getTime() > now : false
          }
        });
      });
      
      // 4. Test di aggiornamento banner
      if (venditaAppointments.length > 0) {
        const testAppt = venditaAppointments[0];
        console.log(`[Debug] Testing banner update for appointment ${testAppt.id}`);
        
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
          console.log('[Debug] ✅ Banner response saved successfully');
          
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
              console.log('[Debug] ✅ Banner persistence verified');
              console.log('[Debug] Updated appointment:', updatedAppt);
            } else {
              console.log('[Debug] ❌ Banner persistence failed');
              console.log('[Debug] Updated appointment:', updatedAppt);
            }
          }
        } else {
          console.log('[Debug] ❌ Failed to save banner response:', await updateResponse.text());
        }
      }
      
    } catch (error) {
      console.error('[Debug] Error:', error);
    }
  };
  
  // Auto-run debug se richiesto
  if (window.location.search.includes('debug-banners')) {
    setTimeout(() => {
      window.debugBannerState();
    }, 2000);
  }
  
})();
