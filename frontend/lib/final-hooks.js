// globals are provided by ./globals-polyfills.js loaded earlier

/* global logger */

// final-hooks.js — Pacchetto finale unico (integra main-plus e bp-hooks)
// - Mini-chart dashboard/provvigioni/squadra (canvas puro) + patch drawFullLine (Chart.js safe)
// - Filtro mode (previsionale/consuntivo) ovunque lato client
// - Calendario: evidenzia oggi + clamp slot liberi a ≥ oggi
// - Appuntamenti: bottone .ics nelle card + “Salva ed esporta” in form
// - Banner “È diventato cliente?” con notifica & update stato
// - Coach: frasi motivazionali + haptics
// - Report: Gmail Web/App con clipboard + URL compose corretto
// - Clienti: filtri (stato/consulente) + arricchimento card + inline admin
// - Squadra: select consulente, grafico coerente coi buckets
// - Utenti: modali admin/self
// - Undo: snackbar 5s lato UI su elimina

const hapticImpact = (window.BP && BP.Haptics && BP.Haptics.impact) ? BP.Haptics.impact : () => {};
(function(){
  'use strict';
/* ===== FETCH SHIMS + TOKEN (fallback) ===== */
if (!window.bpAuthToken) {
  window.bpAuthToken = function () {
    // 1) preferenza main-plus: oggetto 'bp_user' con {token|jwt|accessToken}
    try {
      const raw = localStorage.getItem('bp_user') || sessionStorage.getItem('bp_user');
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          if (obj && (obj.token || obj.jwt || obj.accessToken)) {
            return obj.token || obj.jwt || obj.accessToken;
          }
        } catch (_) {}
      }
    } catch (_){}

    // 2) chiavi esplicite più comuni
    const keys = ['bp_token','authToken','token','jwt','accessToken','id_token','auth','authorization','session','user'];
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (!v) continue;
        // JSON con {token|jwt|accessToken}
        try {
          const o = JSON.parse(v);
          if (o && (o.token || o.jwt || o.accessToken)) return o.token || o.jwt || o.accessToken;
        } catch (_){}
        // stringa con JWT
        if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(v)) return v;
      } catch (_){}
    }

    // 3) scansione totale localStorage (fallback estremo)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (!v) continue;
        try {
          const o = JSON.parse(v);
          if (o && (o.token || o.jwt || o.accessToken)) return o.token || o.jwt || o.accessToken;
        } catch (_){}
        if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(v)) return v;
      }
    } catch (_){}

    // 4) embedded nell'oggetto utente corrente
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u && (u.token || u.jwt || u.accessToken)) return u.token || u.jwt || u.accessToken;
    } catch (_){}

    return null;
  };
}

if (!window.GET) {
  window.GET = async function (url) {
    const t = (window.bpAuthToken && window.bpAuthToken()) || null;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...(t ? { 'Authorization': 'Bearer ' + t } : {})
      }
    });
    if (r.status === 204) return null;
    // se non è json, evita crash
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: r.ok, status: r.status, text: await r.text() };
    return r.json();
  };
}

if (!window.POST) {
  window.POST = async function (url, body) {
    const t = (window.bpAuthToken && window.bpAuthToken()) || null;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { 'Authorization': 'Bearer ' + t } : {})
      },
      body: JSON.stringify(body || {})
    });
    if (r.status === 204) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: r.ok, status: r.status, text: await r.text() };
    return r.json();
  };
}

/* ===== Post-vendita & Post-NNCF banners – flow completo (VSS + GI) ===== */
if (typeof window !== 'undefined' && typeof window.initPostSaleBanners === 'function') {
  window.initPostSaleBanners(hapticImpact);
}
/* ====== QUICK VSS MODALE + GI AUTO + BUILDER PAGAMENTI ====== */

// — CSS della modale (centrata)
(function ensureQuickVSSCss(){
  if (document.getElementById('bp-qvss-css')) return;
  const st = document.createElement('style');
  st.id='bp-qvss-css';
  st.textContent = `
    #bp_overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .bp-modal{max-width:560px;width:clamp(300px,90vw,560px);background:var(--card,#fff);
      color:var(--text,#111);border-radius:14px;border:1px solid rgba(0,0,0,.12);
      box-shadow:0 12px 34px rgba(0,0,0,.35)}
    .bp-modal .hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px}
    .bp-modal .bd{padding:10px 14px 14px}
    .bp-modal .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .bp-modal .right{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}
    .bp-modal input[type="number"], .bp-modal input[type="date"], .bp-modal select, .bp-modal textarea{
      width:100%;padding:8px;border:1px solid rgba(0,0,0,.18);border-radius:10px}
    @media (prefers-color-scheme:dark){
      .bp-modal{background:rgba(15,18,28,.98);color:#fff;border-color:rgba(255,255,255,.14)}
      .bp-modal input, .bp-modal select, .bp-modal textarea{background:rgba(255,255,255,.04);color:#fff;border-color:rgba(255,255,255,.18)}
    }
  `;
  document.head.appendChild(st);
})();

// helpers locali
function htmlEscape(s){ return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function showCentered(html){
  if (!window.showOverlay) {
    const dim = document.createElement('div'); dim.id='bp_overlay'; dim.innerHTML=html; document.body.appendChild(dim);
  } else {
    window.showOverlay(html);
  }
}
function closeCentered(){ if (window.hideOverlay) window.hideOverlay(); else { const d=document.getElementById('bp_overlay'); if(d) d.remove(); } }

// —— lookup clientId by name, se non è già nell’appuntamento
async function findClientIdByName(name){
  try{
    const j=await GET('/api/clients'); const list=(j&&j.clients)||[];
    const key=String(name||'').trim().toLowerCase();
    const it=list.find(c=>String(c.name||'').trim().toLowerCase()===key);
    return it ? it.id : null;
  }catch(_){ return null; }
}

// —— crea GI dalla vendita (se VSS>0)
async function createGIFromAppt(appt, vss){
  if (!(Number(vss)>0)) return null;
  const dateISO = new Date(appt.end || appt.start || Date.now()).toISOString();
  let clientId = appt.clientId || null;
  if (!clientId) clientId = await findClientIdByName(appt.client);
  const payload = {
    date: dateISO,
    vssTotal: Number(vss)||0,
    services: appt.services || '',
    consultantId: appt.userId || ( (JSON.parse(localStorage.getItem('user')||'{}')||{}).id ),
    clientId: clientId || undefined,
    clientName: appt.client || undefined
  };
  const r = await POST('/api/gi', payload);
  // l’API può restituire {id} oppure {sale:{id:..}}
  return (r && (r.id || (r.sale && r.sale.id))) || null;
}

// —— mini builder pagamenti (fallback universale; usa overlay centrale)
async function openPaymentBuilderById(id){
  // Se siamo nella vista GI, uso l’evento nativo
  if (typeof viewGI === 'function' && document.querySelector('#gi_rows')){
    // già in GI: apro direttamente
    document.dispatchEvent(new CustomEvent('gi:edit',{detail:{id}}));
    return;
  }
  // Non siamo in GI: provo ad aprire la vista GI e poi il builder
  if (typeof viewGI === 'function'){
    try { viewGI(); } catch(_){}
    setTimeout(()=> document.dispatchEvent(new CustomEvent('gi:edit',{detail:{id}})), 350);
    return;
  }

  // Fallback assoluto: builder minimale stand-alone
  try{
    const j = await GET('/api/gi?from=1900-01-01&to=2999-12-31');
    const it = ((j&&j.sales)||[]).find(s=>String(s.id)===String(id));
    if(!it){ toast('Vendita non trovata'); return; }

    const now = new Date().toISOString().slice(0,10);
    showCentered(
      '<div class="bp-modal">'+
        '<div class="hd"><b>Builder pagamenti – '+htmlEscape(it.clientName||'Cliente')+'</b>'+
          '<button class="ghost" id="pb_x">Chiudi</button></div>'+
        '<div class="bd">'+
          '<div class="row"><div style="flex:1"><label>Totale VSS</label>'+
            '<input id="pb_vss" type="number" value="'+(Number(it.vssTotal||0))+'"></div></div>'+
          '<div class="row" style="margin-top:8px;gap:12px">'+
            '<div><label>Regola rapida</label>'+
              '<select id="pb_rule"><option value="0">Manuale</option>'+
                '<option value="50-25-25">50% + 25% / 30-60gg</option>'+
                '<option value="20+12">20% + 12 rate mensili</option>'+
              '</select></div>'+
            '<div><label>Prima scadenza</label>'+
              '<input id="pb_first" type="date" value="'+now+'"></div>'+
          '</div>'+
          '<div style="margin-top:8px"><label>Rate</label><div id="pb_rates" class="small muted">Nessuna rata</div></div>'+
          '<div class="right"><button class="ghost" id="pb_apply">Ricalcola</button><button id="pb_save">Salva</button></div>'+
        '</div>'+
      '</div>'
    );
    const $ = id=>document.getElementById(id);
    function renderRates(list){
      const box=$('pb_rates');
      if(!list||!list.length){ box.textContent='Nessuna rata'; box._data=[]; return; }
      box.innerHTML=list.map(r=>{
        const dd=new Date(r.dueDate).toLocaleDateString('it-IT');
        return `<div>${dd} · ${Number(r.amount||0).toLocaleString('it-IT')}€ <span class="muted">${htmlEscape(r.note||'')}</span></div>`;
      }).join('');
      box._data=list;
    }
    $('pb_apply').onclick=function(){
      const rule=$('pb_rule').value||'0';
      const tot = Math.max(0, Number(($('pb_vss').value)||0));
      const first = new Date(($('pb_first').value)||new Date());
      const out=[];
      const add=(d,amount,note)=> out.push({ dueDate:new Date(d).toISOString(), amount:Math.round(amount), note:note||'' });
      if (rule==='50-25-25'){
        add(first, tot*0.50, 'Acconto 50%');
        const d2=new Date(first); d2.setDate(d2.getDate()+30); add(d2, tot*0.25,'Saldo 25% a 30gg');
        const d3=new Date(first); d3.setDate(d3.getDate()+60); add(d3, tot*0.25,'Saldo 25% a 60gg');
      } else if (rule==='20+12'){
        add(first, tot*0.20, 'Acconto 20%');
        const resid=tot*0.80; const m=12; const rata=resid/m;
        for(let i=0;i<m;i++){ const d=new Date(first); d.setMonth(d.getMonth()+i+1); add(d,rata,'Rata '+(i+1)+'/'+m); }
      }
      renderRates(out);
    };
    $('pb_save').onclick=async function(){
      const vss = Math.max(0, Number(($('pb_vss').value)||0));
      const sched = ($('pb_rates')._data)||[];
      try{
        await POST('/api/gi', { id: it.id, vssTotal: vss, schedule: sched });
        try{ document.dispatchEvent(new CustomEvent('payments:defined',{ detail:{ id: it.id, vssTotal: vss, schedule: sched } })); }catch(_){ }
        toast('Piano pagamenti salvato'); closeCentered();
      }catch(e){ logger.error(e); toast('Errore salvataggio'); }
    };
    $('pb_x').onclick=closeCentered;
  }catch(e){ logger.error(e); }
}

// —— Modale centrale per inserire/forzare VSS
function openVSSModal(appt){
  const name = appt.client || 'Cliente';
  const v = Number(appt.vss || appt.vsdPersonal || 0) || 0;
  showCentered(
    '<div class="bp-modal">'+
      '<div class="hd"><b>VSS per '+htmlEscape(name)+'</b>'+
        '<button class="ghost" id="qvss_x">Chiudi</button></div>'+
      '<div class="bd">'+
        '<div><label>Valore VSS</label>'+
        '<input id="qvss_val" type="number" step="1" value="'+v+'"></div>'+
        '<div class="small muted" style="margin-top:6px">Modifica consentita solo per VSS</div>'+
        '<div class="right"><button id="qvss_ok">Salva</button></div>'+
      '</div>'+
    '</div>'
  );
  document.getElementById('qvss_x').onclick = closeCentered;
  document.getElementById('qvss_ok').onclick = async function(){
    try{
      const val = Math.max(0, Number(document.getElementById('qvss_val').value || 0));
      // 1) aggiorna appuntamento
      await POST('/api/appointments', { id: appt.id, vss: val });
      // 2) crea GI se VSS>0 e apri builder
      const saleId = await createGIFromAppt(appt, val);
      closeCentered();
      toast('VSS salvato');
      if (saleId) { openPaymentBuilderById(saleId); }
      try{ if (saleId) document.dispatchEvent(new CustomEvent('gi:created',{ detail:{ id: saleId } })); }catch(_){ }
      document.dispatchEvent(new Event('bp:saved')); // trigger coach/haptics
    }catch(e){ logger.error(e); toast('Errore salvataggio VSS'); }
  };
}

// —— Pipeline logiche richiamate dai banner
async function pipelineYes(appt){
  try{
    if (appt.nncf){
      // promuovi cliente a “attivo”
      await (async function promote(){
        try{
          const r = await GET('/api/clients'); const list=(r&&r.clients)||[];
          const key=String(appt.client||'').trim().toLowerCase();
          const it=list.find(c=>String(c.name||'').trim().toLowerCase()===key);
          if (it) await POST('/api/clients', { id: it.id, status: 'attivo' });
        }catch(_){}
      })();
      document.dispatchEvent(new Event('client:converted'));
    }
    // poi chiedi VSS (modale centrale) e, se >0, crea GI e apri builder
    openVSSModal(appt);
  }catch(e){ logger.error(e); }
}

async function pipelineNo(appt){
  try{
    if (appt.nncf){
      // passa a “lead non chiuso”
      try{
        const r = await GET('/api/clients'); const list=(r&&r.clients)||[];
        const key=String(appt.client||'').trim().toLowerCase();
        const it=list.find(c=>String(c.name||'').trim().toLowerCase()===key);
        if (it) await POST('/api/clients', { id: it.id, status: 'lead non chiuso' });
      }catch(_){}
    }
    // forza VSS = 0 (no GI)
    await POST('/api/appointments', { id: appt.id, vss: 0 });
    toast('Ok, segnato come non venduto');
  }catch(e){ logger.error(e); toast('Errore aggiornamento'); }
}

// Rendi disponibili globalmente (il banner già li usa)
window.pipelineYes = pipelineYes;
window.pipelineNo  = pipelineNo;
/* ==== QUICK VSS MODAL + GI auto-create + open builder ==== */
(function(){
  // CSS modale centrale (riusabile)
  function ensureCenterCSS(){
    if (document.getElementById('bp-center-css')) return;
    const css = `
      #bp_overlay{display:flex;align-items:center;justify-content:center}
      .bp-modal-card{min-width:min(480px,90vw);max-width:600px;max-height:86vh;overflow:auto}
      @media (max-width:640px){ .bp-modal-card{min-width:90vw} }
      .bp-modal-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
    `;
    const st=document.createElement('style'); st.id='bp-center-css'; st.textContent=css; document.head.appendChild(st);
  }

  // helper: lock/unlock scroll
  function lockScroll(on){
    try { document.documentElement.style.overflow = on ? 'hidden' : ''; } catch(_){}
  }

  // trova clientId dal nome (case-insensitive)
  async function resolveClientIdByName(name){
    if(!name) return null;
    try{
      const j = await GET('/api/clients');
      const list = (j&&j.clients)||[];
      const low = String(name).trim().toLowerCase();
      const it = list.find(c => String(c.name||'').trim().toLowerCase()===low);
      return it ? it.id : null;
    }catch(_){ return null; }
  }

  // aggiorna stato cliente per nome (potenziale -> attivo/lead non chiuso)
  async function updateClientStatus(name, status){
    const id = await resolveClientIdByName(name);
    if(!id) return;
    try{ await POST('/api/clients', { id, status }); }catch(_){}
  }

  // salva VSS sull'appuntamento
  async function saveApptVSS(apptId, vss){
    return POST('/api/appointments', { id: apptId, vss: Math.max(0, Number(vss||0)) });
  }

  // === NUOVA FUNZIONALITÀ: Apri modal nuovo preventivo con valori pre-compilati ===
  function openNewPreventivoModalFromAppt(appt){
    try {
      // Calcola data feedback (oggi + 6 giorni)
      const today = new Date();
      const feedbackDate = new Date(today);
      feedbackDate.setDate(today.getDate() + 6);
      const feedbackDateStr = feedbackDate.toISOString().split('T')[0];
      
      // Ottieni VSS originale prima dell'azzeramento (dal campo description o vss)
      const originalVSS = appt.vss || 0;
      
      // Crea oggetto vendita pre-compilato
      const venditaPrecompilata = {
        data: today.toISOString().split('T')[0], // oggi
        cliente: appt.client || '',
        consulente: appt.consultant || '',
        descrizione_servizi: appt.description || '',
        valore_proposto: originalVSS,
        data_feedback: feedbackDateStr,
        stato: 'proposto',
        valore_confermato: 0
      };
      
      // Apri modal Vendite & Riordini in modalità nuovo preventivo
      if (typeof window.showVenditaRiordiniModal === 'function') {
        window.showVenditaRiordiniModal({ 
          vendita: venditaPrecompilata,
          mode: 'new'
        });
      } else {
        console.error('showVenditaRiordiniModal function not found');
        toast('Errore: funzione modal non trovata', 'error');
      }
    } catch(e) {
      logger.error('Error opening new preventivo modal:', e);
      toast('Errore nell\'apertura della modal', 'error');
    }
  }

  // crea riga GI a partire dall’appuntamento
  async function createGIFromAppt(appt, vss){
    const clientId = await resolveClientIdByName(appt.client||'');
    const payload = {
      date: new Date(appt.end || appt.start || Date.now()).toISOString(),
      clientId: clientId || undefined,
      clientName: appt.client || '',
      vssTotal: Math.max(0, Number(vss||0)),
      services: appt.services || '',         // se serve
      schedule: []                           // builder si aprirà dopo
    };
    const r = await POST('/api/gi', payload);
    // prova a tornare l’id (supporta varie forme di risposta)
    return (r && (r.id || (r.sale && r.sale.id) || (Array.isArray(r.sales)&&r.sales[0]&&r.sales[0].id))) || null;
  }

  // naviga alla vista GI e apre direttamente il builder della vendita
  async function gotoGIAndOpenBuilder(saleId){
    if (!saleId) return;
    // vai alla vista GI se disponibile
    try{ if (typeof window.viewGI==='function') window.viewGI(); }catch(_){}
    // attende che la tabella compaia e poi manda l’evento
    let tries=0;
    (function waitAndFire(){
      const ok = document.getElementById('gi_rows');
      if (ok || tries>40){
        try{
          const ev = new CustomEvent('gi:edit', { detail:{ id: saleId }});
          document.dispatchEvent(ev);
        }catch(_){}
        return;
      }
      tries++; setTimeout(waitAndFire, 100);
    })();
  }

  // Modale centrale di quick-edit VSS (solo quel campo)
  function openQuickVSSModal(appt, opts){
    ensureCenterCSS(); lockScroll(true);
    const v0 = Math.max(0, Number(appt.vss||0));
    const html =
      '<div class="modal"><div class="card bp-modal-card">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'+
          '<b>VSS per '+(appt.client? esc(appt.client) : 'appuntamento')+'</b>'+
          '<button class="ghost" id="qvss_x">Chiudi</button>'+
        '</div>'+
        '<div style="margin-top:8px">'+
          '<label>Valore VSS</label>'+
          '<input id="qvss_val" type="number" step="1" value="'+v0+'">'+
          '<div class="small muted" style="margin-top:6px">Modifica consentita solo per VSS</div>'+
        '</div>'+
        '<div class="bp-modal-foot">'+
          '<button id="qvss_ok">Salva</button>'+
        '</div>'+
      '</div></div>';
    showOverlay(html);

    function close(){ lockScroll(false); hideOverlay(); }

    const inp = document.getElementById('qvss_val');
    document.getElementById('qvss_x').onclick = close;
    document.getElementById('qvss_ok').onclick = async function(){
      try{
        const v = Math.max(0, Number(inp.value||0));
        await saveApptVSS(appt.id, v);
        // crea GI e apri builder
        const gid = await createGIFromAppt(appt, v);
        close();
        if (gid){ try{ document.dispatchEvent(new CustomEvent('gi:created',{ detail:{ id: gid } })); }catch(_){ } }
        // Coach gestito da coach.js tramite eventi
        gotoGIAndOpenBuilder(gid);
      }catch(e){ logger.error(e); toast('Errore salvataggio VSS'); }
    };
  }

// safe escape (una sola versione, globale)
function esc(s){
  return String(s || '').replace(/[&<>'"]/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  })[ch]);
}

  /* ====== Nuova logica banner ======
     - VENDITA senza NNCF:
         SI  -> apri modale VSS; al salvataggio crea GI e apri builder
         NO  -> VSS=0
     - NNCF:
         SI  -> set cliente "attivo" + apri modale VSS (poi crea GI, builder)
         NO  -> set cliente "Lead non chiuso" + VSS=0
     Posticipa: snooze 1 giorno (già gestito a monte)
  */
  window.pipelineYes = async function(appt){
    try{
      if (appt.nncf) { await updateClientStatus(appt.client, 'cliente'); }
      openQuickVSSModal(appt);
    }catch(e){ logger.error(e); }
  };
  window.pipelineNo = async function(appt){
    try{
      if (appt.nncf) { await updateClientStatus(appt.client, 'lead non chiuso'); }
      await saveApptVSS(appt.id, 0);
      hapticImpact('light');
      toast('Segnato VSS 0');
      
      // === NUOVA FUNZIONALITÀ: Toast motivazionale + Modal nuovo preventivo ===
      setTimeout(() => {
        toast('Dai non ti scoraggiare che comprerà!', 'success');
        
        // Apri modal nuovo preventivo con valori pre-compilati
        setTimeout(() => {
          openNewPreventivoModalFromAppt(appt);
        }, 1000);
      }, 500);
      
    }catch(e){ logger.error(e); }
  };
})();

/* ===== REPORT HELPERS (subject/body/cc + Gmail compose Web/App) ===== */
(function(){
  function enc(s){ return encodeURIComponent(String(s||'')); }

  function safeLabel(){
    try{
      // prova a usare il label già renderizzato
      const el = document.getElementById('rep_label');
      if (el && el.textContent) return el.textContent.trim();
    }catch(_){}
    // fallback su select tipo + data corrente
    const t = (document.getElementById('rep_type')||{}).value || 'mensile';
    const dt = new Date();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const y = dt.getFullYear();
      if (t==='settimanale') return 'Settimana ISO '+(isoWeekNum ? isoWeekNum(dt) : 'corrente')+' '+y;
    if (t==='trimestrale') return 'Q'+(Math.floor(dt.getMonth()/3)+1)+' '+y;
    if (t==='semestrale')  return 'Semestre '+(dt.getMonth()<6?'1°':'2°')+' '+y;
    if (t==='annuale')     return 'Anno '+y;
    return 'Mese '+m+'/'+y;
  }

  async function ccList(){
    try{
      const r = await GET('/api/usernames');
      const users = (r && r.users) || [];
      return users.map(u => u.email).filter(Boolean).join(',');
    }catch(_){ return ''; }
  }

  function buildSubject(){
    const input = document.getElementById('report_subject');
    if (input && input.value && input.value.trim()) return input.value.trim();
    return 'Report BP – '+safeLabel();
  }

  function getReportBody(){
    const ta = document.getElementById('report_body');
    if (ta && ta.value && ta.value.trim()) return ta.value;
    // Testo base
    return 'Ciao,\n\ndi seguito il report del periodo '+safeLabel()+'.\n\n– VSS\n– VSD\n– GI\n– NNCF\n\nA presto.';
  }

  async function wireReportButtons(){
    const bW = document.getElementById('rep_gmail_web');
    const bA = document.getElementById('rep_gmail_app');
    if (!bW && !bA) return;

    const cc = await ccList();
    const subject = buildSubject();
    const body    = getReportBody();

    // prova a copiare il corpo per comodità
    try{ await navigator.clipboard.writeText(body); }catch(_){}

    if (bW){
      bW.onclick = function(){
        const url='https://mail.google.com/mail/?view=cm&fs=1&tf=1'
          +'&su='+enc(subject)+'&cc='+enc(cc)+'&body='+enc(body);
        window.open(url,'_blank');
        try{ document.dispatchEvent(new Event('report:composed')); }catch(_){ }
      };
    }
    if (bA){
      bA.onclick = function(){
        const url='googlegmail:///co?subject='+enc(subject)+'&cc='+enc(cc)+'&body='+enc(body);
        location.href = url;
        try{ document.dispatchEvent(new Event('report:composed')); }catch(_){ }
        setTimeout(function(){
          if (!document.hidden){
            location.href = 'mailto:?subject='+enc(subject)+'&cc='+enc(cc)+'&body='+enc(body);
            try{ document.dispatchEvent(new Event('report:composed')); }catch(_){ }
          }
        }, 1200);
      };
    }
  }

  // Esponi per Observer
  window.wireReportButtons = wireReportButtons;
})();

/* ===== CALENDAR HOOK (oggi evidenziato + .ics dentro giorno) ===== */
(function(){
  // yyyy-mm-dd del giorno locale
  function ymdLocal(d){
    var x = d instanceof Date ? d : new Date(d || Date.now());
    var y = x.getFullYear(), m=('0'+(x.getMonth()+1)).slice(-2), g=('0'+x.getDate()).slice(-2);
    return y+'-'+m+'-'+g;
  }

  // Evidenzia la cella "oggi" leggendo data-date o data-day
  function highlightToday(root){
    // Usa data locale per evidenziare "oggi" nel calendario
    var today = ymdLocal(new Date());
    var box = root.querySelectorAll('[data-date], [data-day]');
    for (var i=0;i<box.length;i++){
      var el = box[i];
      var val = el.getAttribute('data-date') || el.getAttribute('data-day') || '';
      if (!val) continue;
      // normalizza a yyyy-mm-dd (togli orari)
      var day = String(val).slice(0,10);
      if (day === today) el.classList.add('today');
    }
  }

  // Aggancia export ICS anche all’interno dei box giorno, se presenti elementi appuntamento
  function attachICSInDays(root){
    // Se esiste già un helper globale, usalo (copre la maggior parte dei casi)
    if (typeof window.attachICSButtons === 'function'){
      try { window.attachICSButtons(root); } catch(e){ logger.error(e); }
      return;
    }
    // Fallback minimale: cerca elementi appuntamento con dataset (data-start/data-end/data-title)
    var items = root.querySelectorAll('[data-appt], [data-start][data-title], .appt, .calendar-appt');
    for (var i=0;i<items.length;i++){
      var it = items[i];
      if (it.querySelector('.bp-ics')) continue;
      var start = it.getAttribute('data-start') || '';
      var end   = it.getAttribute('data-end') || '';
      var title = it.getAttribute('data-title') || it.getAttribute('data-client') || 'Appuntamento';
      if (!start) continue; // niente start, niente ics affidabile
      var a = document.createElement('a');
      a.href = '#';
      a.className = 'bp-ics btn-ics';
      a.textContent = '📅';
      a.style.marginLeft = '6px';
      a.onclick = function(ev){
        ev.preventDefault();
        try{
          var host = ev.currentTarget.parentElement || document.body;
          var s = host.getAttribute('data-start') || start;
          var e = host.getAttribute('data-end') || end || s;
          var t = host.getAttribute('data-title') || host.getAttribute('data-client') || title;
          var ics = [
            'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BP//Calendar//IT',
            'BEGIN:VEVENT',
            'UID:'+Date.now()+'@bp',
            'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
            'DTSTART:'+new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
            'DTEND:'+new Date(e).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
            'SUMMARY:'+t,
            'END:VEVENT','END:VCALENDAR'
          ].join('\r\n');
          var blob = new Blob([ics], {type:'text/calendar'});
          var url = URL.createObjectURL(blob);
          var dl = document.createElement('a');
          dl.href = url;
          dl.download = (t||'appuntamento')+'.ics';
          document.body.appendChild(dl);
          dl.click();
          setTimeout(function(){ URL.revokeObjectURL(url); try{dl.remove();}catch(_){ } }, 0);
        }catch(err){ logger.error(err); }
      };
      // la mettiamo in coda al contenuto dell’elemento appuntamento
      it.appendChild(a);
    }
  }

  // Hook principale
  function hookCalendar(){
    var root = document.getElementById('calendar') || document.querySelector('.calendar') || document;
    highlightToday(root);
    attachICSInDays(root);
  }

  // Esportiamo la funzione (l’Observer la può richiamare)
  window.hookCalendar = hookCalendar;

  // Auto-wiring: al ready e quando cambia il DOM del calendario
  function once(fn){
    if (document.readyState === 'complete' || document.readyState === 'interactive') return fn();
    document.addEventListener('DOMContentLoaded', fn, {once:true});
  }
  once(hookCalendar);

  var cal = document.getElementById('calendar') || document.querySelector('.calendar');
  if (cal && !cal.__bpCalObs){
    cal.__bpCalObs = true;
    var mo = new MutationObserver(function(){ try{ hookCalendar(); }catch(e){} });
    mo.observe(cal, {childList:true, subtree:true});
  }
})();

/* ===== INJECT TODAY CSS (fallback tema) ===== */
(function(){
  var injected = false;
  function injectTodayCSS(){
    if (injected) return; injected = true;
    var css =
      '.today{outline:2px solid var(--accent, #5dd3ff); outline-offset:-2px; border-radius:8px; position:relative;}'+
      '.today::after{content:"OGGI"; position:absolute; top:6px; right:8px; font-size:10px; font-weight:700; color:#fff; background:var(--accent, #5dd3ff); padding:2px 6px; border-radius:6px;}';
    var st = document.createElement('style');
    st.setAttribute('data-bp-today','1');
    st.textContent = css;
    document.head.appendChild(st);
  }
  // export + auto
  window.injectTodayCSS = injectTodayCSS;
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', injectTodayCSS, {once:true});
  } else injectTodayCSS();
})();


/* ===== CLIENTI: ultimo appuntamento + inline edit (solo admin) ===== */
(function(){
  function getMe(){
    try { return JSON.parse(localStorage.getItem('user')||'{}'); } catch(_){ return {}; }
  }
  function isAdmin(){
    var me = getMe(); return (me && me.role==='admin');
  }
  function sel(q, ctx){ return (ctx||document).querySelector(q); }
  function selAll(q, ctx){ return Array.prototype.slice.call((ctx||document).querySelectorAll(q)); }
  function dmy(d){
    var x=new Date(d); if(!x||isNaN(x)) return '—';
    return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2)+'/'+x.getFullYear();
  }

  // Mappa: nome cliente (lower) -> timestamp ultimo appuntamento
  async function mapLastAppointments(){
    // Non fare chiamate se è stato rilevato un 401 globale o se non c'è autenticazione
    if (window.__BP_401_DETECTED === true) {
      return {};
    }
    try{
      var j = await GET('/api/appointments');
      var arr = (j && j.appointments) || [];
      var last = {};
      for (var i=0;i<arr.length;i++){
        var a=arr[i]; var key=(String(a.client||'').trim().toLowerCase());
        if (!key) continue;
        var t = new Date(a.start || a.end || 0).getTime();
        if (!last[key] || t>last[key]) last[key]=t;
      }
      return last;
    }catch(err){
      // Se è un 401, non fare retry
      if (window.__BP_401_DETECTED === true) return {};
      logger.error(err);
      return {};
    }
  }

  // Applica la data "ultimo appuntamento" alle card in #cl_list
  async function applyClientsLastAppointment(){
    // Non fare chiamate se è stato rilevato un 401 globale
    if (window.__BP_401_DETECTED === true) {
      return;
    }
    var host = document.getElementById('cl_list'); if(!host) return;
    var last = await mapLastAppointments();
    selAll('.card', host).forEach(function(card){
      // prova ad estrarre il nome cliente dalla <b> principale
      var title = sel('b', card); if(!title) return;
      var name = (title.textContent||'').trim().toLowerCase();
      if (!name) return;
      var t = last[name]; var line = sel('.bp-lastapp', card);
      var txt = 'Ultimo appuntamento: '+(t? dmy(t) : '—');
      if (line){ line.textContent = txt; }
      else {
        var div = document.createElement('div');
        div.className = 'small muted bp-lastapp';
        div.textContent = txt;
        card.appendChild(div);
      }
    });
  }

  // Inline edit solo per admin: modifica nome / stato / consulente
  async function ensureClientInlineEdit(){
    if (!isAdmin()) return;
    var host = document.getElementById('cl_list'); if(!host) return;

    // carica clients + utenti (per select consulente)
    var [jc, ju] = await Promise.all([ GET('/api/clients'), GET('/api/usernames') ]);
    var clients = (jc && jc.clients) || [];
    var users   = (ju && ju.users) || [];

    function findClientByCard(card){
      var nameEl = sel('b', card);
      var name = (nameEl && nameEl.textContent||'').trim().toLowerCase();
      return clients.find(function(c){ return String(c.name||'').trim().toLowerCase() === name; });
    }

    // già inizializzate?
    if (host.__bpInlineReady) return; host.__bpInlineReady = true;

    selAll('.card', host).forEach(function(card){
      if (card.__bpInline) return; card.__bpInline = true;

      var cli = findClientByCard(card);
      if (!cli) return;

      // pulsante matita
      var toolbar = document.createElement('div');
      toolbar.style.display='flex'; toolbar.style.gap='8px'; toolbar.style.marginTop='6px';
      var btn = document.createElement('button');
      btn.className='ghost'; btn.textContent='Modifica';
      toolbar.appendChild(btn);
      card.appendChild(toolbar);

      var form = document.createElement('div');
      form.style.display='none';
      form.style.marginTop='8px';
      form.innerHTML =
        '<div class="row" style="gap:8px">'+
          '<div><label>Nome</label><input class="bp-ed-name" type="text" value="'+(cli.name||'')+'"></div>'+
          '<div><label>Stato</label>'+
            '<select class="bp-ed-state">'+
              '<option value="prospect" '+(cli.status==='prospect'?'selected':'')+'>Prospect</option>'+
              '<option value="attivo" '+(cli.status==='attivo'?'selected':'')+'>Attivo</option>'+
              '<option value="cliente" '+(cli.status==='cliente'?'selected':'')+'>Cliente</option>'+
            '</select>'+
          '</div>'+
          '<div><label>Consulente</label>'+
            '<select class="bp-ed-consulente"></select>'+
          '</div>'+
          '<div style="align-self:flex-end"><button class="ghost bp-ed-save">Salva</button></div>'+
        '</div>';
      card.appendChild(form);

      // riempi select consulente
      var selCons = sel('.bp-ed-consulente', form);
      selCons.innerHTML = '<option value="">—</option>'+users.map(function(u){
        return '<option value="'+u.id+'" '+(String(cli.consultantId||'')===String(u.id)?'selected':'')+'>'+ (u.name||('User '+u.id)) +'</option>';
      }).join('');

      btn.onclick = function(){
        form.style.display = (form.style.display==='none' ? 'block' : 'none');
      };

      sel('.bp-ed-save', form).onclick = async function(ev){
        ev.preventDefault();
        try{
          var payload = {
            id: cli.id,
            name: sel('.bp-ed-name', form).value.trim(),
            status: sel('.bp-ed-state', form).value,
            consultantId: sel('.bp-ed-consulente', form).value || null
          };
          await POST('/api/clients', payload);
          // aggiorna titolo e righe presenti
          var title = sel('b', card); if (title) title.textContent = payload.name;
          var stateLine = sel('.small', card); // la prima .small è "Stato: ..."
          if (stateLine && /Stato:/.test(stateLine.textContent||'')){
            stateLine.innerHTML = 'Stato: <b>'+payload.status+'</b>';
          }
          var consLine = selAll('.small', card).find(function(n){ return /Consulente:/.test(n.textContent||''); });
          if (consLine){
            var user = users.find(function(u){ return String(u.id)===String(payload.consultantId||''); });
            consLine.innerHTML = 'Consulente: <b>'+(user? (user.name||('User '+user.id)) : '—')+'</b>';
          }
          hapticImpact('medium');
        }catch(err){
          logger.error(err);
          hapticImpact('heavy');
        }
      };
    });
  }

  // Esponi per observer
  window.applyClientsLastAppointment = applyClientsLastAppointment;
  window.ensureClientInlineEdit = ensureClientInlineEdit;

  // Wiring automatico su vista clienti
  function wire(){
    var host = document.getElementById('cl_list'); if(!host) return;
    applyClientsLastAppointment();
    ensureClientInlineEdit();
    if (!host.__bpCliObs){
      host.__bpCliObs = true;
      var mo = new MutationObserver(function(){ applyClientsLastAppointment(); ensureClientInlineEdit(); });
      mo.observe(host, {childList:true, subtree:true});
    }
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, {once:true});
  } else wire();
})();


/* ===== selettore robusto per il MODE (consuntivo/previsionale) ===== */
function __readMode(scope){
  // scope può essere 'd' (dashboard), 'cm' (provvigioni), 'tg' (team)
  const candidates = [
    `#${scope}_mode`,
    '#dash_mode',
    '#comm_mode',
    `[data-scope="${scope}"] [name="mode"]`,
    `#${scope} select[name="mode"]`,

    '#dashboard select[name="mode"]',
    'select[name="mode"]'
  ];
  for (const s of candidates){
    const el = document.querySelector(s);
    if (el && el.value) return el.value;
  }
  return 'consuntivo';
}

  if (window.__BP_FINAL_READY__) return;
  window.__BP_FINAL_READY__ = true;

  // ----------------- Utils -----------------
  const log = (...a)=>logger.info('[BP/final]', ...a);
  const $1 = (s,r)=> (r||document).querySelector(s);
  const $all = (s,r)=> Array.from((r||document).querySelectorAll(s));
  const on = (el,ev,cb)=> el && el.addEventListener(ev,cb,false);
  const onceReady = (cb)=> (document.readyState!=='loading') ? cb() : document.addEventListener('DOMContentLoaded', cb);
  const parseJSON = (x,d)=>{ try{ return JSON.parse(x);}catch(_){ return d; } };
  const pad2 = n => (n<10?'0'+n:''+n);
  const todayKey = ()=>{ const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
  const isAdmin = ()=>{ try{ const u=parseJSON(localStorage.getItem('user')||'{}',{}); return u && u.role==='admin'; }catch(_){ return false; } };

  function toast(msg){
    try{ (window.showToast?window.showToast:alert)(msg); }catch(_){ alert(msg); }
  }

  // ----------- Auth + GET/POST robusti -----------
  function bpAuthToken(){
    const tryTok = v=>{
      if(!v) return null;
      v=String(v).replace(/^"+|"+$/g,'');
      try{ const o=JSON.parse(v); if(o && (o.token||o.jwt||o.accessToken)) return o.token||o.jwt||o.accessToken; }catch(_){}
      if(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(v)) return v;
      return null;
    };
    // scandisci TUTTO il localStorage
    for(let i=0;i<localStorage.length;i++){
      const t=tryTok(localStorage.getItem(localStorage.key(i)));
      if(t) return t;
    }
    // chiavi note + sessionStorage
    const keys=['token','authToken','jwt','bp_token','accessToken','id_token','auth','authorization','bp.jwt','_token','session','user'];
    for(const k of keys){ const t=tryTok(localStorage.getItem(k)||sessionStorage.getItem(k)); if(t) return t; }
    try{ const u=parseJSON(localStorage.getItem('user')||'{}',{}); if(u&&(u.token||u.jwt||u.accessToken))return u.token||u.jwt||u.accessToken; }catch(_){}
    return null;
  }
  async function GET(url, opt={}){
    if (typeof window.GET==='function' && !opt.forceFetch) { try{ return await window.GET(url); }catch(_){} }
    const t = bpAuthToken();
    const r = await fetch(url,{ headers:{ 'Accept':'application/json', ...(t?{Authorization:'Bearer '+t}:{}) }});
    if (r.status===401 && window.GET) return window.GET(url);
    if (r.status===204) return null;
    return r.json();
  }
  async function POST(url, body, opt={}){
    if (typeof window.POST==='function' && !opt.forceFetch) { try{ return await window.POST(url,body);}catch(_){} }
    const t = bpAuthToken();
    const r = await fetch(url,{ method:'POST', headers:{ 'Content-Type':'application/json', ...(t?{Authorization:'Bearer '+t}:{}) }, body:JSON.stringify(body||{}) });
    if (!r.ok && r.status===401 && window.POST) return window.POST(url,body);
    if (r.status===204) return null;
    return r.json();
  }
  async function PUT(url, body, opt={}){
    if (typeof window.PUT==='function' && !opt.forceFetch) { try{ return await window.PUT(url,body);}catch(_){} }
    const t = bpAuthToken();
    const r = await fetch(url,{ method:'PUT', headers:{ 'Content-Type':'application/json', ...(t?{Authorization:'Bearer '+t}:{}) }, body:JSON.stringify(body||{}) });
    if (!r.ok && r.status===401 && window.PUT) return window.PUT(url,body);
    if (r.status===204) return null;
    return r.json();
  }

  // Funzione formatDate per formattare le date
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  }

  // Esponi le funzioni globalmente
  window.GET = GET;
  window.POST = POST;
  window.PUT = PUT;
  window.formatDate = formatDate;

  // --------- Patch drawFullLine (Chart.js safe) + canvas puro ----------
  function _drawLineCanvas(canvasId, labels, data){
    const el = document.getElementById(canvasId);
    if(!el) return;
    const ctx = el.getContext('2d');

    // Handle HiDPI devices by scaling the canvas according to devicePixelRatio
    const ratio = window.devicePixelRatio || 1;
    const cssW = Math.max(220, el.clientWidth || 320);
    const cssH = Math.max(80,  el.clientHeight || 80);
    el.style.width  = cssW + 'px';
    el.style.height = cssH + 'px';
    el.width  = cssW * ratio;
    el.height = cssH * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, cssW, cssH);

    const arr = Array.isArray(data) ? data.map(v => +v || 0) : [];
    if(!arr.length) return;
    const max = Math.max(...arr), min = Math.min(...arr);
    const pad = (max-min)===0 ? (max||1)*.2 : (max-min)*.2;
    const Ymax = max+pad, Ymin = Math.max(0, min-pad);
    const stepX = (arr.length>1) ? (cssW-8)/(arr.length-1) : 0;
    const xAt = i => 4 + i*stepX;
    const yAt = v => {
      const t = (v-Ymin)/(Ymax-Ymin||1);
      return cssH-6 - t*(cssH-12);
    };

    ctx.lineWidth = 2;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = '#2e6cff';
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(arr[0]));
    for(let i=1; i<arr.length; i++) ctx.lineTo(xAt(i), yAt(arr[i]));
    ctx.stroke();

    ctx.fillStyle = '#2e6cff';
    for(let i=0; i<arr.length; i++){
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(arr[i]), 2, 0, Math.PI*2);
      ctx.fill();
    }
  }
  // Monkey patch globale: se main.js definisce già drawFullLine con Chart,
  // lo rimpiazziamo con versione che distrugge il precedente grafico per evitare l’errore “Canvas is already in use…”
  (function patchDrawFullLine(){
    const safe = function(canvasId, labels, data){
      const el = document.getElementById(canvasId);
      if(!el){ return; }
      if (window.Chart){
        try{
          if (el.__chart && typeof el.__chart.destroy==='function') el.__chart.destroy();
          const tickOpts = (typeof window.computeTickOptions==='function')
            ? window.computeTickOptions(labels, el.clientWidth||320)
            : undefined;
          const cfg = {
            type:'line',
            data:{ labels, datasets:[{ data, tension:.35, pointRadius:2, borderWidth:2 }] },
            options:{
              responsive:true,
              plugins:{legend:{display:false}},
              scales:{
                x: Object.assign({ display:true }, tickOpts ? { ticks: tickOpts } : {}),
                y: { display:true }
              }
            }
          };
          el.__chart = new Chart(el.getContext('2d'), cfg);
          return;
        }catch(_){ /* fallback sotto */ }
      }
      _drawLineCanvas(canvasId, labels, data);
    };
    // Installa solo se non già patchata
    if (!window.drawFullLine || !window.drawFullLine.__patched){
      window.drawFullLine = safe;
      window.drawFullLine.__patched = true;
    }
  })();

  // -------- Buckets helpers (delegates to global labelsForBuckets if present) --------
  function labelsFor(type, buckets){
    try{
      if (typeof window.labelsForBuckets === 'function'){
        return window.labelsForBuckets(type, buckets);
      }
    }catch(_){ /* fallback below */ }
    const t = (typeof effectivePeriodType==='function')
      ? effectivePeriodType(String(type||'mensile').toLowerCase())
      : String(type||'mensile').toLowerCase();
    return (buckets||[]).map(B=>{
      const d=new Date(B.s);
      if (t==='settimanale')  return 'W'+(typeof isoWeekNum==='function'?isoWeekNum(d):'')+' '+d.getUTCFullYear();
      if (t==='mensile')      return String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
      if (t==='trimestrale')  return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear();
      if (t==='semestrale')   return (d.getUTCMonth()<6?'S1 ':'S2 ')+d.getUTCFullYear();
      return String(d.getUTCFullYear());
    });
  }
  // Cache per chiave (tipo/from/to[/userId]) per ridurre payload e garantire separazione banche dati
  const __periodsCache = (typeof window !== 'undefined' ? (window.__periodsCache || (window.__periodsCache = {})) : {});
  function _toYMD(d){ try{ const x=new Date(d); const y=x.getUTCFullYear(); const m=String(x.getUTCMonth()+1).padStart(2,'0'); const dy=String(x.getUTCDate()).padStart(2,'0'); return y+'-'+m+'-'+dy; }catch(_){ return ''; } }
  function _effType(t){ try{ return (typeof effectivePeriodType==='function') ? effectivePeriodType(String(t||'mensile').toLowerCase()) : String(t||'mensile').toLowerCase(); }catch(_){ return String(t||'mensile').toLowerCase(); } }
  async function ensurePeriods(scopeOrOpts){
    // Non fare chiamate se l'utente non è loggato
    if (!window.getUser || !window.getUser()) {
      return window.periods || [];
    }
    
    // Non fare chiamate se è stato rilevato un 401 globale
    if (window.__BP_401_DETECTED === true) {
      return window.periods || [];
    }
    
    // Backcompat: nessun argomento -> usa cache globale legacy
    if (!scopeOrOpts){
      if (Array.isArray(window.periods) && window.periods.length) return window.periods;
      try{ 
        const j = await GET('/api/periods?global=1'); 
        if (j && Array.isArray(j.periods)){ window.periods=j.periods; return j.periods; } 
      }catch(e){
        // Se è un 401, non fare retry
        if (window.__BP_401_DETECTED === true) return window.periods || [];
      }
      return window.periods || [];
    }

    // Calcola type/from/to dal range unificato in base allo scope, o usa opts espliciti
    let type, fromISO, toISO, userId=null;
    if (typeof scopeOrOpts === 'string'){
      const r = (window.readUnifiedRange && window.readUnifiedRange(scopeOrOpts)) || { type:'mensile', end:new Date() };
      type = r.type || 'mensile';
      const buckets = (window.buildBuckets ? window.buildBuckets(type, r.end) : []);
      if (buckets && buckets.length){
        fromISO = _toYMD(new Date(buckets[0].s));
        toISO   = _toYMD(new Date(buckets[buckets.length-1].e));
      } else if (r.start && r.end){
        fromISO = _toYMD(new Date(r.start));
        toISO   = _toYMD(new Date(r.end));
      } else {
        const now=new Date(); fromISO=_toYMD(now); toISO=_toYMD(now);
      }
    } else {
      const o = scopeOrOpts || {};
      type = o.type || 'mensile';
      fromISO = o.from || _toYMD(new Date());
      toISO   = o.to   || _toYMD(new Date());
      userId  = o.userId || null;
    }
    const eff = _effType(type);
    const key = [eff, fromISO, toISO, userId||''].join('|');
    if (__periodsCache[key]) return __periodsCache[key];

    const qs = ['?global=1','type='+encodeURIComponent(eff),'from='+encodeURIComponent(fromISO),'to='+encodeURIComponent(toISO)]
                .concat(userId?[ 'userId='+encodeURIComponent(userId) ]:[]).join('&').replace('?&','?');
    try{
      // Non fare chiamate se è stato rilevato un 401 globale
      if (window.__BP_401_DETECTED === true) return [];
      
      const j = await GET('/api/periods'+qs).catch(function(e){
        // Se è un 401, non fare retry alternativo
        if (window.__BP_401_DETECTED === true) throw e;
        return GET('/api/periods'+qs.replace('?global=1','?').replace('??','?'));
      });
      const rows = (j && Array.isArray(j.periods)) ? j.periods : [];
      __periodsCache[key] = rows;
      return rows;
    }catch(e){
      // Se è un 401, non fare retry
      if (window.__BP_401_DETECTED === true) return [];
      return [];
    }
  }
  function sumIndicator(p, mode, k){
    const bag = (String(mode).toLowerCase()==='previsionale') ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{});
    const v = Number(bag[k]||0); return Number.isFinite(v)?v:0;
  }

// -------- Mini-charts --------
function drawLineGeneric(canvasId, labels, data){
  // usa patch globale drawFullLine (Chart.js) oppure canvas puro
  if (typeof window.drawFullLine==='function') return window.drawFullLine(canvasId, labels, data);
  _drawLineCanvas(canvasId, labels, data);
}


async function recomputeDashboardMini(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    console.log('[recomputeDashboardMini] Utente non loggato, skip');
    return;
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    console.log('[recomputeDashboardMini] 401 già rilevato globalmente, skip');
    return;
  }
  
  // NB: scope 'dash' (non 'd')
  const r = (window.readUnifiedRange && window.readUnifiedRange('dash')) || { type:'mensile', end:new Date() };
  const type = r.type || 'mensile';
  const mode = __readMode('dash'); // consuntivo | previsionale

  // Leggi il filtro utente come fanno recomputeKPI e recomputeMini
  const el = document.getElementById('dash_cons');
  const cons = el ? el.value : null;

  const buckets = (window.buildBuckets?window.buildBuckets(type, r.end):[]);
  const periods = await ensurePeriods('dash', cons ? { userId: cons } : {});
  const L = labelsFor(type, buckets);

  ['VSS','VSDPersonale','GI','NNCF'].forEach(k=>{
    const data = buckets.map(B=>{
      let s = 0;
      periods.forEach(p=>{
        if (p.type !== effectivePeriodType(type)) return;
        const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
        if (ps>=B.s && pe<=B.e) s += sumIndicator(p, mode, k);
      });
      return Math.round(s);
    });
    drawLineGeneric('d_mini_'+k.toLowerCase(), L, data);
  });

  // Aggiorna anche i valori numerici dei minichart
  const totals = { VSS:0, VSDPersonale:0, VSDIndiretto:0, GI:0, NNCF:0, PROVV:0 };
  const f = new Date(r.start).getTime();
  const t = new Date(r.end).getTime();
  periods.forEach(p=>{
    if (p.type !== effectivePeriodType(type)) return;
    const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
    if (ps >= f && pe <= t) {
      const bag = (String(mode).toLowerCase()==='previsionale') ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{});
      
      // Helper robusti come in recomputeKPI
      function asNum(v){ v = Number((v==null?'':v)); return isFinite(v)?v:0; }
      function pickVSDInd(bag){
        if(!bag) return 0;
        var k = ['VSDIndiretto','vsdIndiretto','VSD_indiretto','VSDI'];
        for(var i=0;i<k.length;i++){
          if (bag[k[i]] != null) return asNum(bag[k[i]]);
        }
        if (bag.VSDTotale != null && bag.VSDPersonale != null){
          return asNum(bag.VSDTotale) - asNum(bag.VSDPersonale);
        }
        return 0;
      }
      function pickProvv(bag){
        if(!bag) return 0;
        if (bag.TotProvvigioni != null) return asNum(bag.TotProvvigioni);
        return asNum(bag.ProvvGI) + asNum(bag.ProvvVSD);
      }
      
      totals.VSS += asNum(bag.VSS);
      totals.VSDPersonale += asNum(bag.VSDPersonale);
      totals.VSDIndiretto += pickVSDInd(bag);
      totals.GI += asNum(bag.GI);
      totals.NNCF += asNum(bag.NNCF);
      totals.PROVV += pickProvv(bag);
    }
  });

  // Aggiorna i valori numerici se le funzioni sono disponibili
  if (window.setText && window.fmtEuro && window.fmtInt) {
    window.setText('kpi_vss', window.fmtEuro(Math.round(totals.VSS)));
    window.setText('kpi_vsd', window.fmtEuro(Math.round(totals.VSDPersonale)));
    window.setText('kpi_vsd_ind', window.fmtEuro(Math.round(totals.VSDIndiretto)));
    window.setText('kpi_gi', window.fmtEuro(Math.round(totals.GI)));
    window.setText('kpi_nncf', window.fmtInt(Math.round(totals.NNCF)));
    window.setText('kpi_provv', window.fmtEuro(Math.round(totals.PROVV)));
  }

  // Coach: obiettivi raggiunti o vicini (80% / 100%)
  try{
    if (window.BP && BP.Targets && typeof BP.Targets.getForPeriod==='function'){
      const user = JSON.parse(localStorage.getItem('user')||'{}')||{};
      const grade = String(user.grade||'junior').toLowerCase()==='senior'?'senior':'junior';
      const tgt = BP.Targets.getForPeriod(grade, effectivePeriodType(type)) || {};
      const keys = ['VSS','VSDPersonale','GI','NNCF'];
      const lastVals = {};
      keys.forEach(k=>{
        let s=0; const B=buckets[buckets.length-1]; if(!B) return;
        periods.forEach(p=>{
          // GRANULARITÀ RISPETTATA: Solo periodi del tipo selezionato
          if (p.type !== effectivePeriodType(type)) return;
          
          // LOGICA IBRIDA: Usa numeri periodo per granularità, date reali per matching
          let matches = false;
          if (p.year && p.month && p.quarter) {
            // Usa sempre le date reali dal database per il matching
            const ps = new Date(p.startDate).getTime();
            const pe = new Date(p.endDate).getTime();
            matches = ps >= B.s && pe <= B.e;
          } else {
            // FALLBACK: Usa date tradizionali se numeri periodo non disponibili
            const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
            matches = ps >= B.s && pe <= B.e;
          }
          
          if (matches) s += sumIndicator(p, mode, k);
        });
        lastVals[k]=Math.round(s);
      });
      window.__bpCoachKpiFired = window.__bpCoachKpiFired || {};
      keys.forEach(k=>{
        const target = Number(tgt[k]||0);
        if (target<=0) return;
        const val = Number(lastVals[k]||0);
        const pct = Math.round((val/target)*100);
        const base = effectivePeriodType(type)+'_'+k;
        if (pct>=100 && !window.__bpCoachKpiFired[base+'_100']){
          window.__bpCoachKpiFired[base+'_100']=true;
          try{ document.dispatchEvent(new CustomEvent('kpi:goal-reached',{ detail:{ key:k, value:val, target } })); }catch(_){ }
        } else if (pct>=80 && !window.__bpCoachKpiFired[base+'_80']){
          window.__bpCoachKpiFired[base+'_80']=true;
          try{ document.dispatchEvent(new CustomEvent('kpi:goal-80',{ detail:{ key:k, value:val, target } })); }catch(_){ }
        }
      });
    }
  }catch(_){ }
}

async function recomputeCommsMini(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    console.log('[recomputeCommsMini] Utente non loggato, skip');
    return;
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    console.log('[recomputeCommsMini] 401 già rilevato globalmente, skip');
    return;
  }
  
  // Scope coerente con main: 'comm' (fallback 'cm')
  const scope = 'comm';
  const r = (window.readUnifiedRange && (window.readUnifiedRange(scope) || window.readUnifiedRange('cm'))) 
            || { type:'mensile', end:new Date() };
  const type = r.type || 'mensile';
  const mode = (__readMode && __readMode(scope)) || (__readMode && __readMode('cm')) || 'cons';

  const buckets = (window.buildBuckets ? window.buildBuckets(type, r.end) : []);
  const periods = await ensurePeriods('comm');
  const L = labelsFor(type, buckets);

  const data = buckets.map(B=>{
    let s = 0;
    periods.forEach(p=>{
      // GRANULARITÀ RISPETTATA: Solo periodi del tipo selezionato
      if (p.type !== effectivePeriodType(type)) return;
      
      // LOGICA IBRIDA: Usa numeri periodo per granularità, date reali per matching
      let matches = false;
      if (p.year && p.month && p.quarter) {
        // Usa sempre le date reali dal database per il matching
        const ps = new Date(p.startDate).getTime();
        const pe = new Date(p.endDate).getTime();
        matches = ps >= B.s && pe <= B.e;
      } else {
        // FALLBACK: Usa date tradizionali se numeri periodo non disponibili
        const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
        matches = ps >= B.s && pe <= B.e;
      }
      
      if (matches) s += sumIndicator(p, mode, 'VSDPersonale');
    });
    return Math.round(s);
  });
  drawLineGeneric('cm_mini_vsd', L, data);
}

async function recomputeTeamChart(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    console.log('[recomputeTeamChart] Utente non loggato, skip');
    return;
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    console.log('[recomputeTeamChart] 401 già rilevato globalmente, skip');
    return;
  }

// ---------- Team: grafico aggregato (admin) ----------
var __bp_usersCache = null;
var __bp_settingsCache = null;

function ensureUsers(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    return Promise.resolve(__bp_usersCache || []);
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    return Promise.resolve(__bp_usersCache || []);
  }
  if (__bp_usersCache) return Promise.resolve(__bp_usersCache);
  return GET('/api/usernames').then(function(r){
    __bp_usersCache = (r && r.users) || [];
    return __bp_usersCache;
  }).catch(function(e){
    if (window.__BP_401_DETECTED === true) return __bp_usersCache || [];
    throw e;
  });
}

function ensureSettings(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    return Promise.resolve(__bp_settingsCache || {});
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    return Promise.resolve(__bp_settingsCache || {});
  }
  if (__bp_settingsCache) return Promise.resolve(__bp_settingsCache);
  return GET('/api/settings').then(function(r){
    __bp_settingsCache = r || {};
    return __bp_settingsCache;
  }).catch(function(e){
    if (window.__BP_401_DETECTED === true) return __bp_settingsCache || {};
    throw e;
  });
}

function gradeFor(userId){
  var u = (__bp_usersCache || []).find(function(x){ return String(x.id)===String(userId); });
  return u && u.grade ? String(u.grade).toLowerCase() : 'junior';
}

function extractRates(settings){
  try{
    if (typeof getRates === 'function') return getRates(settings);
  }catch(_){}
  var c = (settings && settings.commissions) || {};
  return {
    gi: Number(c.gi || 0),
    vsdJunior: Number(c.vsdJunior || 0),
    vsdSenior: Number(c.vsdSenior || 0)
  };
}

function sumProvvForPeriod(p, mode, which, rates){
  var bag = (mode==='prev') ? (p.indicatorsPrev || {}) : (p.indicatorsCons || {});
  var gi  = Number(bag.GI || 0);
  var vsd = Number(bag.VSDPersonale || 0);

  var rGI  = Number(rates.gi || 0);
  var rVSD = 0;

  if (which==='provv_vsd' || which==='tot_provv'){
    var g = gradeFor(p.userId);
    rVSD = (g==='senior') ? Number(rates.vsdSenior || 0) : Number(rates.vsdJunior || 0);
  }

  var pv_gi  = gi  * rGI;
  var pv_vsd = vsd * rVSD;

  if (which==='provv_gi')  return pv_gi;
  if (which==='provv_vsd') return pv_vsd;
  if (which==='tot_provv') return pv_gi + pv_vsd;
  return 0;
}

  function sumProvv(periods, mode, which, rates){
  var s = 0;
  for (var i=0;i<periods.length;i++) s += sumProvvForPeriod(periods[i], mode, which, rates);
  return Math.round(s);
}

  function recomputeTeamAggChart(){
  // Non fare chiamate API se l'utente non è loggato
  if (!window.getUser || !window.getUser()) {
    console.log('[recomputeTeamAggChart] Utente non loggato, skip');
    return;
  }
  
  // Non fare chiamate API se è stato rilevato un 401 globale
  if (window.__BP_401_DETECTED === true) {
    console.log('[recomputeTeamAggChart] 401 già rilevato globalmente, skip');
    return;
  }
  
  var canvas = $1('#t_chart');
  if (!canvas) return;

  var modeEl = $1('#t_mode');
  var mode   = modeEl ? modeEl.value : 'cons';
  var indEl  = $1('#t_ind');
  var ind    = indEl ? indEl.value : 'tot_provv';

  // Legge range unificato "t" (stessa logica degli altri grafici)
  var rng    = readUnifiedRange('t');
  var type   = rng && (rng.type || rng.gran) || 'mensile';
  // Costruisce i bucket coerenti col tipo (YTD/LTM inclusi)
  var B      = (typeof buildBuckets==='function') ? buildBuckets(type, rng && rng.end) : [];
  var labels = labelsFor(type, B);

  Promise.all([
    ensurePeriods('t'),
    ensureUsers(),
    ensureSettings()
  ]).then(function(arr){
    var periods  = arr[0] || [];
    var rates    = extractRates(arr[2] || {});

    // B già calcolati sopra

    // Riempie i bucket con i periodi pertinenti
    periods.forEach(function(p){
      if (p.type !== effectivePeriodType(type)) return;
      var ps = new Date(p.startDate).getTime();
      var pe = new Date(p.endDate).getTime();
      for (var i=0;i<B.length;i++){
        if (ps>=B[i].s && pe<=B[i].e){
          (B[i].periods = B[i].periods || []).push(p);
          break;
        }
      }
    });

    // Calcola la serie dati per indicatore scelto
    var data = B.map(function(bucket){
      var list = bucket.periods || [];
      if (!list.length) return 0;

      // indicatori "base" usano la stessa sum dei grafici esistenti
      if (ind==='VSS' || ind==='VSDPersonale' || ind==='GI' || ind==='NNCF'){
        var s=0;
        for (var k=0;k<list.length;k++) s += sumIndicator(list[k], mode, ind);
        return Math.round(s);
      }

      // indicatori provvigionali
      return sumProvv(list, mode, ind, rates);
    });

    drawLineGeneric('t_chart', labels, data);
  }).catch(function(err){
    logger.error(err);
  });
}
// ---------- /Team: grafico aggregato (admin) ----------

  // Scope coerente con main: 't' (fallback 'tg')
  const r = (window.readUnifiedRange && (window.readUnifiedRange('t') || window.readUnifiedRange('tg'))) 
            || { type:'mensile', end:new Date() };
  const type = r.type || 'mensile';
  const mode = (__readMode && __readMode('t')) || (__readMode && __readMode('tg')) || 'cons';

  const userId = ($1('#tg_user')||{}).value || '';
  const ind    = ($1('#tg_ind')||{}).value || 'VSS';

  const buckets = (window.buildBuckets ? window.buildBuckets(type, r.end) : []);
  function __ymd(d){ try{ const x=new Date(d); const y=x.getUTCFullYear(); const m=String(x.getUTCMonth()+1).padStart(2,'0'); const dy=String(x.getUTCDate()).padStart(2,'0'); return y+'-'+m+'-'+dy; }catch(_){ return ''; } }
  const fromISO = buckets.length ? __ymd(new Date(buckets[0].s)) : __ymd(new Date());
  const toISO   = buckets.length ? __ymd(new Date(buckets[buckets.length-1].e)) : __ymd(new Date());
  const periods = await ensurePeriods({ type: type, from: fromISO, to: toISO, userId: (userId||null) });
  const L = labelsFor(type, buckets);

  const data = buckets.map(B=>{
    let s = 0;
    periods.forEach(p=>{
      // GRANULARITÀ RISPETTATA: Solo periodi del tipo selezionato
      if (p.type !== effectivePeriodType(type)) return;
      if (userId && String(p.userId)!==String(userId)) return;
      
      // LOGICA IBRIDA: Usa numeri periodo per granularità, date reali per matching
      let matches = false;
      if (p.year && p.month && p.quarter) {
        // Usa sempre le date reali dal database per il matching
        const ps = new Date(p.startDate).getTime();
        const pe = new Date(p.endDate).getTime();
        matches = ps >= B.s && pe <= B.e;
      } else {
        // FALLBACK: Usa date tradizionali se numeri periodo non disponibili
        const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
        matches = ps >= B.s && pe <= B.e;
      }
      
      if (matches) s += sumIndicator(p, mode, ind);
    });
    return Math.round(s);
  });

  drawLineGeneric('tg_chart', L, data);
}

function wireMiniChartTriggers(){
  // Dashboard – accetta entrambe le id (legacy + nuove)
  on($1('#dash_mode'),'change', ()=>{ hapticImpact('light'); if (window.recomputeDashboard) recomputeDashboard(); if (window.recomputeDashboardMini) recomputeDashboardMini(); if (window.recomputeKPI) window.recomputeKPI(); });
  on($1('#d_mode'),   'change', ()=>{ hapticImpact('light'); if (window.recomputeDashboard) recomputeDashboard(); if (window.recomputeDashboardMini) recomputeDashboardMini(); if (window.recomputeKPI) window.recomputeKPI(); });
  
  // Dashboard – trigger per cambio consulente
  on($1('#dash_cons'),'change', ()=>{ hapticImpact('light'); if (window.recomputeDashboardMini) recomputeDashboardMini(); if (window.recomputeKPI) window.recomputeKPI(); });

  // Provvigioni – accetta entrambe
  on($1('#comm_mode'),'change', ()=>{ hapticImpact('light'); if (window.recomputeCommsMini) recomputeCommsMini(); });
  on($1('#cm_mode'),  'change', ()=>{ hapticImpact('light'); if (window.recomputeCommsMini) recomputeCommsMini(); });

  // Squadra (non-admin): popola la select utenti se vuota
  const sel = $1('#tg_user');
  if (sel && sel.options.length<=1){
    GET('/api/usernames').then(j=>{
      (j && j.users || []).forEach(u=>{
        var opt=document.createElement('option');
        opt.value = u.id;
        opt.textContent = (u.name || ('User '+u.id)) + (u.grade?(' – '+u.grade):'');
        sel.appendChild(opt);
      });
    }).catch(err => logger.error(err));
  }

  // Squadra: trigger su modalità e range unificato "t" → ricarica entrambi i grafici se presenti
  const fireTeam = ()=>{ if (window.recomputeTeamChart) recomputeTeamChart(); if (window.recomputeTeamAggChart) recomputeTeamAggChart(); };
  on($1('#t_mode'),'change', ()=>{ hapticImpact('light'); fireTeam(); });

  // Filtri unificati "t" (anno, mese, trimestre, date libere)
  ['#t_y','#t_m','#t_q','#t_from','#t_to'].forEach(id=>{
    const el=$1(id); if(el) on(el,'change', fireTeam);
  });

  // Cambio utente nel grafico non-admin
  if (sel) on(sel,'change', ()=>{ hapticImpact('light'); if (window.recomputeTeamChart) recomputeTeamChart(); });

  // Indicatore del grafico aggregato admin
  const ind = $1('#t_ind');
  if (ind) on(ind,'change', ()=>{ hapticImpact('light'); if (window.recomputeTeamAggChart) recomputeTeamAggChart(); });

  // Primo render (se i canvas esistono)
  if ($1('#tg_chart') && window.recomputeTeamChart)      recomputeTeamChart();
  if ($1('#t_chart')  && window.recomputeTeamAggChart)   recomputeTeamAggChart();
} // end wireMiniChartTriggers

// -------- Calendario --------

/** Fallback se i giorni nel DOM sono senza zeri iniziali e normalizzazioni varie */
if (typeof window.todayKey !== 'function') {
  window.todayKey = function todayKey() {
    var d  = new Date();
    var y  = d.getFullYear();
    var m  = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  };
}

/** Evidenzia la cella "oggi" leggendo data-day o data-date (YYYY-MM-DD) */
function markToday(){
  try{
    var k = todayKey();
    var el = document.querySelector('.calendar .day[data-day="'+k+'"], .calendar .day[data-date="'+k+'"]');
    if(!el){
      // fallback: se le celle hanno solo il numero, tenta una corrispondenza “soft” dentro il mese corrente
      var dd = parseInt(k.slice(8,10),10);
      var cells = document.querySelectorAll('.calendar .day');
      for(var i=0;i<cells.length;i++){
        var c = cells[i];
        var n = parseInt((c.getAttribute('data-day')||c.getAttribute('data-date')||'').slice(8,10) || c.textContent.trim(), 10);
        if(n===dd){ el=c; break; }
      }
    }
    if(el) el.classList.add('today');
  }catch(_){}
}

/** Rimuove lo stato "libero" ai giorni passati, mantiene oggi e futuri */
function clampSlotCounters(){
  try{
    var k = todayKey();
    var cells = document.querySelectorAll('.calendar .day[data-day], .calendar .day[data-date]');
    for(var i=0;i<cells.length;i++){
      var c = cells[i];
      var key = (c.getAttribute('data-day')||c.getAttribute('data-date')||'').slice(0,10);
      if(key && key < k){
        c.classList.remove('slot-free'); // non mostrare “libero” nel passato
      }
    }
  }catch(_){}
}

/** Aggancia export ICS anche all’interno dei box giorno (#cal_day_box) */
function wireICSInsideDayBox(){
  try{
    var box = document.getElementById('cal_day_box');
    if(!box) return;
    var cards = box.querySelectorAll('.cal-app');
    for(var i=0;i<cards.length;i++){
      var card = cards[i];
      if(card.querySelector('[data-ics-inline]')) continue; // già agganciato

      var start = card.getAttribute('data-start') || '';
      var end   = card.getAttribute('data-end')   || '';
      var title = card.getAttribute('data-title') || (card.querySelector('b')? card.querySelector('b').textContent.trim() : 'Appuntamento');

      if(!start || !end) continue;
      if(!(window.BP && BP.ICS && typeof BP.ICS.downloadIcsForAppointment==='function')) continue;

      var btn = document.createElement('button');
      btn.className = 'ghost btn-ics';
      btn.textContent = '📅';
      btn.setAttribute('data-ics-inline','1');
      btn.style.marginTop = '6px';

      btn.addEventListener('click', function(ev){
        ev.stopPropagation();
        var par = ev.currentTarget.parentElement;
        var st  = par.getAttribute('data-start');
        var en  = par.getAttribute('data-end');
        var tt  = par.getAttribute('data-title') || (par.querySelector('b')? par.querySelector('b').textContent.trim() : 'Appuntamento');
        var obj = { client: tt, start: st, end: en, type: 'manuale', vss: 0, vsdPersonal: 0, nncf: false };
        try{
          BP.ICS.downloadIcsForAppointment(obj);
          hapticImpact('medium');
        }catch(_){}
      });

      card.appendChild(btn);
    }
  }catch(_){}
}

// Esponi per Observer e per il main
window.markToday = window.markToday || markToday;
window.clampSlotCounters = window.clampSlotCounters || clampSlotCounters;
window.wireICSInsideDayBox = window.wireICSInsideDayBox || wireICSInsideDayBox;

// -------- Report: Gmail Web/App --------
(function(){
  function enc(s){ return encodeURIComponent(String(s||'')); }

  function resolveCC(){
    // prova /api/users_emails, fallback /api/usernames
    return GET('/api/users_emails').then(function(r){
      if (r && Array.isArray(r.emails)) return r.emails.filter(Boolean);
      if (r && Array.isArray(r.users))  return r.users.map(u=>u.email).filter(Boolean);
      return [];
    }).catch(function(){
      return GET('/api/usernames').then(function(r){
        var users=(r&&r.users)||[];
        return users.map(u=>u.email).filter(Boolean);
      }).catch(function(){ return []; });
    });
  }

  function getSubject(){ var el=document.getElementById('report_subject'); return (el && el.value.trim()) || 'Report BP'; }
  function getBody(){ var el=document.getElementById('report_body'); return (el && el.value) || ''; }

  function wireReportButtons(){
    var btnWeb = document.getElementById('rep_gmail_web');
    var btnApp = document.getElementById('rep_gmail_app');
    if(!btnWeb && !btnApp) return;

    resolveCC().then(function(ccList){
      var cc = (ccList||[]).join(',');
      function makeWebURL(){
        return 'https://mail.google.com/mail/?view=cm&fs=1&tf=1'
          + '&su=' + enc(getSubject())
          + '&cc=' + enc(cc)
          + '&body=' + enc(getBody());
      }
      function makeAppURL(){
        return 'googlegmail:///co'
          + '?subject=' + enc(getSubject())
          + '&cc=' + enc(cc)
          + '&body=' + enc(getBody());
      }

      if(btnWeb){
        btnWeb.onclick=function(){
          try{ navigator.clipboard && navigator.clipboard.writeText(getBody()); }catch(_){}
          window.open(makeWebURL(), '_blank');
        };
      }
      if(btnApp){
        btnApp.onclick=function(){
          try{ navigator.clipboard && navigator.clipboard.writeText(getBody()); }catch(_){}
          // tenta app Gmail, poi fallback mailto
          location.href = makeAppURL();
          setTimeout(function(){
            if (!document.hidden){
              var mailto = 'mailto:?subject=' + enc(getSubject())
                         + '&cc=' + enc(cc)
                         + '&body=' + enc(getBody());
              location.href = mailto;
            }
          }, 1200);
        };
      }
    });
  }

  // export safe
  var F = (window.BPFinal = window.BPFinal || {});
  F.wireReportButtons = wireReportButtons;
  if (!window.wireReportButtons) window.wireReportButtons = wireReportButtons;
})();


// -------- Clienti: filtri + card enrich + inline admin --------

/* 1) Cache “ultimo appuntamento” per TUTTI i clienti
      - un solo GET
      - coalescing richieste concorrenti
      - piccola cache per evitare refetch inutili
*/
(function(){
  let _lastMapCache = { ts: 0, map: null };
  let _inFlight = null;

  function buildMapFromAppointments(list){
    const map = Object.create(null); // name_lower -> last_ts (ms)
    for(const a of (list||[])){
      const key = String(a.client||'').toLowerCase();
      if(!key) continue;
      const ts = +new Date(a.end||a.start||0);
      if(!map[key] || ts > map[key]) map[key] = ts;
    }
    return map;
  }

  window.BPFinal = window.BPFinal || {};
  BPFinal.getLastApptMap = function getLastApptMap(){
    const now = Date.now();
    if (_lastMapCache.map && (now - _lastMapCache.ts) < 15000) {
      return Promise.resolve(_lastMapCache.map);
    }
    if (_inFlight) return _inFlight;

    _inFlight = GET('/api/appointments?global=1')
      .then(j => buildMapFromAppointments((j && j.appointments) || []))
      .then(map => {
        _lastMapCache = { ts: Date.now(), map };
        return map;
      })
      .catch(() => ({}))
      .finally(() => { _inFlight = null; });

    return _inFlight;
  };
})();

// Mostra/chiude gli appuntamenti per un cliente direttamente nella card
function showClientAppointments(card){
  if(!card) return;
  let box = card.querySelector('.bp-appts');
  // Se già visibile, chiudi
  if(box && box.style.display !== 'none'){
    box.remove();
    return;
  }
  if(!box){
    box = document.createElement('div');
    box.className = 'bp-appts';
    box.style.marginTop = '8px';
    card.appendChild(box);
  }
  box.innerHTML = '<div class="muted">Caricamento…</div>';
  box.style.display = 'block';

  const id   = card.getAttribute('data-clid') || '';
  const name = (card.querySelector('b')?.textContent || '').trim();
  GET('/api/appointments?global=1').then(j=>{
    const list = (j&&j.appointments)||[];
    const key = name.toLowerCase();
    const arr = list.filter(a => String(a.clientId||'')===id || String(a.client||'').trim().toLowerCase()===key);
    arr.sort((a,b)=> BPTimezone.parseUTCString(b.start) - BPTimezone.parseUTCString(a.start));
    const rows = arr.map(a=>{
      const d = BPTimezone.parseUTCString(a.start);
      const dd = ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
      const ind=[];
      if(Number(a.vss)>0) ind.push('VSS '+Number(a.vss).toLocaleString('it-IT')+'€');
      if(Number(a.vsdPersonal)>0) ind.push('VSD '+Number(a.vsdPersonal).toLocaleString('it-IT')+'€');
      if(Number(a.vsdIndiretto)>0) ind.push('VSD ind '+Number(a.vsdIndiretto).toLocaleString('it-IT')+'€');
      if(Number(a.telefonate)>0) ind.push('Tel '+Number(a.telefonate));
      if(Number(a.appFissati)>0) ind.push('AppFiss '+Number(a.appFissati));
      return `<div class="small">${htmlEscape(a.type||'')} – ${dd}${ind.length?' – '+ind.join(' · '):''}</div>`;
    }).join('') || '<div class="muted">Nessun appuntamento</div>';
    box.innerHTML = rows;
  }).catch(err=>{
    logger.error(err);
    box.innerHTML = '<div class="muted">Errore caricamento appuntamenti</div>';
  });
}
BPFinal.showClientAppointments = showClientAppointments;

/* 2) Enrichment delle card Clienti:
      - scrive “Ultimo appuntamento”
      - imposta data-last-ts per l’ordinamento
*/
BPFinal.enrichClientCards = function enrichClientCards(){
  const host = document.getElementById('cl_list');
  if(!host) return;

  BPFinal.getLastApptMap().then(map => {
    const cards = host.querySelectorAll('.card[data-clid], .card');
    for(const card of cards){
      const nameNode = card.querySelector('b');
      const name = (nameNode ? nameNode.textContent : (card.getAttribute('data-name')||'')).trim().toLowerCase();
      const ts = map[name] || 0;

      // dove scrivere la data: compatibile con markup vecchio/nuovo
      const span = card.querySelector('.last-appt, .client-last');
      if(span){
        if(ts){
          const d = new Date(ts);
          const dd = ('0'+d.getDate()).slice(-2);
          const mm = ('0'+(d.getMonth()+1)).slice(-2);
          const yyyy = d.getFullYear();
          span.textContent = `${dd}/${mm}/${yyyy}`;
        } else {
          span.textContent = '—';
        }
      }
      card.setAttribute('data-last-ts', String(ts||0));
      // per ordinamento A→Z
      if(!card.getAttribute('data-name-lower') && name){
        card.setAttribute('data-name-lower', name);
      }

      if(!card.__bp_appts){
        card.__bp_appts = true;
        card.addEventListener('click', ev=>{
          if(ev.target.closest('button,select,input,a')) return;
          // Non interferire con le card degli appuntamenti (che hanno data-aid)
          if(card.hasAttribute('data-aid')) return;
          showClientAppointments(card);
        });
      }
    }
  });
};

/* 3) Inline edit (admin) — nome, stato, consulente
      - niente GET ripetuti
      - salva con POST('/api/clients')
/* 3) Inline edit — nome, stato, consulente
      VERSIONE APERTA: abilitata per qualunque utente (nessun controllo ruolo/flag) */
BPFinal.enableClientsInlineAdmin = function enableClientsInlineAdmin(){
  const host = document.getElementById('cl_list');
  if(!host) return;
  if(host.__bp_inline_admin_wired) return; // evita doppi wiring
  host.__bp_inline_admin_wired = true;

  let usersCache=null;
  function loadUsers(){
    if(usersCache) return Promise.resolve(usersCache);
    return GET('/api/usernames')
      .then(r => (usersCache=(r&&r.users)||[]))
      .catch(()=>[]);
  }

  const STATES=['attivo','lead non chiuso','potenziale'];

  function attachPencil(card){
    if(!card || card.nodeType!==1) return;
    if(card.querySelector('[data-edit-client]')) return;

    card.style.position='relative';
    const btn=document.createElement('button');
    btn.className='ghost small';
    btn.textContent='Modifica';
    btn.title='Modifica cliente';
    btn.setAttribute('data-edit-client','1');
    btn.style.position='absolute';
    btn.style.right='8px';
    btn.style.top='8px';
    btn.style.zIndex='2';
    btn.style.cursor='pointer';
    card.appendChild(btn);

    btn.addEventListener('click', function(){
      const id   = card.getAttribute('data-clid') || card.dataset.clid || '';
      const nameEl = card.querySelector('b');
      const stEl   = card.querySelector('.cl-status, .client-status');
      const consEl = card.querySelector('.cl-cons, .client-owner');

      const orig = {
        name: nameEl ? nameEl.textContent.trim() : '',
        status: String((stEl && stEl.textContent) || card.getAttribute('data-status') || 'potenziale').toLowerCase(),
        consId: card.getAttribute('data-consultant-id') || '',
        consText: consEl ? consEl.textContent : '—'
      };

      // Nome -> input
      const nameInput=document.createElement('input');
      nameInput.type='text'; nameInput.value=orig.name; nameInput.style.width='100%';
      if(nameEl) nameEl.replaceWith(nameInput);

      // Stato -> select
      const statusSel=document.createElement('select');
      statusSel.innerHTML = STATES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('');
      statusSel.value = STATES.includes(orig.status) ? orig.status : 'potenziale';
      if(stEl){ stEl.textContent=''; stEl.appendChild(statusSel); }

      // Consulente -> select (dopo fetch utenti)
      loadUsers().then(users=>{
        const sel=document.createElement('select');
        sel.innerHTML = `<option value="">—</option>` + users.map(u =>
          `<option value="${u.id}">${(u.name||('User '+u.id))}${u.grade?(' ('+u.grade+')'):''}</option>`).join('');
        if(orig.consId) sel.value=String(orig.consId);
        if(consEl){ consEl.textContent=''; consEl.appendChild(sel); }

        // Azioni
        const actions=document.createElement('div');
        actions.className='row'; actions.style.marginTop='8px';
        const save=document.createElement('button'); save.textContent='Salva';
        const cancel=document.createElement('button'); cancel.textContent='Annulla'; cancel.className='ghost';
        actions.appendChild(save); actions.appendChild(cancel);
        card.appendChild(actions);

        cancel.addEventListener('click', function(){
          const b=document.createElement('b'); b.textContent=orig.name;
          nameInput.replaceWith(b);
          if(stEl) stEl.textContent=orig.status;
          consEl.textContent = orig.consText || '—';
          actions.remove();
        });

        save.addEventListener('click', function(){
          const payload={
            id: id,
            name: nameInput.value.trim(),
            status: statusSel.value
          };
          const cid = sel.value ? String(sel.value) : '';
          if(cid) payload.consultantId=cid;

          POST('/api/clients', payload).then(function(){
            toast('Cliente aggiornato'); if(typeof addXP==='function') addXP(4);

            const b=document.createElement('b'); b.textContent=payload.name||orig.name;
            nameInput.replaceWith(b);
            if(stEl) stEl.textContent=payload.status;
            if(cid){
              consEl.textContent = sel.options[sel.selectedIndex].textContent || ('#'+cid);
              card.setAttribute('data-consultant-id', cid);
            }else{
              consEl.textContent = '—';
              card.setAttribute('data-consultant-id', '');
            }
            card.setAttribute('data-status', payload.status);
            actions.remove();
          }).catch(function(err){
            logger.error(err); toast('Errore aggiornamento cliente');
          });
        });
      });
    });
  }

  // attacca alle card presenti e future
  host.querySelectorAll('.card[data-clid], .card').forEach(attachPencil);
  const obs = new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1 && (n.matches('.card[data-clid], .card'))) attachPencil(n);
        if(n.nodeType===1 && n.querySelectorAll){
          n.querySelectorAll('.card[data-clid], .card').forEach(attachPencil);
        }
      }
    }
  });
  obs.observe(host, { childList:true, subtree:true });
};
/* 4) Ordinamento lista in-place */

BPFinal.applyClientSort = function applyClientSort(){
  const host = document.getElementById('cl_list'); if(!host) return;
  const orderSel = document.getElementById('cl_order');
  const mode = orderSel ? orderSel.value : 'az';

  const cards = Array.from(host.children).filter(n => n.classList.contains('card'));
  if(!cards.length) return;

  if (mode === 'last_desc'){
    cards.sort((a,b)=> (+b.getAttribute('data-last-ts')||0) - (+a.getAttribute('data-last-ts')||0));
  } else { // default A→Z
    cards.sort((a,b)=> String(a.getAttribute('data-name-lower')||'').localeCompare(String(b.getAttribute('data-name-lower')||'')));
  }
  for(const c of cards) host.appendChild(c);
};

/* 5) Filtro/Ordinamento — wiring leggero */
BPFinal.ensureClientFilters = function ensureClientFilters(){
  const apply = document.getElementById('cl_f_apply');
  if(apply && !apply.__bp_wired){
    apply.__bp_wired = true;
    apply.addEventListener('click', ()=> {
      // Dopo che main ha rigenerato l'elenco, arricchisci e ordina
      setTimeout(()=>{ BPFinal.enrichClientCards(); BPFinal.applyClientSort(); }, 0);
    });
  }
  const order = document.getElementById('cl_order');
  if(order && !order.__bp_wired){
    order.__bp_wired = true;
    order.addEventListener('change', ()=> BPFinal.applyClientSort());
  }
};

/* 6) Creazione cliente — stati & consulente (se presenti in UI, invia anche questi dati)
      Nota: se main.js già gestisce questi campi, questo handler non interferisce.
*/
BPFinal.wireCreateClientExtras = function wireCreateClientExtras(){
  const btn = document.getElementById('cl_add');
  if(!btn || btn.__bp_wired) return;
  btn.__bp_wired = true;

  btn.addEventListener('click', (ev)=>{
    const nameEl = document.getElementById('cl_name');
    const stSel  = document.getElementById('cl_new_state');  // creati dalla patch a main.js
    const owSel  = document.getElementById('cl_new_owner');

    if(!nameEl) return;
    const name = (nameEl.value||'').trim();
    if(!name) return;

    // Se i campi extra non esistono, lascia passare l’handler di main.js.
    if(!stSel && !owSel) return;

    ev.stopPropagation(); ev.preventDefault(); // evitiamo doppio POST
    const payload = { name };
    if(stSel) payload.status = stSel.value;
    if(owSel && owSel.value) payload.consultantId = owSel.value;

    POST('/api/clients', payload).then(()=>{
      toast('Cliente aggiunto'); addXP && addXP(5);
      // affidiamoci al refresh di main (di solito listClients()), intanto svuotiamo il campo
      nameEl.value = '';
      setTimeout(()=>{ BPFinal.enrichClientCards(); BPFinal.applyClientSort(); }, 150);
    }).catch(()=> toast('Errore creazione cliente'));
  }, true);
};

/* 7) Entry point chiamato da kickFinal('clients') */
BPFinal.ensureClientSection = function ensureClientSection(){
  BPFinal.ensureClientFilters();
  BPFinal.wireCreateClientExtras();
  BPFinal.enrichClientCards();
  BPFinal.enableClientsInlineAdmin();
  BPFinal.applyClientSort();
};



  // -------- Squadra: select utenti se vuota --------
  async function ensureTeamUserSelect(){
    const sel=$1('#tg_user'); if(!sel || sel.options.length>1) return;
    const j=await GET('/api/usernames').catch(()=>null);
    (j&&j.users||[]).forEach(u=>{ const o=document.createElement('option'); o.value=u.id; o.textContent=u.name+(u.grade?(' ('+u.grade+')'):''); sel.appendChild(o); });
  }

  // -------- Utenti: modali admin & self --------
  function wireUsersEdit(){
    const list = $1('#users, .users'); if(!list || list.__userEditWired) return; list.__userEditWired = true;
    list.addEventListener('click', e=>{
      const btn=e.target.closest('[data-edit-user]'); if(!btn) return;
      const row=btn.closest('[data-user-id]'); const id=row?.getAttribute('data-user-id');
      const name=row?.querySelector('.u-name')?.textContent||''; const email=row?.querySelector('.u-email')?.textContent||'';
      const dlg=document.createElement('div'); dlg.className='modal';
      dlg.innerHTML='<div class="card"><h3>Modifica utente</h3>'
        +'<label>Nome <input id="u_name" value="'+name+'"></label>'
        +'<label>Email <input id="u_email" value="'+email+'"></label>'
        +'<label>Password <input id="u_pass" type="password" placeholder="(lascia vuoto per non cambiare)"></label>'
        +'<div class="row right"><button id="u_ok" class="btn-ghost">Salva</button><button id="u_x" class="btn-ghost">Chiudi</button></div>'
        +'</div>';
      document.body.appendChild(dlg);
      $1('#u_x',dlg).onclick = ()=>dlg.remove();
      $1('#u_ok',dlg).onclick = async ()=>{
        try{
          const payload={ id, name:$1('#u_name',dlg).value, email:$1('#u_email',dlg).value };
          const pass=$1('#u_pass',dlg).value.trim(); if(pass) payload.password=pass;
          await POST('/api/users', payload); toast('Utente aggiornato'); dlg.remove(); location.reload();
        }catch(_){ toast('Errore aggiornamento utente'); }
      };
    });
    const selfBtn=$1('#btnProfile')||$1('[data-edit-self]');
    if(selfBtn && !selfBtn.__wired){
      selfBtn.__wired=true;
      selfBtn.onclick=()=>{
        const me=parseJSON(localStorage.getItem('user')||'{}',{});
        const dlg=document.createElement('div'); dlg.className='modal';
        dlg.innerHTML='<div class="card"><h3>Profilo</h3>'
          +'<label>Nome <input id="me_name" value="'+(me.name||'')+'"></label>'
          +'<label>Email <input id="me_email" value="'+(me.email||'')+'"></label>'
          +'<label>Password <input id="me_pass" type="password" placeholder="(nuova password)"></label>'
          +'<div class="row right"><button id="me_ok" class="btn-ghost">Salva</button><button id="me_x" class="btn-ghost">Chiudi</button></div>'
          +'</div>';
        document.body.appendChild(dlg);
        $1('#me_x',dlg).onclick=()=>dlg.remove();
        $1('#me_ok',dlg).onclick=async()=>{
          try{
            const payload={ id:me.id, name:$1('#me_name',dlg).value, email:$1('#me_email',dlg).value };
            const pass=$1('#me_pass',dlg).value.trim(); if(pass) payload.password=pass;
            await POST('/api/users', payload); toast('Profilo aggiornato'); dlg.remove(); location.reload();
          }catch(_){ toast('Errore aggiornamento profilo'); }
        };
      };
    }
  }

  // -------- Coach (frasi motivazionali) --------
  const coachHost = document.createElement('div');
  coachHost.className = 'bp-coach-host';
  coachHost.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:1200;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
  document.documentElement.appendChild(coachHost);
  const cssCoach = `
    /* Desktop default */
    .bp-coach-host{ top:14px; }
    /* Mobile: place below header + safe-area */
    @media (max-width:980px){
      .bp-coach-host{ top: calc(env(safe-area-inset-top) + 56px + 12px); }
    }
    .bp-coach{background:rgba(20,24,34,.92);color:#fff;border:1px solid rgba(255,255,255,.16);
      border-radius:12px;padding:8px 10px;font-weight:700;box-shadow:0 12px 24px rgba(0,0,0,.35);opacity:.98;transform:translateY(0);transition:all .18s;}
    @keyframes bpCoachPop{from{transform:translateY(-6px);opacity:0}to{transform:translateY(0);opacity:1}}
  `;
  const styleC=document.createElement('style'); styleC.textContent=cssCoach; document.head.appendChild(styleC);
  function currentUser(){ return parseJSON(localStorage.getItem('user')||'{}',{}); }
  function pickPhrase(level){
    const name=currentUser().name||'campione';
    const PX=(window.BP && window.BP.Phrases) ? window.BP.Phrases : null;
    let pool=[];
    if(PX){ pool = level==='high' ? (PX.high||PX.standard||[]) : level==='low' ? (PX.low||PX.standard||[]) : (PX.medium||PX.standard||[]); }
    else { pool=["Grande {{name}}!","Che figata, {{name}}!","Super!","Non ti ferma nessuno!!","Grandissimo!"]; }
    if(!pool.length) pool=["Grande {{name}}!"];
    const txt=pool[Math.floor(Math.random()*pool.length)];
    return txt.replace(/{{\s*name\s*}}/gi,name);
  }
  // Sistema coach legacy rimosso - usa BP.Coach.say da coach.js
  try{
    window.BP = window.BP || {};
    window.BP.Coach = window.BP.Coach || {};
    // Compat: consenti sia Coach.say(event|level, opts) sia Coach.say(level)
    // Rimuovo la definizione duplicata - usa solo quella da coach.js
    // window.BP.Coach.say è già definito in coach.js
  }catch(_){ }

// -------- Banner "È diventato cliente?" (NNCF) --------
(function(){
  // export safe
  var F = (window.BPFinal = window.BPFinal || {});
  var BANNER_ID = 'bp-nncf-banner';

  function injectBannerCSS(){
    if (document.getElementById('bp-nncf-css')) return;
    var css = `
      #${BANNER_ID}{
        position: fixed; left: 16px; right:16px; bottom: 16px; z-index: 9999;
        background: var(--card, rgba(15,18,28,.96));
        border: 1px solid var(--hair2, rgba(255,255,255,.12));
        border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.35);
        padding: 12px; display:flex; align-items:center; gap:12px; backdrop-filter: blur(6px);
      }
      #${BANNER_ID} .msg{ flex:1; }
      #${BANNER_ID} .row{ display:flex; gap:8px; align-items:center; }
      #${BANNER_ID} .ghost{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.18); }
      @media (prefers-color-scheme: light){
        #${BANNER_ID}{ background:#fff; border-color: rgba(0,0,0,.12); }
        #${BANNER_ID} .ghost{ background:rgba(0,0,0,.04); border-color: rgba(0,0,0,.12); }
      }
    `;
    var s=document.createElement('style'); s.id='bp-nncf-css'; s.textContent=css; document.head.appendChild(s);
  }

  function updateClientStatusByName(name, status){
    if(!name) return Promise.reject(new Error('Nome cliente mancante'));
    name = String(name).trim().toLowerCase();
    return GET('/api/clients').then(function(r){
      var list=(r&&r.clients)||[];
      var it = list.find(function(c){ return String(c.name||'').trim().toLowerCase()===name; });
      if(!it) throw new Error('Cliente non trovato: '+name);
      return POST('/api/clients', { id: it.id, status: status });
    });
  }

  function showBanner(appt){
    // evita multipli
    if (document.getElementById(BANNER_ID)) return;
    injectBannerCSS();

    var name = appt.client || 'Cliente';
    var el = document.createElement('div');
    el.id = BANNER_ID;
    el.innerHTML =
      '<div class="msg"><b>È diventato cliente?</b> ' + htmlEscape(name) + '</div>' +
      '<div class="row">' +
        '<button class="ghost" id="bp_nncf_yes">Sì</button>' +
        '<button class="ghost" id="bp_nncf_notyet">Non ancora</button>' +
        '<button id="bp_nncf_close">Chiudi</button>' +
      '</div>';
    document.body.appendChild(el);

    function close(){ try{ el.remove(); }catch(_){} }

    document.getElementById('bp_nncf_yes').onclick = function(){
      updateClientStatusByName(name, 'cliente')
        .then(function(){ toast('Stato cliente aggiornato'); })
        .catch(function(){ toast('Impossibile aggiornare lo stato'); })
        .finally(function(){ close(); });
    };
    document.getElementById('bp_nncf_notyet').onclick = function(){
      updateClientStatusByName(name, 'prospect')
        .catch(function(){ /* ok se non aggiornabile */ })
        .finally(function(){ close(); });
    };
    document.getElementById('bp_nncf_close').onclick = function(){
      close();
    };
  }

  function scanNNCF(){
    // Non fare chiamate se l'utente non è loggato
    if (!window.getUser || !window.getUser()) {
      return;
    }
    
    // mostra una sola volta l'ultimo NNCF concluso da almeno 1 minuto
    // SOLO PER GLI APPUNTAMENTI DEL CONSULENTE CORRENTE
    return GET('/api/appointments').then(function(r){
      var now = Date.now();
      var currentUserId = window.getUser ? window.getUser().id : null;
      var list = (r && r.appointments) || [];
      var nncf = list
        .filter(function(a){
          if(!a || !a.nncf) return false;
          // FILTRA PER UTENTE: mostra solo i banner degli appuntamenti del consulente corrente
          // CORRETTO: controllo più robusto per userId
          if (currentUserId && a.userId && String(a.userId) !== String(currentUserId)) return false;
          var end = +new Date(a.end || a.start || 0);
          return end && end < (now - 60*1000); // passato da ≥1 min
        })
        .sort(function(a,b){
          return (+new Date(b.end||b.start||0)) - (+new Date(a.end||a.start||0));
        });

      if(!nncf.length) return;
      var last = nncf[0];
      
      // Controlla se il banner è già stato risposto nel database
      // CORRETTO: conversione esplicita a boolean per sicurezza
      const isAnswered = !!last.nncfPromptAnswered;
      if (isAnswered) {
        return; // già risposto
      }
      
      showBanner(last);
    }).catch(function(_){ /* silenzioso */ });
  }

  // === Banner Vendite Riordini ===
  function scanVenditeRiordini(){
    // Non fare chiamate se l'utente non è loggato
    if (!window.getUser || !window.getUser()) {
      return;
    }
    
    // Mostra banner per preventivi con data_feedback = oggi
    return GET('/api/vendite-riordini').then(function(r){
      var today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      var currentUserId = window.getUser ? window.getUser().id : null;
      var list = (r && r.vendite) || [];
      
      // Filtra per data_feedback = oggi e stato != confermato/rifiutato
      var vendite = list.filter(function(v){
        if(!v || !v.data_feedback) return false;
        // FILTRA PER UTENTE: mostra solo i banner del consulente corrente
        if (currentUserId && v.consultantid && String(v.consultantid) !== String(currentUserId)) return false;
        return v.data_feedback === today && 
               v.stato !== 'confermato' && 
               v.stato !== 'rifiutato';
      });

      if(!vendite.length) return;
      
      // Controlla se notifica è già stata inviata per evitare banner duplicati
      var vendita = vendite[0];
      return checkVenditeRiordiniNotificationSent(vendita.id).then(function(alreadySent){
        if(alreadySent) {
          console.log(`[VenditeRiordini] Notification already sent for ${vendita.id}, skipping banner`);
          return;
        }
        
        console.log(`[VenditeRiordini] Showing banner for vendita: ${vendita.id}`);
        showVenditeRiordiniBanner(vendita);
      });
    }).catch(function(_){ /* silenzioso */ });
  }

  // Funzione per controllare se notifica è già stata inviata (frontend)
  function checkVenditeRiordiniNotificationSent(venditaId){
    try {
      return GET('/api/push-tracking/check?appointmentId=' + venditaId + '&notificationType=vendite-feedback').then(function(response){
        return response.sent || false;
      }).catch(function(error){
        console.error('Error checking vendite riordini notification status:', error);
        return false; // Default to false on error
      });
    } catch (error) {
      console.error('Error in checkVenditeRiordiniNotificationSent:', error);
      return false;
    }
  }

  function showVenditeRiordiniBanner(vendita){
    // Usa sempre il sistema di fallback per evitare problemi con enqueueBanner
    console.log('[VenditeRiordini] Showing banner using fallback system');
    showVenditeRiordiniBannerFallback(vendita);
  }

  // Funzione di fallback per mostrare banner senza sistema di coda
  function showVenditeRiordiniBannerFallback(vendita){
    console.log('[VenditeRiordini] Using fallback banner system');
    
    // Rimuovi banner esistenti
    var existing = document.getElementById('bp_vendite_banner_fallback');
    if(existing) existing.remove();

    // Crea banner host se non esiste
    var host = document.getElementById('bp_banner_host');
    if(!host){
      host = document.createElement('div');
      host.id = 'bp_banner_host';
      host.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;justify-content:center;pointer-events:none';
      document.body.appendChild(host);
    }

    // Crea banner card
    var card = document.createElement('div');
    card.id = 'bp_vendite_banner_fallback';
    card.className = 'bp-banner-card';
    card.style.cssText = 'pointer-events:auto;width:100%;max-width:720px;background:var(--card,#fff);color:var(--text,#111);border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.28);padding:12px;display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s';
    
    card.innerHTML = `
      <div class="msg" style="flex:1">
        <b>Come è andata la proposta piano a "${vendita.cliente}"? VSS: ${fmtEuro(vendita.valore_proposto || 0)}</b>
      </div>
      <div class="row" style="display:flex;gap:8px;align-items:center">
        <button class="ghost" data-act="postpone" style="background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.12)">Posticipa</button>
        <button class="ghost" data-act="reject" style="background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.12)">No</button>
        <button data-act="accept">Sì</button>
      </div>
    `;

    // Bind eventi
    card.querySelector('[data-act="postpone"]').onclick = async function(){
      try {
        await postponeVenditaRiordini(vendita.id);
        card.remove();
      } catch(e) {
        console.error('[VenditeRiordini] Error postponing:', e);
      }
    };

    card.querySelector('[data-act="reject"]').onclick = async function(){
      try {
        await rejectVenditaRiordini(vendita.id);
        card.remove();
      } catch(e) {
        console.error('[VenditeRiordini] Error rejecting:', e);
      }
    };

    card.querySelector('[data-act="accept"]').onclick = async function(){
      try {
        await acceptVenditaRiordini(vendita.id);
        card.remove();
      } catch(e) {
        console.error('[VenditeRiordini] Error accepting:', e);
      }
    };

    // Aggiungi al DOM e anima
    host.innerHTML = '';
    host.appendChild(card);
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'none';
    });

    // Auto-close dopo 30 secondi
    setTimeout(() => {
      if(document.getElementById('bp_vendite_banner_fallback')){
        card.style.opacity = '0';
        card.style.transform = 'translateY(8px)';
        setTimeout(() => card.remove(), 200);
      }
    }, 30000);
  }

  // Protezione globale per intercettare qualsiasi uso di enqueueBanner
  if (typeof window.enqueueBanner === 'undefined') {
    window.enqueueBanner = function(renderFunction) {
      console.log('[VenditeRiordini] Intercepted enqueueBanner call, using fallback');
      // Se è una funzione di banner vendite e riordini, usa il fallback
      if (typeof renderFunction === 'function') {
        try {
          const bannerElement = renderFunction(() => {}); // Passa funzione close vuota
          if (bannerElement && bannerElement.className && bannerElement.className.includes('bp-banner-card')) {
            // È un banner, mostra direttamente
            const host = document.getElementById('bp_banner_host') || (() => {
              const h = document.createElement('div');
              h.id = 'bp_banner_host';
              h.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;justify-content:center;pointer-events:none';
              document.body.appendChild(h);
              return h;
            })();
            host.innerHTML = '';
            host.appendChild(bannerElement);
            requestAnimationFrame(() => {
              bannerElement.style.opacity = '1';
              bannerElement.style.transform = 'none';
            });
          }
        } catch (e) {
          console.error('[VenditeRiordini] Error in intercepted enqueueBanner:', e);
        }
      }
    };
  }

  // Funzione di test per mostrare il banner manualmente
  window.testVenditeRiordiniBanner = function(){
    var testVendita = {
      id: 'test_vendita_123',
      cliente: 'Test Cliente',
      valore_proposto: 1500,
      data_feedback: new Date().toISOString().split('T')[0]
    };
    showVenditeRiordiniBanner(testVendita);
  };

  // Funzione DELETE globale
  window.DELETE = function(url, data) {
    // Se data contiene un ID, aggiungilo come query parameter
    if (data && data.id) {
      const urlObj = new URL(url, window.location.origin);
      urlObj.searchParams.set('id', data.id);
      url = urlObj.toString();
    }
    
    return fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    }).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json().catch(() => ({})); // Gestisce risposte vuote
    });
  };

  // Funzioni globali per azioni banner (async/await)
  window.postponeVenditaRiordini = async function(venditaId){
    try {
      // Posticipa al giorno dopo
      var tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      var tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      await PUT('/api/vendite-riordini', {
        id: venditaId,
        data_feedback: tomorrowStr
      });
      
      toast('📅 Preventivo posticipato a domani! Riceverai un nuovo reminder.');
      
      // Marca notifica come inviata per evitare duplicati
      await markVenditeRiordiniNotificationSent(venditaId);
    } catch(error) {
      console.error('Error postponing vendita:', error);
      toast('❌ Errore nel posticipare il preventivo');
    }
  };

  window.rejectVenditaRiordini = async function(venditaId){
    try {
      // Cambia stato a rifiutato
      await PUT('/api/vendite-riordini', {
        id: venditaId,
        stato: 'rifiutato'
      });
      
      toast('❌ Preventivo rifiutato! Il cliente non è interessato.');
      
      // Marca notifica come inviata per evitare duplicati
      await markVenditeRiordiniNotificationSent(venditaId);
    } catch(error) {
      console.error('Error rejecting vendita:', error);
      toast('❌ Errore nel rifiutare il preventivo');
    }
  };

  window.acceptVenditaRiordini = async function(venditaId){
    try {
      // Mostra mini form per conferma
      showVenditeRiordiniConfirmForm(venditaId);
    } catch(error) {
      console.error('Error accepting vendita:', error);
      toast('❌ Errore nell\'accettare il preventivo');
    }
  };

  function showVenditeRiordiniConfirmForm(venditaId){
    // Ottieni dati vendita
    GET('/api/vendite-riordini').then(function(r){
      var vendite = (r && r.vendite) || [];
      var vendita = vendite.find(v => v.id === venditaId);
      
      if(!vendita) {
        toast('Preventivo non trovato');
        return;
      }

      // Crea form overlay con CSS per centramento
      var overlay = document.createElement('div');
      overlay.className = 'bp-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
        box-sizing: border-box;
      `;
      overlay.innerHTML = `
        <div class="bp-modal" style="
          background: #ffffff;
          border: 1px solid #e0e0e0;
          box-shadow: 0 20px 60px rgba(0,0,0,.3);
          border-radius: 20px;
          padding: 32px;
          margin: 0;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          overflow-x: hidden;
        ">
          <div class="bp-modal-header" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e5e7eb;
          ">
            <h3 style="
              font-size: 22px;
              font-weight: 800;
              color: #333333;
              margin: 0;
            ">Conferma Preventivo</h3>
            <button onclick="closeVenditeRiordiniForm()" style="
              background: #f5f5f5;
              border: 1px solid #ddd;
              border-radius: 12px;
              padding: 12px 16px;
              transition: all 0.2s ease;
              color: #333333;
              font-weight: 500;
              cursor: pointer;
            ">✕</button>
          </div>
          <div class="bp-modal-body" style="margin-bottom: 32px;">
            <div class="bp-form-group" style="margin-bottom: 24px;">
              <label style="
                font-weight: 600;
                color: #2563eb;
                margin-bottom: 12px;
                display: block;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              ">Descrizione Servizi</label>
              <textarea id="vendita_descrizione" rows="3" style="
                width: 100%;
                min-width: 0;
                background: #ffffff;
                border: 1px solid #d1d5db;
                border-radius: 12px;
                padding: 14px 16px;
                transition: all 0.2s ease;
                color: #333333;
                font-size: 15px;
                resize: vertical;
                min-height: 80px;
              ">${vendita.descrizione_servizi || ''}</textarea>
            </div>
            <div class="bp-form-group" style="margin-bottom: 24px;">
              <label style="
                font-weight: 600;
                color: #2563eb;
                margin-bottom: 12px;
                display: block;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              ">Valore Confermato (VSS)</label>
              <input type="number" id="vendita_valore_confermato" value="${vendita.valore_proposto || 0}" step="0.01" style="
                width: 100%;
                min-width: 0;
                background: #ffffff;
                border: 1px solid #d1d5db;
                border-radius: 12px;
                padding: 14px 16px;
                transition: all 0.2s ease;
                color: #333333;
                font-size: 15px;
              ">
            </div>
          </div>
          <div class="bp-modal-footer" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
          ">
            <button class="bp-btn-secondary" onclick="closeVenditeRiordiniForm()" style="
              background: #f8f9fa;
              border: 1px solid #d1d5db;
              color: #374151;
              border-radius: 12px;
              padding: 14px 28px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              font-size: 15px;
            ">Annulla</button>
            <button class="bp-btn-primary" onclick="confirmVenditaRiordini('${venditaId}')" style="
              background: linear-gradient(135deg, #2563eb, #1d4ed8);
              border: none;
              color: #ffffff;
              border-radius: 12px;
              padding: 14px 28px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              box-shadow: 0 4px 12px rgba(37,99,235,.3);
              font-size: 15px;
            ">Continua</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
    }).catch(function(error){
      console.error('Error loading vendita:', error);
      toast('Errore nel caricare il preventivo');
    });
  }

  window.closeVenditeRiordiniForm = function(){
    var overlay = document.querySelector('.bp-overlay');
    if(overlay) overlay.remove();
  };

  window.closeVenditeRiordiniBanner = function(){
    // Chiude il banner vendite e riordini
    var banner = document.querySelector('.bp-banner-card');
    if(banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(100px)';
      setTimeout(() => banner.remove(), 300);
    }
  };

  window.confirmVenditaRiordini = function(venditaId){
    var descrizione = document.getElementById('vendita_descrizione').value;
    var valoreConfermato = parseFloat(document.getElementById('vendita_valore_confermato').value) || 0;
    
    // Aggiorna vendita
    PUT('/api/vendite-riordini', {
      id: venditaId,
      stato: 'confermato',
      descrizione_servizi: descrizione,
      valore_confermato: valoreConfermato
    }).then(function(){
      closeVenditeRiordiniBanner();
      closeVenditeRiordiniForm();
      toast('🎉 Preventivo confermato! VSS aggiunto al calendario.');
      
      // Marca notifica come inviata per evitare duplicati
      markVenditeRiordiniNotificationSent(venditaId);
      
      // Integra VSS nel calendario
      integrateVSSInCalendar(venditaId, valoreConfermato);
    }).catch(function(error){
      console.error('Error confirming vendita:', error);
      toast('❌ Errore nel confermare il preventivo');
    });
  };

  // Funzione per marcare notifica come inviata (frontend)
  function markVenditeRiordiniNotificationSent(venditaId){
    try {
      // Usa l'endpoint di tracking esistente
      POST('/api/push-tracking/mark-sent', {
        appointmentId: venditaId,
        notificationType: 'vendite-feedback'
      }).then(function(){
        console.log('Vendite riordini notification marked as sent:', venditaId);
      }).catch(function(error){
        console.error('Error marking vendite riordini notification as sent:', error);
      });
    } catch (error) {
      console.error('Error in markVenditeRiordiniNotificationSent:', error);
    }
  }

  function integrateVSSInCalendar(venditaId, valoreConfermato){
    // Ottieni dati vendita per la data
    GET('/api/vendite-riordini').then(function(r){
      var vendite = (r && r.vendite) || [];
      var vendita = vendite.find(v => v.id === venditaId);
      
      if(!vendita) {
        console.error('Vendita not found for VSS integration:', venditaId);
        return;
      }

      // Crea un appuntamento "virtuale" per il VSS nel calendario
      var today = new Date();
      var appointmentData = {
        id: 'vr_' + venditaId + '_' + Date.now(), // ID univoco
        client: vendita.cliente,
        consultant: vendita.consulente,
        consultantid: vendita.consultantid,
        start: today.toISOString(),
        end: today.toISOString(),
        type: 'vendita',
        vss: valoreConfermato,
        annotation: `Preventivo confermato: ${vendita.descrizione_servizi || ''}`,
        userid: vendita.consultantid,
        createdat: today.toISOString(),
        updatedat: today.toISOString()
      };

      // Salva appuntamento nel calendario
            POST('/api/appointments', appointmentData).then(function(){
              console.log('VSS integrato nel calendario per vendita:', venditaId);
              
              // Trigger refresh calendario se visibile
              if (typeof document.dispatchEvent === 'function') {
                document.dispatchEvent(new Event('bp:saved'));
              }
            }).catch(function(error){
              console.error('Error integrating VSS in calendar:', error);
            });
    }).catch(function(error){
      console.error('Error loading vendita for VSS integration:', error);
    });
  }

  // Export funzioni
  F.scanVenditeRiordini = scanVenditeRiordini;
  if (!window.scanVenditeRiordini) window.scanVenditeRiordini = scanVenditeRiordini;
})();

// -------- Undo + Haptics globali --------
(function(){
  // === Snackbar Undo riutilizzabile ===
  window.showUndo = window.showUndo || function(label, onUndo, ttl){
    try{
      var bar = document.getElementById('bp_undo_bar');
      if(!bar){
        bar = document.createElement('div');
        bar.id = 'bp_undo_bar';
        bar.style.position = 'fixed';
        bar.style.left = '16px';
        bar.style.bottom = '16px';
        bar.style.zIndex = '9999';
        bar.style.background = 'rgba(20,22,28,0.95)';
        bar.style.color = '#fff';
        bar.style.padding = '10px 12px';
        bar.style.borderRadius = '10px';
        bar.style.boxShadow = '0 8px 24px rgba(0,0,0,.25)';
        bar.style.display = 'flex';
        bar.style.alignItems = 'center';
        bar.style.gap = '12px';
        document.body.appendChild(bar);
      }
      bar.innerHTML = '<span>'+label+'</span><button id="bp_undo_btn" class="ghost" style="background:#fff;color:#111;border-radius:8px;padding:6px 10px">Annulla</button>';
      var btn = document.getElementById('bp_undo_btn');
      var timer = setTimeout(function(){ try{bar.remove();}catch(e){} }, (ttl||5000));
      btn.onclick = function(){
        clearTimeout(timer);
        try{ bar.remove(); }catch(e){}
        if (typeof onUndo === 'function'){
          Promise.resolve(onUndo())
            .then(function(){
              hapticImpact('medium');
              try{ document.dispatchEvent(new Event('undo:performed')); }catch(_){ }
            })
            .catch(function(){ hapticImpact('heavy'); });
        }
      };
      hapticImpact('light');
    }catch(e){ logger.error(e); }
  };

  window.pushUndo = window.pushUndo || function(action){
    if(!action || typeof action.undo !== 'function') return;
    var label = action.label || 'Annulla ultima operazione';
    window.showUndo(label, action.undo, action.ttl||5000);
  };

  // Event listener coach legacy rimossi - usa BP.Coach.say da coach.js
  window.wireCoachUndoHaptics = function(){
function __clearPeriodsCache(){ try{ if (window.__periodsCache) { Object.keys(window.__periodsCache).forEach(function(k){ delete window.__periodsCache[k]; }); } delete window.periods; }catch(_){} }
document.addEventListener('bp:saved',         function(){ hapticImpact('heavy');  __clearPeriodsCache(); });
document.addEventListener('bp:deleted',       function(){ hapticImpact('medium'); __clearPeriodsCache(); });
document.addEventListener('appt:saved',       function(){ hapticImpact('medium'); });
document.addEventListener('ics:exported',     function(){ hapticImpact('light');  });
document.addEventListener('report:composed',  function(){ hapticImpact('medium'); });
document.addEventListener('client:converted', function(){ hapticImpact('heavy');  });
document.addEventListener('gi:created',       function(){ hapticImpact('heavy');  });
document.addEventListener('payments:defined', function(){ hapticImpact('medium'); });
document.addEventListener('user:profile-updated', function(){ hapticImpact('light'); });
document.addEventListener('appt:created',     function(){ hapticImpact('medium'); });
document.addEventListener('undo:performed',   function(){ hapticImpact('light');  });
document.addEventListener('kpi:goal-80',      function(){ hapticImpact('medium'); });
document.addEventListener('kpi:goal-reached', function(){ hapticImpact('heavy');  });

// Global delegate: trigger coach on generic close buttons (low intensity)
// Matches: [data-close], ids/classes containing "close", aria-label "Chiudi"/"Close", or text content 'Chiudi'/'Close'.
document.addEventListener('click', function(ev){
  try{
    var el = ev.target;
    // climb up a few levels to catch icons inside buttons
    for(var i=0;i<3 && el; i++){
      if(el.matches && (el.matches('[data-close], [aria-label*="Chiudi" i], [aria-label*="Close" i]') ||
         (el.id||'').toLowerCase().includes('close') ||
         (el.className||'').toLowerCase().includes('close') ||
         (/^\s*(chiudi|close)\s*$/i).test(el.textContent||''))){
        hapticImpact('light');
        break;
      }
      el = el.parentElement;
    }
  }catch(_){ }
}, true);

    var root = document.getElementById('app') || document.body;
    if (root && !root.__undoWired){
      root.__undoWired = true;
      root.addEventListener('click', function(e){
        var del = e.target.closest('[data-delete], .btn-delete'); if(!del) return;
        var href = del.getAttribute('href');
        var id   = del.getAttribute('data-id');
        if (href || id){
          e.preventDefault();
          showUndo('Eliminato — Annulla', async function(){
            try{
              if (href){
                var url = href + (href.indexOf('?')>=0 ? '&' : '?') + 'undo=1';
                await GET(url);
              }else if(id){
                await POST('/api/restore', { id:id });
              }
              location.reload();
            }catch(err){ logger.error(err); }
          });
        }
      }, true);
    }
  };

  // === HAPTICS UI: click e change in tutta la UI, con regole leggere ===
  window.wireHapticsUI = function(){
    var body = document.body;
    if (body.__hapticsWired) return; body.__hapticsWired = true;

    // Click su bottoni/azioni
    body.addEventListener('click', function(e){
      var btn = e.target.closest('button, .button, .btn, .ghost, [role="button"], a.button, a.btn, [data-action]');
      if (!btn) return;
      var kind = 'light';
      if (btn.classList.contains('danger') || btn.getAttribute('data-danger')==='1') kind='heavy';
      else if (btn.classList.contains('primary') || btn.getAttribute('data-primary')==='1') kind='medium';
      hapticImpact(kind);
    }, true);

    // Change su input/select
    body.addEventListener('change', function(e){
      var el = e.target;
      if (!el) return;
      if (el.matches('select, input[type="checkbox"], input[type="radio"], input[type="range"]')){
        hapticImpact('light');
      }
    }, true);

    // Piccolo feedback quando si apre/chiude il drawer (se presente)
    var menuToggle = document.querySelector('[data-drawer-toggle], #menuToggle, .menu-toggle');
    if (menuToggle && !menuToggle.__hW){
      menuToggle.__hW = true;
      menuToggle.addEventListener('click', function(){ hapticImpact('light'); }, true);
    }
  };
})();
  
/* ===== espongo alcune funzioni per debug/uso manuale ===== */

window.recomputeDashboardMini = typeof recomputeDashboardMini === 'function' ? recomputeDashboardMini : () => {};
window.recomputeCommsMini     = typeof recomputeCommsMini     === 'function' ? recomputeCommsMini     : () => {};
window.recomputeTeamChart     = typeof recomputeTeamChart     === 'function' ? recomputeTeamChart     : () => {};
window.ensureTeamUserSelect   = typeof ensureTeamUserSelect   === 'function' ? ensureTeamUserSelect   : () => {};
window.attachICSButtons       = typeof attachICSButtons       === 'function' ? attachICSButtons       : () => {};
window.addSaveAndExport       = typeof addSaveAndExport       === 'function' ? addSaveAndExport       : () => {};

/* ======= BEGIN EXPORT – FINAL HOOKS VISIBILI ======= */
/* Espone in modo sicuro le funzioni utili sia in window.BPFinal che come globali singole.
   Non rompe nulla: esporta solo ciò che esiste davvero nel file. */

window.BPFinal = window.BPFinal || {};
(function (EX) {
  // helper per esportare in sicurezza
  function expose(name, fn) {
    if (typeof fn === 'function') {
      EX[name] = fn;
      if (!window[name]) window[name] = fn; // compat: alias globale se non già usato
    }
  }

  // === metti qui TUTTE le funzioni che vuoi vedere dal main/console ===
  // (le if con typeof evitano ReferenceError se una funzione non esiste)

  if (typeof recomputeDashboardMini !== 'undefined') expose('recomputeDashboardMini', recomputeDashboardMini);
  if (typeof recomputeCommsMini     !== 'undefined') expose('recomputeCommsMini',     recomputeCommsMini);
  if (typeof recomputeTeamChart     !== 'undefined') expose('recomputeTeamChart',     recomputeTeamChart);
if (typeof viewGI !== 'undefined') expose('viewGI', viewGI);

  if (typeof ensureTeamUserSelect   !== 'undefined') expose('ensureTeamUserSelect',   ensureTeamUserSelect);
  if (typeof attachICSButtons       !== 'undefined') expose('attachICSButtons',       attachICSButtons);
  if (typeof addSaveAndExport       !== 'undefined') expose('addSaveAndExport',       addSaveAndExport);
  // Coach legacy rimosso

  // <<< QUI quelle che ora ti risultano "undefined" in console >>>
  if (typeof ensureClientFilters    !== 'undefined') expose('ensureClientFilters',    ensureClientFilters);
  if (typeof enrichClientCards      !== 'undefined') expose('enrichClientCards',      enrichClientCards);
  if (typeof showClientAppointments !== 'undefined') expose('showClientAppointments', showClientAppointments);
  if (typeof wireReportButtons      !== 'undefined') expose('wireReportButtons',      wireReportButtons);
  if (typeof scanNNCF               !== 'undefined') expose('scanNNCF',               scanNNCF);
  if (typeof scanVenditeRiordini    !== 'undefined') expose('scanVenditeRiordini',    scanVenditeRiordini);
  if (typeof ensureNNCFChip         !== 'undefined') expose('ensureNNCFChip',         ensureNNCFChip);

  if (typeof markToday              !== 'undefined') expose('markToday',              markToday);
  if (typeof clampSlotCounters      !== 'undefined') expose('clampSlotCounters',      clampSlotCounters);
  if (typeof filterPastAppointments !== 'undefined') expose('filterPastAppointments', filterPastAppointments);

  if (typeof openWeb                !== 'undefined') expose('openWeb',                openWeb);
  if (typeof openApp                !== 'undefined') expose('openApp',                openApp);
  if (typeof notifyConversion       !== 'undefined') expose('notifyConversion',       notifyConversion);

  if (typeof icsFromAppt            !== 'undefined') expose('icsFromAppt',            icsFromAppt);
  if (typeof downloadICS            !== 'undefined') expose('downloadICS',            downloadICS);

  // utility HTTP se definite qui (altrimenti userai le versioni del main)
  if (typeof GET                    !== 'undefined') expose('GET',                    GET);
  if (typeof POST                   !== 'undefined') expose('POST',                   POST);

})(window.BPFinal);
/* ======= END EXPORT – FINAL HOOKS VISIBILI ======= */


// -------- Observer: applica patch post-render --------
const mo = new MutationObserver(()=>{
  if (typeof ensureNNCFChip==='function')        ensureNNCFChip();
  if (typeof addSaveAndExport==='function')      addSaveAndExport();
  if (typeof attachICSButtons==='function')      attachICSButtons();
  if (typeof wireReportButtons==='function')     wireReportButtons();
  if (typeof ensureClientFilters==='function')   ensureClientFilters();
  if (typeof enrichClientCards==='function')     enrichClientCards();
  if (typeof ensureTeamUserSelect==='function')  ensureTeamUserSelect();
  if (typeof wireUsersEdit==='function')         wireUsersEdit();
  if (typeof filterPastAppointments==='function') filterPastAppointments(document.body);
  if (typeof markToday==='function')             markToday();
});

onceReady(async ()=>{
  // Calendario + evidenziazione “oggi”
  if (typeof injectTodayCSS==='function') injectTodayCSS();
  if (typeof markToday==='function')       markToday();
  if (typeof clampSlotCounters==='function') clampSlotCounters();

  // Mini-chart / grafici - spostato dopo il caricamento della dashboard
  // if (typeof wireMiniChartTriggers==='function') wireMiniChartTriggers();
  if (typeof recomputeDashboardMini==='function') await recomputeDashboardMini();
  if (typeof recomputeCommsMini==='function')     await recomputeCommsMini();
  if (typeof recomputeTeamChart==='function')     await recomputeTeamChart();

  // Haptics + Coach
  if (typeof wireHapticsUI==='function')       wireHapticsUI();
  if (typeof wireCoachUndoHaptics==='function') wireCoachUndoHaptics();
// Coach per banner NNCF (legacy): disabilitato per rimuovere banner duplicato "Non ancora"
//  if (typeof scanNNCF==='function') scanNNCF();
  // Banner vendite riordini - usa sempre sistema di fallback
  if (typeof scanVenditeRiordini==='function') {
    scanVenditeRiordini();
  }
  // Saluto iniziale (una volta al giorno)
  try{
    const k='bpCoachGreetedDate';
    const today=(new Date()).toISOString().slice(0,10);
    const last=localStorage.getItem(k)||'';
    if (last!==today && typeof window.BP !== 'undefined' && window.BP.Coach && typeof window.BP.Coach.say === 'function'){
      localStorage.setItem(k,today);
      window.BP.Coach.say('generic', { intensity: 'low' });
    }
  }catch(_){ }
  mo.observe(document.body,{childList:true,subtree:true});

  // 🔁 Allinea gli scope dei filtri unificati con il main
  if (window.onUnifiedRangeChange){
    window.onUnifiedRangeChange(scope=>{
      // consentiamo sia i nomi “lunghi” usati dal main, sia i legacy corti
      const s = (scope==='d' ? 'dash' : scope==='cm' ? 'comm' : scope==='tg' ? 't' : scope);

      if (s==='dash' && typeof recomputeDashboardMini==='function') {
        recomputeDashboardMini();
        if (typeof window.recomputeKPI==='function') window.recomputeKPI();
        if (typeof renderDashboard==='function') renderDashboard();
      }
      if (s==='comm' && typeof recomputeCommsMini==='function') {
        recomputeCommsMini();
      }
      if ((s==='t' || s==='team') && typeof recomputeTeamChart==='function') {
        recomputeTeamChart();
      }
    });
  }

});
})();
