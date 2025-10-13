/* BPApp - Cycle Notification Tracking
   Gestisce il tracking persistente delle notifiche di scadenza cicli per evitare duplicati
*/

module.exports = function({ supabase }) {
  
  // Verifica se una notifica per un ciclo è già stata inviata
  async function checkCycleNotificationSent(cycleId, deadline) {
    try {
      const { data, error } = await supabase
        .from('cycle_notifications_sent')
        .select('id')
        .eq('cycle_id', cycleId)
        .eq('deadline', deadline)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }
      
      return !!data; // Return true if notification was sent
    } catch (error) {
      console.error('[Cycle Tracking] Error checking sent status:', error);
      // SICUREZZA: In caso di errore, assumiamo che sia già stata inviata per evitare duplicati
      return true; // Fail-safe: meglio non inviare che inviare duplicati
    }
  }
  
  // Marca una notifica per un ciclo come inviata
  async function markCycleNotificationSent(cycleId, deadline, consultantId) {
    try {
      const { error } = await supabase
        .from('cycle_notifications_sent')
        .upsert({
          id: `cycle_${cycleId}_${deadline}`,
          cycle_id: cycleId,
          deadline: deadline,
          consultant_id: consultantId,
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
      console.error('[Cycle Tracking] Error marking as sent:', error);
      // SICUREZZA: Anche se il tracking fallisce, la notifica è già stata inviata
      // Il sistema continuerà a funzionare, ma potrebbe inviare duplicati in caso di restart
      return false; // Indica che il tracking è fallito
    }
  }
  
  // Ottieni tutte le notifiche inviate per un consulente (per debug)
  async function getCycleNotificationsHistory(consultantId) {
    try {
      const { data, error } = await supabase
        .from('cycle_notifications_sent')
        .select('*')
        .eq('consultant_id', consultantId)
        .order('sent_at', { ascending: false })
        .limit(50);
      
      if (error) {
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('[Cycle Tracking] Error loading history:', error);
      return [];
    }
  }
  
  return {
    checkCycleNotificationSent,
    markCycleNotificationSent,
    getCycleNotificationsHistory
  };
};
