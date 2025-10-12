;(function(global){
  function initPostSaleBanners(hapticImpact){
  // Prevent double initialization (duplicate imports/calls)
  try{ if (global.__postSaleBannersInitialized) return; global.__postSaleBannersInitialized = true; dbg('init'); }catch(_){ }
  // --- Parametri ---
  const LOOKBACK_DAYS = window.BANNERS_LOOKBACK_DAYS || 7; // ultimi N giorni
  const KIND_NNCF = 'nncf';
  const KIND_SALE = 'sale';
  const BANNER_DELAY_MINUTES = 1; // Banner appare 1 minuto dopo la fine dell'appuntamento

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
  // Temporaneamente disabilitato per evitare errori 500
  const pushSent = async (id, kind) => {
    // Per ora ritorna sempre false per evitare errori
    return false;
  };
  
  const markPush = async (id, kind) => {
    // Per ora non fa nulla per evitare errori
    dbg('Push tracking temporarily disabled');
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
      await POST('/api/notifications/send', { 
        text: body, 
        recipients: 'all',
        type: 'automatic'
      });
      await markPush(appt.id, kind);
      dbg('Push notification sent and marked');
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
  function enqueueBanner(render){ _q.push(render); pump(); }
  function pump(){
    if(_showing) return; const next=_q.shift(); if(!next) return; _showing=true; ensureBannerCSS(); const host=getBannerHost(); host.innerHTML='';
    const card = next(close); host.appendChild(card); requestAnimationFrame(()=> card.classList.add('show'));
    function close(){ host.innerHTML=''; _showing=false; setTimeout(pump,40); }
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
      if (typeof window.openPaymentBuilderById === 'function') { window.openPaymentBuilderById(id); return; }
      if (typeof window.gotoGIAndOpenBuilder === 'function') { window.gotoGIAndOpenBuilder(id); return; }

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
          tries++; setTimeout(waitAndOpen, 100);
        })();
        return;
      }

      // Fallback assoluto: invia comunque l'evento
      document.dispatchEvent(new CustomEvent('gi:edit', { detail: { id } }));
    }catch(_){ /* ignora */ }
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
      const close = ()=>{ try{ hideOverlay(); }catch(_){ } };
      q('#vss_x').onclick = close;
      q('#vss_ok').onclick = async ()=>{
        try{
          const v = Math.max(0, Number(q('#vss_val').value||0));
          await POST('/api/appointments', { id: appt.id, vss: v });
          hapticImpact('medium'); toast('Appuntamento aggiornato');
          close();

          if (v>0){
            try{
              const sale = await upsertGIFromAppointment(appt, v);
              if (sale && (sale.id || sale._id)){
                const id = sale.id || sale._id;
                tryOpenGiBuilder(id);
              }
            }catch(e){ logger.error(e); }
          }
          if (opts && typeof opts.onSaved==='function') opts.onSaved(v);
        }catch(e){ logger.error(e); toast('Errore salvataggio VSS'); }
      };
      return;
    }

    // Fallback legacy: append inline modal (non centrata)
    const d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML = panelHTML;
    document.body.appendChild(d);
    const close = ()=>{ try{ d.remove(); }catch(_){ } };
    d.querySelector('#vss_x').onclick = close;
      d.querySelector('#vss_ok').onclick = async ()=>{
        try{
          const v = Math.max(0, Number(d.querySelector('#vss_val').value||0));
          await POST('/api/appointments', { id: appt.id, vss: v });
          hapticImpact('medium'); toast('Appuntamento aggiornato');
          close();

          if (v>0){
            try{
              const sale = await upsertGIFromAppointment(appt, v);
              if (sale && (sale.id || sale._id)){
                const id = sale.id || sale._id;
                tryOpenGiBuilder(id);
              }
            }catch(e){ logger.error(e); }
          }
          if (opts && typeof opts.onSaved==='function') opts.onSaved(v);
      }catch(e){ logger.error(e); toast('Errore salvataggio VSS'); }
      };
  }

  async function upsertGIFromAppointment(appt, vss){
    let clientId = appt.clientId || null;
    if (!clientId) clientId = await findClientIdByName(appt.client);
    const payload = {
      apptId: appt.id,
      date: new Date(appt.end || appt.start || Date.now()).toISOString(),
      clientId: clientId || undefined,
      clientName: appt.client || 'Cliente',
      vssTotal: Math.round(Number(vss||0)),
      services: appt.services || appt.note || '',
      consultantId: appt.userId || appt.ownerId || null
    };
    const resp = await POST('/api/gi', payload);
    return (resp && (resp.sale || resp.gi || resp.data)) || resp;
  }

  // --- Funzioni per gestire lo stato persistente dei banner ---
  async function markBannerAnswered(apptId, kind, action) {
    try {
      const field = kind === KIND_NNCF ? 'nncfPromptAnswered' : 'salePromptAnswered';
      await POST('/api/appointments', { id: apptId, [field]: true });
      dbg('Marked banner as answered', apptId, kind, action);
    } catch (e) {
      dbg('Error marking banner as answered', e);
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
        clearPending(appt.id, KIND_SALE);
        close();
        await markBannerAnswered(appt.id, KIND_SALE, 'yes');
        // Coach per risposta positiva al banner vendita
        if (typeof window.BP !== 'undefined' && window.BP.Coach && typeof window.BP.Coach.say === 'function') {
          window.BP.Coach.say('client_converted', { intensity: 'high' });
        }
        openVSSQuickEditor(appt);
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        clearPending(appt.id, KIND_SALE);
        close();
        await markBannerAnswered(appt.id, KIND_SALE, 'no');
        try{ await POST('/api/appointments', { id: appt.id, vss: 0 }); toast('Registrato: nessuna vendita'); }catch(_){}
      };
      card.querySelector('[data-act="later"]').onclick = async function(){
        clearPending(appt.id, KIND_SALE); 
        await snoozeBanner(appt.id, KIND_SALE, 24);
        toast('Te lo ripropongo domani'); 
        close();
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
        clearPending(appt.id, KIND_NNCF);
        close();
        await markBannerAnswered(appt.id, KIND_NNCF, 'yes');
        try{
          await updateClientStatusByName(appt.client, 'attivo');
        }catch(_){}
        // Coach per conversione cliente da NNCF
        if (typeof window.BP !== 'undefined' && window.BP.Coach && typeof window.BP.Coach.say === 'function') {
          window.BP.Coach.say('client_converted', { intensity: 'high' });
        }
        openVSSQuickEditor(appt);
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        clearPending(appt.id, KIND_NNCF);
        close();
        await markBannerAnswered(appt.id, KIND_NNCF, 'no');
        try{
          await updateClientStatusByName(appt.client, 'lead non chiuso');
          await POST('/api/appointments', { id: appt.id, vss: 0 });
          toast('Aggiornato: Lead non chiuso, VSS=0');
        }catch(_){}
      };
      card.querySelector('[data-act="later"]').onclick = async function(){
        clearPending(appt.id, KIND_NNCF); 
        await snoozeBanner(appt.id, KIND_NNCF, 24);
        toast('Te lo ripropongo domani'); 
        close();
      };
      return card;
    };
  }

  async function scan(){
    try{
      dbg('=== SCAN STARTED ===');
      const r = await GET('/api/appointments');
      const now = Date.now();
      const fromTs = now - LOOKBACK_DAYS*24*60*60*1000;
      const list = (r && r.appointments) || [];
      list.sort((a,b)=> (+new Date(b.end||b.start||0))-(+new Date(a.end||a.start||0)));
      
      dbg('Scanning', list.length, 'appointments');
      
      list.forEach(appt=>{
        try{
          const end = +new Date(appt.end || appt.start || 0);
          if (!end || end>now || end<fromTs) {
            dbg('Skipping appointment - time filter', appt.id, appt.type, new Date(end).toLocaleString());
            return;
          }
          
          // Controlla se è passato almeno 1 minuto dalla fine dell'appuntamento
          const bannerDelayMs = BANNER_DELAY_MINUTES * 60 * 1000;
          if (end > (now - bannerDelayMs)) {
            dbg('Skipping appointment - too recent', appt.id, appt.type, 'ended', new Date(end).toLocaleString());
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
            
            dbg('Triggering NNCF push and banner for', appt.id);
            triggerPush(KIND_NNCF, appt);
            markPending(appt.id, KIND_NNCF); 
            dbg('mark pending NNCF', appt && appt.id);
            enqueueBanner(bannerNNCF(appt));
          } else {
            // Controlla stato persistente del banner Sale dal database
            if (isBannerAnswered(appt, KIND_SALE)) return;
            if (isBannerSnoozed(appt, KIND_SALE)) return;
            
            // Controlla solo pending in memoria per evitare duplicati nella stessa sessione
            if (isPending(appt.id, KIND_SALE)) { 
              dbg('skip pending SALE', appt && appt.id); 
              return; 
            }
            
            dbg('Triggering SALE push and banner for', appt.id);
            triggerPush(KIND_SALE, appt);
            markPending(appt.id, KIND_SALE); 
            dbg('mark pending SALE', appt && appt.id);
            enqueueBanner(bannerSale(appt));
          }
        }catch(_){}
      });
    }catch(_){}
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
  // re-scan when an appointment is saved or tab becomes visible
  try{ document.addEventListener('appt:saved', function(){ setTimeout(scan, 50); }); }catch(_){ }
  try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden) setTimeout(scan, 50); }); }catch(_){ }
  // periodic scan (in case the page stays open while an appointment's end time passes)
  try{ setInterval(function(){ scan(); }, 60*1000); }catch(_){ }
  }
  if (typeof global !== 'undefined') {
    global.initPostSaleBanners = initPostSaleBanners;
    // Auto-initialize when module loads
    try {
      initPostSaleBanners();
    } catch (e) {
      console.error('Error initializing post sale banners:', e);
    }
  }
})(typeof window !== 'undefined' ? window : this);