;(function(global){
  function initPostSaleBanners(hapticImpact){
  // Prevent double initialization (duplicate imports/calls)
  try{ if (global.__postSaleBannersInitialized) return; global.__postSaleBannersInitialized = true; dbg('init'); }catch(_){ }
  // --- Parametri ---
  const LOOKBACK_DAYS = window.BANNERS_LOOKBACK_DAYS || 7; // ultimi N giorni
  const KIND_NNCF = 'nncf';
  const KIND_SALE = 'sale';
  const BANNER_DELAY_MINUTES = 0; // Banner appare immediatamente dopo la fine dell'appuntamento (sincronizzato con notifiche push)
  
  // ✅ Cache per ridurre query API (5 minuti)
  let _lastScanTime = 0;
  let _lastScanData = null;
  const SCAN_CACHE_MS = 5 * 60 * 1000; // 5 minuti
  
  // ✅ Interval per scan periodico (cleanup su navigazione)
  let scanInterval = null;

  // --- Ephemeral pending markers to avoid duplicate queueing within short window ---
  const _pending = new Set();
  const isPending   = (id,kind)=> {
    const k = `${kind}:${id}`;
    return _pending.has(k);
  };
  const markPending = (id,kind,mins=5)=>{
    const k = `${kind}:${id}`;
    _pending.add(k);
    // Auto-clear after specified minutes
    setTimeout(() => {
      _pending.delete(k);
    }, Math.max(1, Number(mins) || 5) * 60 * 1000);
  };
  const clearPending = (id,kind)=>{
    const k = `${kind}:${id}`; 
    _pending.delete(k);
  };

  // --- Push markers (avoid duplicate push per appointment/kind) ---
  const pushSent = async (id, kind) => {
    try {
      const response = await GET(`/api/push-tracking/check?appointmentId=${id}&notificationType=${kind}`);
      return response.sent || false;
    } catch (e) {
      console.warn('[Push Tracking] Error checking sent status:', e);
      return false; // Default to false on error
    }
  };
  
  const markPush = async (id, kind) => {
    try {
      await POST('/api/push-tracking/mark-sent', { 
        appointmentId: id, 
        notificationType: kind 
      });
      dbg('Push marked as sent', id, kind);
    } catch (e) {
      console.warn('[Push Tracking] Error marking as sent:', e);
    }
  };

  // --- Safe utils / shims già presenti altrove ---
  const GET  = (window.BPFinal && BPFinal.GET)  || window.GET;
  const POST = (window.BPFinal && BPFinal.POST) || window.POST;
  const toast = window.toast || (m=>alert(m));
  // Debug logging, gated by window.DEBUG_BANNERS (default: off)
  function dbg(){
    try{ if (!window || window.DEBUG_BANNERS !== true) return; }catch(_){ return; }
    try{
      if (window.logger && typeof window.logger.debug==='function'){
        window.logger.debug('[banners]', ...arguments);
      } else {
        console.debug('[banners]', ...arguments);
      }
    }catch(_){ }
  }

  function htmlEscape(s){ return String(s||'').replace(/[&<>\"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  // --- Trigger a Web Push when a banner would appear (once per appt/kind) ---
  async function triggerPush(kind, appt){
    try{
      dbg('triggerPush called for', kind, appt.id, appt.client);
      if(!POST || !appt || !appt.id) {
        dbg('triggerPush early return - missing POST/appt/id');
        return;
      }
      
      // ✅ FIX: Rimossi controlli isBannerAnswered e isBannerSnoozed perché vengono già fatti
      // PRIMA di chiamare triggerPush() nella funzione scan(). Questi controlli causavano
      // il problema: se l'utente rispondeva velocemente al banner, triggerPush() poteva
      // trovare il banner già risposto e saltare la push, anche se la push doveva essere
      // inviata PRIMA che il banner apparisse.
      
      // Controlla solo se push già inviata per evitare duplicati
      if(await pushSent(appt.id, kind)) {
        dbg('triggerPush early return - already sent');
        return;
      }
      const when = new Date(appt.end || appt.start || Date.now()).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
      const title = 'Battle Plan';
      const body  = (kind==='nncf')
        ? `Ehi, ${String(appt.client||'')} è diventato cliente? Appuntamento del ${when}`
        : `Allora, hai venduto a ${String(appt.client||'Cliente')}? Appuntamento del ${when}`;
      const payload = { title, body, tag: (kind==='nncf' ? 'bp-nncf' : 'bp-sale'), url: '/' };
      dbg('Sending push notification:', payload);
      // Usa l'endpoint delle notifiche manuali per funzionare anche con app chiusa
      // INVIA SOLO AL CONSULENTE CHE HA CREATO L'APPUNTAMENTO
      const consultantId = appt.userId || appt.consultantId || (window.getUser ? window.getUser().id : null);
      
      // Log per audit sicurezza
      console.log(`[BANNER] Processing: ${kind}, Appt: ${appt.id}, Client: ${appt.client}, ConsultantId: ${consultantId}`);
      
      // SICUREZZA: Se consultantId non è disponibile, non inviare nulla
      if (!consultantId) {
        console.warn('[BANNER] No consultantId available, skipping notification for appt:', appt.id);
        await markPush(appt.id, kind);
        return;
      }
      
      const result = await POST('/api/notifications/send', { 
        text: body, 
        recipients: [consultantId], // ← SICURO: sempre array specifico
        type: 'automatic',
        resourceId: appt.id, // ✅ AGGIUNTO: Passa appointmentId per tracking
        appointmentId: appt.id // ✅ AGGIUNTO: Alias per retrocompatibilità
      });
      
      // ✅ OTTIMIZZAZIONE: Marca come inviata solo se invio riuscito
      if (result && result.ok && result.sent > 0) {
        await markPush(appt.id, kind);
        dbg('Push notification sent successfully, marked as sent');
      } else {
        dbg('Push notification failed or no subscriptions, not marking as sent');
      }
    }catch(e){ 
      dbg('Error in triggerPush:', e);
    }
  }

  // --- Coda banner (riuso se già definita) ---
  function ensureBannerCSS(){
    if (document.getElementById('bp-banner-css')) return;
    const css = `
      #bp_banner_host{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;justify-content:center;pointer-events:none}
      .bp-banner-card{pointer-events:auto;width:100%;max-width:720px;background:var(--card,#fff);color:var(--text,#111);
        border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.28);padding:12px;display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s}
      .bp-banner-card.show{opacity:1;transform:none}
      .bp-banner-card .msg{flex:1}.bp-banner-card .row{display:flex;gap:8px;align-items:center}
      .bp-banner-card .ghost{background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.12)}
      @media (prefers-color-scheme: dark){ .bp-banner-card{background:rgba(15,18,28,.96);color:#fff;border-color:rgba(255,255,255,.16)}
        .bp-banner-card .ghost{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.18)}}
    `;
    const st=document.createElement('style'); st.id='bp-banner-css'; st.textContent=css; document.head.appendChild(st);
  }
  function getBannerHost(){ let h=document.getElementById('bp_banner_host'); if(!h){ h=document.createElement('div'); h.id='bp_banner_host'; document.body.appendChild(h);} return h; }
  let _q=[], _showing=false;
  function enqueueBanner(render){ 
    _q.push(render); 
    pump(); 
  }
  function pump(){
    if(_showing) return; const next=_q.shift(); if(!next) return; _showing=true; ensureBannerCSS(); const host=getBannerHost(); host.innerHTML='';
    
    // Definisci close PRIMA di usarla per evitare problemi di scope
    function close(){ 
      try {
        host.innerHTML=''; 
        _showing=false; 
        setTimeout(pump,40); 
      } catch(e) {
        console.error('[BANNER_CLOSE] Error closing banner:', e);
        _showing=false;
      }
    }
    
    const card = next(close); 
    host.appendChild(card); 
    requestAnimationFrame(()=> card.classList.add('show'));
  }

  // --- Client status helpers ---
  async function updateClientStatusByName(name, status){
    if(!name) return;
    const r = await GET('/api/clients');
    const list=(r&&r.clients)||[];
    const it = list.find(c=> String(c.name||'').trim().toLowerCase() === String(name).trim().toLowerCase());
    if (!it) return;
    await POST('/api/clients', { id: it.id, status });
  }

  // --- Resolve clientId by name (best-effort) ---
  async function findClientIdByName(name){
    try{
      if(!name) return null;
      const r = await GET('/api/clients');
      const list=(r&&r.clients)||[];
      const key = String(name||'').trim().toLowerCase();
      const it = list.find(c=> String(c.name||'').trim().toLowerCase() === key);
      return it ? it.id : null;
    }catch(_){ return null; }
  }

  // --- Apertura affidabile del builder pagamenti GI ---
  function tryOpenGiBuilder(id){
    if (!id) return;
    try{
      // Se esiste un helper globale, usalo
      if (typeof window.openPaymentBuilderById === 'function') { 
        window.openPaymentBuilderById(id); 
        return; 
      }
      if (typeof window.gotoGIAndOpenBuilder === 'function') { 
        window.gotoGIAndOpenBuilder(id); 
        return; 
      }

      // Se siamo già nella vista GI, apri subito
      if (document.querySelector('#gi_rows')){
        document.dispatchEvent(new CustomEvent('gi:edit', { detail: { id } }));
        return;
      }

      // Prova a navigare alla vista GI e poi apri
      if (typeof window.viewGI === 'function'){
        try{ window.viewGI(); }catch(_){ }
        let tries = 0;
        (function waitAndOpen(){
          const ok = document.getElementById('gi_rows');
          if (ok || tries>40){
            try{ document.dispatchEvent(new CustomEvent('gi:edit', { detail: { id } })); }catch(_){ }
            return;
          }
          tries++; 
          setTimeout(waitAndOpen, 100);
        })();
      }
    }catch(e){ 
      logger.error(e); 
    }

    // Fallback assoluto: invia comunque l'evento
    try {
      document.dispatchEvent(new CustomEvent('gi:edit', { detail: { id } }));
    } catch(e) { 
      // Ignora errori fallback
    }
  }

  // --- Quick editor VSS (solo quel campo) ---
  function openVSSQuickEditor(appt, opts){
    const initial = Number(appt.vss || appt.vsdPersonal || 0) || 0;
    const name = appt.client || 'Cliente';
    const panelHTML = `
      <div class="card" style="min-width:min(380px,96vw);max-width:480px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>VSS per ${htmlEscape(name)}</b>
          <button class="ghost" id="vss_x">Chiudi</button>
        </div>
        <div class="row" style="margin-top:8px;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div style="min-width:200px">
            <label>Valore VSS</label>
            <input id="vss_val" type="number" step="1" value="${initial}">
          </div>
          <div class="muted small">Modifica consentita solo per VSS</div>
        </div>
        <div class="right" style="margin-top:12px">
          <button id="vss_ok">Salva</button>
        </div>
      </div>`;

    // Preferisci l'overlay globale (centrata). Fallback: modal inline.
    if (typeof window.showOverlay === 'function' && typeof window.hideOverlay === 'function'){
      showOverlay(panelHTML);
      const panel = document.getElementById('bp-overlay-panel') || document.body;
      const q = (s)=> panel.querySelector(s);
      
      // Definisci close con try-catch per evitare errori
      const close = ()=>{ 
        try{ 
          hideOverlay();
        }catch(e){ 
          console.error('[VSS_CLOSE] Error closing VSS overlay:', e);
        } 
      };
      
      q('#vss_x').onclick = close;
      q('#vss_ok').onclick = async ()=>{
        try{
          const v = Math.max(0, Number(q('#vss_val').value||0));
          await POST('/api/appointments', { id: appt.id, vss: v });
          
          // Feedback utente con controlli di sicurezza
          if (typeof hapticImpact === 'function') {
            hapticImpact('medium');
          }
          if (typeof toast === 'function') {
            toast('Appuntamento aggiornato');
          }
          
          if (typeof close === 'function') {
            close();
          }

          if (v>0){
            try{
              const sale = await upsertGIFromAppointment(appt, v);
              console.log('[BANNER_GI] Sale response:', sale);
              dbg('[BANNER_GI] Sale response:', sale);
              if (sale && (sale.id || sale._id)){
                const id = sale.id || sale._id;
                console.log('[BANNER_GI] Opening builder for sale ID:', id);
                dbg('[BANNER_GI] Opening builder for sale ID:', id);
                // ✅ FIX: Aggiungi un piccolo delay per permettere a Supabase di propagare i dati
                setTimeout(() => {
                  tryOpenGiBuilder(id);
                }, 300);
                
                // ✅ MIGLIORATO: Mostra warning se c'è stato un problema (ma salvato in fallback)
                if (sale.warning) {
                  console.warn('[BANNER_GI] Warning:', sale.warning);
                  if (typeof toast === 'function') {
                    toast(sale.warning + (sale.error ? `: ${sale.error}` : ''));
                  }
                }
              } else {
                console.warn('[BANNER_GI] No sale ID found in response:', sale);
                dbg('[BANNER_GI] Cannot open builder - missing sale ID');
                // ✅ MIGLIORATO: Mostra errore all'utente se non c'è ID
                if (typeof toast === 'function') {
                  toast('Errore: impossibile creare la riga GI. Riprova più tardi.');
                }
              }
            }catch(e){ 
              console.error('[BANNER_GI] Error creating GI from appointment:', e);
              logger.error(e);
              // ✅ MIGLIORATO: Mostra errore all'utente
              const errorMessage = e?.message || e?.error || 'Errore sconosciuto';
              if (typeof toast === 'function') {
                toast(`Errore creazione riga GI: ${errorMessage}`);
              }
            }
          }
          if (opts && typeof opts.onSaved==='function') {
            opts.onSaved(v);
          }
        }catch(e){ 
          logger.error(e); 
          toast('Errore salvataggio VSS'); 
        }
      };
      return;
    }

    // Fallback legacy: append inline modal (non centrata)
    const d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML = panelHTML;
    document.body.appendChild(d);
    
    // Definisci close con try-catch per evitare errori
    const close = ()=>{ 
      try{ 
        d.remove();
      }catch(e){ 
        console.error('[VSS_CLOSE] Error closing VSS modal:', e);
      } 
    };
    
    d.querySelector('#vss_x').onclick = close;
    d.querySelector('#vss_ok').onclick = async ()=>{
        try{
          const v = Math.max(0, Number(d.querySelector('#vss_val').value||0));
          await POST('/api/appointments', { id: appt.id, vss: v });
          
          // Feedback utente con controlli di sicurezza
          if (typeof hapticImpact === 'function') {
            hapticImpact('medium');
          }
          if (typeof toast === 'function') {
            toast('Appuntamento aggiornato');
          }
          
          if (typeof close === 'function') {
            close();
          }

          if (v>0){
            try{
              const sale = await upsertGIFromAppointment(appt, v);
              console.log('[BANNER_GI] Sale response:', sale);
              dbg('[BANNER_GI] Sale response:', sale);
              if (sale && (sale.id || sale._id)){
                const id = sale.id || sale._id;
                console.log('[BANNER_GI] Opening builder for sale ID:', id);
                dbg('[BANNER_GI] Opening builder for sale ID:', id);
                // ✅ FIX: Aggiungi un piccolo delay per permettere a Supabase di propagare i dati
                setTimeout(() => {
                  tryOpenGiBuilder(id);
                }, 300);
                
                // ✅ MIGLIORATO: Mostra warning se c'è stato un problema (ma salvato in fallback)
                if (sale.warning) {
                  console.warn('[BANNER_GI] Warning:', sale.warning);
                  if (typeof toast === 'function') {
                    toast(sale.warning + (sale.error ? `: ${sale.error}` : ''));
                  }
                }
              } else {
                console.warn('[BANNER_GI] No sale ID found in response:', sale);
                dbg('[BANNER_GI] Cannot open builder - missing sale ID');
                // ✅ MIGLIORATO: Mostra errore all'utente se non c'è ID
                if (typeof toast === 'function') {
                  toast('Errore: impossibile creare la riga GI. Riprova più tardi.');
                }
              }
            }catch(e){ 
              console.error('[BANNER_GI] Error creating GI from appointment:', e);
              logger.error(e);
              // ✅ MIGLIORATO: Mostra errore all'utente
              const errorMessage = e?.message || e?.error || 'Errore sconosciuto';
              if (typeof toast === 'function') {
                toast(`Errore creazione riga GI: ${errorMessage}`);
              }
            }
          }
          if (opts && typeof opts.onSaved==='function') {
            opts.onSaved(v);
          }
        }catch(e){ 
          logger.error(e); 
          toast('Errore salvataggio VSS'); 
        }
      };
  }

  async function upsertGIFromAppointment(appt, vss){
    let clientId = appt.clientId || null;
    if (!clientId) clientId = await findClientIdByName(appt.client);
    const payload = {
      appointmentId: appt.id,  // ✅ FIX: Cambiato da apptId a appointmentId per match con backend
      date: new Date(appt.end || appt.start || Date.now()).toISOString(),
      clientId: clientId || undefined,
      clientName: appt.client || 'Cliente',
      vssTotal: Math.round(Number(vss||0)),
      services: appt.services || appt.note || '',
      consultantId: appt.userId || appt.ownerId || null
    };
    const resp = await POST('/api/gi', payload);
    dbg('[GI] Response from /api/gi:', resp);
    
    // ✅ MIGLIORATO: Gestisce errori dal backend
    if (resp && resp.ok === false) {
      const errorMsg = resp.error || resp.details || 'Errore sconosciuto';
      console.error('[GI] Backend returned error:', errorMsg);
      throw new Error(errorMsg);
    }
    
    // ✅ FIX: Supporta sia formato vecchio che nuovo (ok:true, id) e formati legacy (sale, gi, data)
    const saleId = resp?.id || resp?.sale?.id || resp?.gi?.id || resp?.data?.id;
    if (saleId) {
      dbg('[GI] Extracted sale ID:', saleId);
      // ✅ MIGLIORATO: Restituisce anche warning/error se presenti
      return { 
        id: saleId,
        warning: resp?.warning,
        error: resp?.error
      };
    }
    dbg('[GI] No sale ID found in response, returning full response');
    return resp;
  }

  // --- Funzioni per gestire lo stato persistente dei banner ---
  async function markBannerAnswered(apptId, kind, action) {
    try {
      const field = kind === KIND_NNCF ? 'nncfPromptAnswered' : 'salePromptAnswered';
      
      console.log(`[BANNER_SAVE] Saving banner answer: apptId=${apptId}, kind=${kind}, field=${field}, action=${action}`);
      
      // Salva risposta banner
      const response = await POST('/api/appointments', { id: apptId, [field]: true });
      console.log(`[BANNER_SAVE] Save response:`, response);
      
      // Marca push come inviato per evitare duplicati
      await markPush(apptId, kind);
      
      // FORZA REFRESH: Ricarica gli appuntamenti per aggiornare lo stato dei banner
      try {
        console.log(`[BANNER_SAVE] Refreshing appointments data after banner save`);
        // Trigger refresh globale degli appuntamenti
        if (typeof window.refreshAppointments === 'function') {
          await window.refreshAppointments();
        }
        // Trigger refresh specifico dei banner
        if (typeof window.scanBanners === 'function') {
          setTimeout(() => window.scanBanners(), 1000); // Delay per permettere al DB di aggiornarsi
        }
      } catch (refreshError) {
        console.warn(`[BANNER_SAVE] Refresh failed (non-critical):`, refreshError);
      }
      
      dbg('Banner marked as answered and push tracked', apptId, kind, action);
      console.log(`[BANNER_SAVE] Successfully saved banner answer for appt: ${apptId}`);
    } catch (e) {
      console.error(`[BANNER_SAVE] Error marking banner as answered:`, e);
      dbg('Error marking banner as answered', e);
      throw e; // Rilancia per gestione errori
    }
  }

  async function snoozeBanner(apptId, kind, hours = 24) {
    try {
      const snoozeUntil = new Date();
      snoozeUntil.setHours(snoozeUntil.getHours() + hours);
      const field = kind === KIND_NNCF ? 'nncfPromptSnoozedUntil' : 'salePromptSnoozedUntil';
      await POST('/api/appointments', { id: apptId, [field]: snoozeUntil.toISOString() });
      dbg('Snoozed banner', apptId, kind, 'until', snoozeUntil.toISOString());
    } catch (e) {
      dbg('Error snoozing banner', e);
    }
  }

  function isBannerSnoozed(appt, kind) {
    const field = kind === KIND_NNCF ? 'nncfPromptSnoozedUntil' : 'salePromptSnoozedUntil';
    const snoozedUntil = appt[field];
    if (!snoozedUntil) return false;
    return new Date(snoozedUntil).getTime() > Date.now();
  }

  function isBannerAnswered(appt, kind) {
    const field = kind === KIND_NNCF ? 'nncfPromptAnswered' : 'salePromptAnswered';
    return !!appt[field];
  }

  function bannerSale(appt){
    return function(close){
      const card = document.createElement('div');
      card.className = 'bp-banner-card';
      card.setAttribute('role','alertdialog');
      card.setAttribute('aria-live','assertive');
      const dateStr = new Date(appt.end || appt.start || Date.now())
        .toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
      card.innerHTML =
        `<div class="msg"><b>Allora, hai venduto a ${htmlEscape(appt.client||'Cliente')}? Appuntamento del ${htmlEscape(dateStr)}</b></div>
         <div class="row">
           <button class="ghost" data-act="later">Posticipa</button>
           <button class="ghost" data-act="no">No</button>
           <button data-act="yes">Sì</button>
         </div>`;
      card.querySelector('[data-act="yes"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_SALE);
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
          await markBannerAnswered(appt.id, KIND_SALE, 'yes');
          // Coach per risposta positiva al banner vendita
          if (typeof window.BP !== 'undefined' && window.BP.Coach && typeof window.BP.Coach.say === 'function') {
            window.BP.Coach.say('client_converted', { intensity: 'high' });
          }
          openVSSQuickEditor(appt);
        } catch(e) {
          console.error('[BANNER_YES] Error in yes click handler:', e);
        }
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_SALE);
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
          await markBannerAnswered(appt.id, KIND_SALE, 'no');
          try{ await POST('/api/appointments', { id: appt.id, vss: 0 }); toast('Registrato: nessuna vendita'); }catch(_){}
          
          // === NUOVA FUNZIONALITÀ: Toast motivazionale + Modal nuovo preventivo ===
          setTimeout(() => {
            toast('Dai non ti scoraggiare che comprerà!', 'success');
            setTimeout(() => {
              openNewPreventivoModalFromAppt(appt);
            }, 1000);
          }, 500);
          
        } catch(e) {
          console.error('[BANNER_NO] Error in no click handler:', e);
        }
      };
      card.querySelector('[data-act="later"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_SALE); 
          await snoozeBanner(appt.id, KIND_SALE, 24);
          toast('Te lo ripropongo domani'); 
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
        } catch(e) {
          console.error('[BANNER_LATER] Error in later click handler:', e);
        }
      };
      return card;
    };
  }

  function bannerNNCF(appt){
    return function(close){
      const card = document.createElement('div');
      card.className = 'bp-banner-card';
      card.setAttribute('role','alertdialog');
      card.setAttribute('aria-live','assertive');
      const dateStr = new Date(appt.end || appt.start || Date.now())
        .toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
      card.innerHTML =
        `<div class="msg"><b>Ehi, ${htmlEscape(appt.client||'')} è diventato cliente? Appuntamento del ${htmlEscape(dateStr)}</b></div>
         <div class="row">
           <button class="ghost" data-act="later">Posticipa</button>
           <button class="ghost" data-act="no">No</button>
           <button data-act="yes">Sì</button>
         </div>`;
      card.querySelector('[data-act="yes"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_NNCF);
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
          await markBannerAnswered(appt.id, KIND_NNCF, 'yes');
          try{
            await updateClientStatusByName(appt.client, 'attivo');
          }catch(_){}
          // Coach per conversione cliente da NNCF
          if (typeof window.BP !== 'undefined' && window.BP.Coach && typeof window.BP.Coach.say === 'function') {
            window.BP.Coach.say('client_converted', { intensity: 'high' });
          }
          openVSSQuickEditor(appt);
        } catch(e) {
          console.error('[BANNER_NNCF_YES] Error in NNCF yes click handler:', e);
        }
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_NNCF);
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
          await markBannerAnswered(appt.id, KIND_NNCF, 'no');
          try{
            await updateClientStatusByName(appt.client, 'lead non chiuso');
            await POST('/api/appointments', { id: appt.id, vss: 0 });
            toast('Aggiornato: Lead non chiuso, VSS=0');
          }catch(_){}
          
          // === NUOVA FUNZIONALITÀ: Toast motivazionale + Modal nuovo preventivo ===
          setTimeout(() => {
            toast('Dai non ti scoraggiare che comprerà!', 'success');
            setTimeout(() => {
              openNewPreventivoModalFromAppt(appt);
            }, 1000);
          }, 500);
          
        } catch(e) {
          console.error('[BANNER_NNCF_NO] Error in NNCF no click handler:', e);
        }
      };
      card.querySelector('[data-act="later"]').onclick = async function(){
        try {
          clearPending(appt.id, KIND_NNCF); 
          await snoozeBanner(appt.id, KIND_NNCF, 24);
          toast('Te lo ripropongo domani'); 
          if (typeof close === 'function') {
            close();
          } else {
            console.error('[BANNER_CLOSE] Close function is not available');
          }
        } catch(e) {
          console.error('[BANNER_NNCF_LATER] Error in NNCF later click handler:', e);
        }
      };
      return card;
    };
  }

  // ✅ Scan con cache per ridurre query API
  async function scanWithCache(){
    const now = Date.now();
    
    // Usa cache se disponibile e valida
    if (_lastScanData && (now - _lastScanTime) < SCAN_CACHE_MS) {
      dbg('Using cached scan data (age:', Math.round((now - _lastScanTime) / 1000), 'seconds)');
      processScanData(_lastScanData);
      return;
    }
    
    // Esegui scan completo
    await scan();
  }
  
  // ✅ Processa dati scan (estratto per riuso con cache)
  function processScanData(r) {
    if (!r || !r.appointments) return;
    
    const now = Date.now();
    const fromTs = now - LOOKBACK_DAYS*24*60*60*1000;
    const list = (r.appointments) || [];
    list.sort((a,b)=> (+new Date(b.end||b.start||0))-(+new Date(a.end||a.start||0)));
    
    dbg('Processing', list.length, 'appointments from scan data');
    
    list.forEach(appt=>{
      try{
        const end = +new Date(appt.end || appt.start || 0);
        if (!end || end>now || end<fromTs) {
          dbg('Skipping appointment - time filter', appt.id, appt.type, new Date(end).toLocaleString());
          return;
        }
        
        // Controlla se è passato il delay dalla fine dell'appuntamento
        const bannerDelayMs = BANNER_DELAY_MINUTES * 60 * 1000;
        if (end > (now - bannerDelayMs)) {
          dbg('Skipping appointment - too recent', appt.id, appt.type, 'ended', new Date(end).toLocaleString(), 'delay:', BANNER_DELAY_MINUTES, 'minutes');
          return;
        }
        
        
        const isVendita = String(appt.type||'').toLowerCase()==='vendita';
        if (!isVendita) {
          dbg('Skipping appointment - not vendita', appt.id, 'type:', appt.type, 'lowercase:', String(appt.type||'').toLowerCase());
          return;
        }
        
        dbg('Processing vendita appointment', appt.id, appt.type, 'nncf:', appt.nncf);
        
        if (appt.nncf){
          // Controlla stato persistente del banner NNCF dal database
          if (isBannerAnswered(appt, KIND_NNCF)) return;
          if (isBannerSnoozed(appt, KIND_NNCF)) return;
          
          // Controlla solo pending in memoria per evitare duplicati nella stessa sessione
          if (isPending(appt.id, KIND_NNCF)) { 
            dbg('skip pending NNCF', appt && appt.id); 
            return; 
          }
          
          // ✅ CONTROLLO CRITICO: Verifica push già inviata PRIMA di mostrare banner
          // Evita duplicati tra backend e frontend
          pushSent(appt.id, KIND_NNCF).then(pushAlreadySent => {
            if (pushAlreadySent) {
              dbg('Push already sent, skipping banner for', appt.id, KIND_NNCF);
              return; // Non mostrare banner se push già inviata
            }
            
            dbg('Triggering NNCF push and banner for', appt.id);
            triggerPush(KIND_NNCF, appt);
            markPending(appt.id, KIND_NNCF); 
            dbg('mark pending NNCF', appt && appt.id);
            enqueueBanner(bannerNNCF(appt));
          }).catch(err => {
            dbg('Error checking push sent for NNCF:', err);
          });
        } else {
          // Controlla stato persistente del banner Sale dal database
          if (isBannerAnswered(appt, KIND_SALE)) return;
          if (isBannerSnoozed(appt, KIND_SALE)) return;
          
          // Controlla solo pending in memoria per evitare duplicati nella stessa sessione
          if (isPending(appt.id, KIND_SALE)) { 
            dbg('skip pending SALE', appt && appt.id); 
            return; 
          }
          
          // ✅ CONTROLLO CRITICO: Verifica push già inviata PRIMA di mostrare banner
          // Evita duplicati tra backend e frontend
          pushSent(appt.id, KIND_SALE).then(pushAlreadySent => {
            if (pushAlreadySent) {
              dbg('Push already sent, skipping banner for', appt.id, KIND_SALE);
              return; // Non mostrare banner se push già inviata
            }
            
            dbg('Triggering SALE push and banner for', appt.id);
            triggerPush(KIND_SALE, appt);
            markPending(appt.id, KIND_SALE); 
            dbg('mark pending SALE', appt && appt.id);
            enqueueBanner(bannerSale(appt));
          }).catch(err => {
            dbg('Error checking push sent for SALE:', err);
          });
        }
      }catch(_){}
    });
  }

  async function scan(){
    // Non fare chiamate se l'utente non è loggato
    if (!window.getUser || !window.getUser()) {
      dbg('=== SCAN SKIPPED (user not logged in) ===');
      return;
    }
    
    // Non fare chiamate se è stato rilevato un 401 globale
    if (window.__BP_401_DETECTED === true) {
      dbg('=== SCAN SKIPPED (401 detected) ===');
      return;
    }
    try{
      dbg('=== SCAN STARTED ===');
      const r = await GET('/api/appointments');
      
      // ✅ Aggiorna cache
      _lastScanData = r;
      _lastScanTime = Date.now();
      
      // ✅ Processa dati
      processScanData(r);
    }catch(_){}
  }

  // Funzione per aprire modal nuovo preventivo con dati pre-compilati
  function openNewPreventivoModalFromAppt(appt) {
    try {
      // Calcola data oggi
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      // Calcola data feedback (oggi + 6 giorni)
      const feedbackDate = new Date(today);
      feedbackDate.setDate(feedbackDate.getDate() + 6);
      const feedbackDateStr = feedbackDate.toISOString().split('T')[0];
      
      // Ottieni VSS originale dall'appuntamento
      const originalVSS = appt.vss || 0;
      
      // Pre-compila i dati per la modal Vendite & Riordini
      const venditaPrecompilata = {
        data: todayStr,
        cliente: appt.client || '',
        consulente: appt.consultant || '',
        descrizione_servizi: appt.description || '',
        valore_proposto: originalVSS,
        data_feedback: feedbackDateStr,
        stato: 'proposto',
        valore_confermato: 0
      };
      
      // Apri la modal Vendite & Riordini con dati pre-compilati
      if (typeof window.showVenditaRiordiniModal === 'function') {
        window.showVenditaRiordiniModal({
          vendita: venditaPrecompilata,
          mode: 'new'
        });
      } else {
        console.error('[BANNER] showVenditaRiordiniModal function not available');
        toast('Errore: impossibile aprire la modal preventivo', 'error');
      }
    } catch (e) {
      console.error('[BANNER] Error opening new preventivo modal:', e);
      toast('Errore nell\'apertura della modal preventivo', 'error');
    }
  }

  window.scanBanners = scan;
  dbg('=== POST SALE BANNERS INITIALIZED ===');
  // initial scan
  if (document.readyState === 'loading'){
    dbg('Document loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', scan, {once:true});
  } else {
    dbg('Document ready, starting initial scan');
    scan();
  }
  
  // ✅ Riabilitato: re-scan quando appuntamento salvato (con cache)
  try{ 
    document.addEventListener('appt:saved', function(){ 
      dbg('Appointment saved event detected, triggering scan with cache');
      setTimeout(() => scanWithCache(), 50); 
    }); 
  }catch(_){ }
  
  // ✅ Riabilitato: re-scan quando tab diventa visibile (con cache)
  try{ 
    document.addEventListener('visibilitychange', function(){ 
      if(!document.hidden && window.getUser && window.getUser()) {
        dbg('Tab became visible, triggering scan with cache');
        setTimeout(() => scanWithCache(), 50); 
      }
    }); 
  }catch(_){ }
  
  // ✅ Riabilitato: scan periodico ogni 5 minuti (fallback, solo se tab visibile e utente loggato)
  try{ 
    scanInterval = setInterval(function(){ 
      if (!document.hidden && window.getUser && window.getUser()) {
        dbg('Periodic scan triggered (5 min interval)');
        scanWithCache(); 
      }
    }, 5*60*1000); // 5 minuti
  }catch(_){ }
  
  // ✅ Cleanup automatico interval su navigazione SPA
  try {
    window.addEventListener('beforeunload', function() {
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
        dbg('Cleaned up scan interval on navigation');
      }
    });
  } catch(_){ }
  }
  if (typeof global !== 'undefined') {
    global.initPostSaleBanners = initPostSaleBanners;
    global.enqueueBanner = enqueueBanner; // Export per altri banner
    // Auto-initialize when module loads
    try {
      initPostSaleBanners();
    } catch (e) {
      console.error('Error initializing post sale banners:', e);
    }
  }
  
  // Fallback per browser: esporta anche su window
  if (typeof window !== 'undefined') {
    window.enqueueBanner = enqueueBanner;
    window.initPostSaleBanners = initPostSaleBanners;
  }
})(typeof window !== 'undefined' ? window : this);