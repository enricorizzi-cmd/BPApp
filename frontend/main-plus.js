/* Battle Plan – main-plus.js (v13.6 FINAL)
   Add-on non invasivo: si aggancia a main.js e inietta funzioni richieste.

   Include:
   - Report: Gmail Web/App + autocopia testo + CC all users
   - Frasi motivazionali (canale separato) su eventi (BP save / appt create-update / client converted)
   - Banner “È diventato cliente?” (solo dopo la fine dell’appuntamento NNCF) + notifica + Sì/No con update stato
   - Export .ics su card appuntamenti (dashboard/calendario/lista)
   - Calendar: evidenzia OGGI
   - Lista appuntamenti (modale): solo futuri+oggi
   - Clienti: filtri (stato/consulente), card con Stato/Consulente/Ultimo appuntamento (+ edit inline solo admin)
   - NNCF UI: spunta accanto al campo cliente
   - Haptics (mobile)
*/
(function(){
  'use strict';
  if (window.__BP_PLUS_READY__) return;
  window.__BP_PLUS_READY__ = true;

  // ===== Utils =====
  const $ = (sel,root)=> (root||document).querySelector(sel);
  const $$ = (sel,root)=> Array.prototype.slice.call((root||document).querySelectorAll(sel));
  const p2 = n => (n<10?('0'+n):(''+n));
  const ymd = d => { const x=new Date(d); return `${x.getFullYear()}-${p2(x.getMonth()+1)}-${p2(x.getDate())}`; };
  const todayYMD = ()=> ymd(new Date());
  const isMobile = ()=> /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const haptic = (type)=>{ if(!isMobile()||!navigator.vibrate) return; try{
    if(type==='heavy') navigator.vibrate([12,40,12]); else if(type==='light') navigator.vibrate(12); else navigator.vibrate(18);
  }catch(_){ } };

// GET/POST con Authorization SEMPRE (non usiamo window.GET/POST per evitare 401)
function __bp_getAuthToken(){
  try{
    const u = JSON.parse(localStorage.getItem('bp_user')||'null') || {};
    if (u.token) return u.token;
  }catch(_){}
  return (window.authToken
      || localStorage.getItem('bp_token')
      || localStorage.getItem('authToken')
      || localStorage.getItem('token')
      || '');
}

async function GET(path){
  const headers = {};
  const tok = __bp_getAuthToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const r = await fetch(path, { headers });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try { return await r.json(); } catch { return null; }
}

async function POST(path, body){
  const headers = { 'Content-Type': 'application/json' };
  const tok = __bp_getAuthToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const r = await fetch(path, { method:'POST', headers, body: JSON.stringify(body||{}) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try { return await r.json(); } catch { return null; }
}

  function toast(msg, ms){
    if (window.toast) { window.toast(msg); return; }
    const t = document.createElement('div'); t.className='toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>{ t.remove(); }, ms||1800);
  }
  async function copyText(txt){
    try{ await navigator.clipboard.writeText(String(txt||'')); return true; }
    catch(e){
      try{
        const ta=document.createElement('textarea'); ta.value=String(txt||''); ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true;
      }catch(_){ return false; }
    }
  }
  function currentUser(){
    try{ return JSON.parse(localStorage.getItem('bp_user')||'null')||{}; }catch(_){ return {}; }
  }

  // ===== Coach (motivazionale) – canale separato =====
  const coachHost = document.createElement('div');
  coachHost.className = 'bp-coach-host';
  document.body.appendChild(coachHost);
  const cssCoach = `
  .bp-coach-host{ position:fixed; right:16px; top:70px; z-index:1200; display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
  .bp-coach{ max-width:360px; background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
    border:1px solid rgba(255,255,255,.18); border-radius:14px; padding:10px 12px; font-weight:800; box-shadow:0 10px 24px rgba(0,0,0,.35);
    animation:bpCoachPop .16s ease-out; }
  @keyframes bpCoachPop{ from{transform:translateY(-6px);opacity:0} to{transform:translateY(0);opacity:1} }
  `;
  const styleC = document.createElement('style'); styleC.textContent = cssCoach; document.head.appendChild(styleC);

  function pickPhrase(level){
    const name = currentUser().name || 'campione';
    const PX = (window.BP && window.BP.Phrases) ? window.BP.Phrases : null;
    let pool = [];
    if(PX){
      pool = level==='high' ? (PX.high||PX.standard||[]) : level==='low' ? (PX.low||PX.standard||[]) : (PX.medium||PX.standard||[]);
    }else{
      pool = ["Che figata, {{name}}!","Super!","Non ti ferma nessuno!!","Ma cosa dici grande.. grandissimo!"];
    }
    if(!pool.length) pool = ["Grande {{name}}!"];
    const txt = pool[Math.floor(Math.random()*pool.length)];
    return txt.replace(/{{\s*name\s*}}/gi, name);
  }
  function coachSay(level){
    const el = document.createElement('div');
    el.className = 'bp-coach'; el.textContent = pickPhrase(level||'medium');
    coachHost.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-4px)'; }, 2200);
    setTimeout(()=>{ el.remove(); }, 2420);
  }

  // ===== Banner “È diventato cliente?” =====
  const seenKey = "bp_banner_seen";
  function seenMap(){ try{ return JSON.parse(localStorage.getItem(seenKey)||'{}'); }catch(_){ return {}; } }
  function markSeen(id){ const m=seenMap(); m[id]=true; localStorage.setItem(seenKey, JSON.stringify(m)); }
  function hasSeen(id){ const m=seenMap(); return !!m[id]; }

  // notifica (desktop/mobile) alla comparsa del banner
 async function notifyConversion(appt){
  const title = "È diventato cliente?";
  const body  = "Appuntamento con " + (appt.client || "Cliente");
  try{
    // prima chiediamo (se serve) il permesso
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch(_) {}
    }
    // se abbiamo permesso, preferiamo il SW (se presente), altrimenti Notification API
    if (("Notification" in window) && Notification.permission === "granted") {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          reg.showNotification(title, { body, tag: "bp-convert-"+(appt.id||""), requireInteraction: false });
          return;
        }
      }
      new Notification(title, { body, tag:"bp-convert-"+(appt.id||"") });
    }
  }catch(_){}
}


// fallback interno: update stato trovando cliente per NOME
async function updateClientStatusByName(name, status){
  try{
    // se esiste helper della lib, usalo
    if (window.BP && BP.ClientStatus && typeof BP.ClientStatus.setClientStatusByName === 'function') {
      return await BP.ClientStatus.setClientStatusByName({ clientName: name, status });
    }
  }catch(_){}
  // fallback: prendo lista e cerco per nome
  const list = await GET('/api/clients');
  const key = String(name||'').trim().toLowerCase();
  const found = (list.clients||[]).find(c => String(c.name||'').trim().toLowerCase() === key);
  if(!found) throw new Error('client not found');
  return POST('/api/clients', { id: found.id, status });
}

function showBecameClientBanner(appt){
  if(!appt || !appt.nncf) return;
  if(hasSeen(appt.id)) return;
  const end = new Date(appt.end || appt.start || 0);
  if (isNaN(end.getTime())) return;
  if (Date.now() < end.getTime() + 60*1000) return;

  const box = document.createElement('div');
  box.className = 'bp-banner-client';
  box.innerHTML = `
    <div class="bp-banner-inner">
      <div class="bp-banner-title">È diventato cliente?</div>
      <div class="bp-banner-sub">Appuntamento con <b>${(appt.client||'Cliente')}</b></div>
      <div class="bp-banner-actions">
        <button type="button" data-yes>Sì</button>
        <button type="button" class="ghost" data-no>No</button>
      </div>
    </div>`;
  document.body.appendChild(box);

  // notifica alla comparsa (se definita)
  try { if (typeof notifyConversion === 'function') notifyConversion(appt); } catch(e){}

  const close = ()=>{ try{ box.remove(); }catch(e){} try{ markSeen(appt.id); }catch(e){} };

  // SÌ → attivo
  box.querySelector('[data-yes]').addEventListener('click', async ()=>{
    try{
      await updateClientStatusByName(appt.client, 'attivo');
      (window.toast||console.log)('Cliente aggiornato ad ATTIVO');
      try{ if (typeof coachSay==='function') coachSay('high'); }catch(e){}
      try{ if (typeof haptic==='function') haptic('heavy'); }catch(e){}
    }catch(_){ (window.toast||console.warn)('Aggiornamento cliente non riuscito'); }
    close();
  });

  // NO → lead_non_chiuso
  box.querySelector('[data-no]').addEventListener('click', async ()=>{
    try{
      await updateClientStatusByName(appt.client, 'lead_non_chiuso');
      (window.toast||console.log)('Cliente classificato come LEAD NON CHIUSO');
      try{ if (typeof haptic==='function') haptic('light'); }catch(e){}
    }catch(_){ (window.toast||console.warn)('Aggiornamento cliente non riuscito (permessi?)'); }
    close();
  });
}

  // stile banner (fix contrasto bottone "No")
  const cssBanner = `
  .bp-banner-client{ position:fixed; left:50%; transform:translateX(-50%); top:70px; z-index:1200;
    background:rgba(20,24,34,.95); color:#fff; border:1px solid rgba(255,255,255,.18);
    box-shadow:0 10px 24px rgba(0,0,0,.35); border-radius:14px; padding:10px; min-width:280px;
    animation:bpBannerPop .18s ease-out; }
  .bp-banner-inner{ display:flex; flex-direction:column; gap:6px; }
  .bp-banner-title{ font-weight:800; }
  .bp-banner-sub{ font-size:12px; opacity:.92; }
  .bp-banner-actions{ display:flex; gap:8px; margin-top:6px; justify-content:flex-end; }
.bp-banner-actions .ghost{
  color:#fff !important;
  border:1px solid rgba(255,255,255,.45) !important;
  background:transparent !important;
}
.bp-banner-actions .ghost:hover{
  border-color: var(--accent, #5dd3ff) !important;
}

  @keyframes bpBannerPop{ from{ transform:translate(-50%, -6px); opacity:0 } to{ transform:translate(-50%, 0); opacity:1 } }
  `;
  const styleB = document.createElement('style'); styleB.textContent = cssBanner; document.head.appendChild(styleB);

  // Scan candidati: NNCF + cliente potenziale + finito da almeno 1 min + non visto
  async function scanForConversionCandidates(){
    try{
      const [apps, clients] = await Promise.all([ GET('/api/appointments'), GET('/api/clients') ]);
      const now = Date.now();
      const potentials = {};
      (clients.clients||[]).forEach(c=>{
        const st = String(c.status||"").toLowerCase().replace(/\s+/g,"_");
        if (st === "potenziale") potentials[(c.name||"").toLowerCase()] = 1;
      });
  let candidates = (apps.appointments||[]).filter(a=>{
  const end = new Date(a.end || a.start || 0).getTime();
  const nameKey = (a.client||"").toLowerCase();
  return a.nncf && !!potentials[nameKey] && (end + 60*1000) <= now && !hasSeen(a.id);
});
// prendi quello più "vicino" a ora (il più recente già concluso)
candidates.sort((a,b)=>{
  const ea = new Date(a.end || a.start || 0).getTime();
  const eb = new Date(b.end || b.start || 0).getTime();
  return Math.abs(now - eb) - Math.abs(now - ea); // eb più vicino → prima
});
if(candidates.length) showBecameClientBanner(candidates[0]);

    }catch(_){}
  }
  // avvio immediato e polling ogni 60s
  scanForConversionCandidates();
  if (!window.__bp_check_convert_timer__) {
    window.__bp_check_convert_timer__ = setInterval(scanForConversionCandidates, 60000);
  }

  // ===== ICS: export singolo appuntamento =====
  function attachIcsButton(container, appt){
    if(!container || !appt) return;
    if(container.querySelector(`[data-ics-id="${appt.id}"]`)) return;
    const btn = document.createElement("button");
    btn.className = "ghost"; btn.textContent = "Esporta .ics";
    btn.setAttribute("data-ics-id", appt.id);
    btn.style.marginLeft = '6px';
    btn.addEventListener("click", ()=>{
      if (window.BP && window.BP.ICS && typeof window.BP.ICS.downloadIcsForAppointment === "function"){
        window.BP.ICS.downloadIcsForAppointment({
          id: appt.id, client: appt.client, start: appt.start, end: appt.end,
          type: appt.type, notes: appt.notes, vss: appt.vss, vsdPersonal: appt.vsdPersonal
        });
        haptic('light');
      }else{
        toast("Export ICS non disponibile");
      }
    });
    container.appendChild(btn);
  }

  // ===== REPORT: Gmail Web/App + autocopia =====
  (function hookReport(){
    const orig = window.viewReport || window.viewReports;
    if(typeof orig!=='function') return;
    window.viewReport = window.viewReports = async function(){
      const out = await orig.apply(this, arguments);

      const host = $('#report_actions') || $('[data-report-actions]') || $('.wrap');
      if(!host) return out;
      if($('#bp_mail_actions', host)) return out;

      const bar = document.createElement('div');
      bar.id = 'bp_mail_actions';
      bar.className = 'row';
      bar.style.margin = '8px 0 12px';
      bar.innerHTML = `
        <button id="bp_mail_gweb" class="ghost">Apri Gmail Web</button>
        <button id="bp_mail_gapp" class="ghost">Apri Gmail App</button>
        <div class="small muted" style="align-self:center">Il testo del report viene copiato automaticamente: incolla e invia ✉️</div>
      `;
      host.prepend(bar);

      async function getReportBody(){
        const cands = ['#report_text','#report','[data-report]','.report','.wrap'];
        for(const sel of cands){ const el=$(sel); if(el && el.innerText && el.innerText.trim().length>60) return el.innerText.trim(); }
        return document.body.innerText.trim();
      }
      async function ccList(){
        try{ const r = await GET('/api/users_emails'); const arr=(r.users||[]).map(u=>u.email).filter(Boolean); return encodeURIComponent(arr.join(',')); }
        catch(_){ return ''; }
      }
      function buildSubject(){
        const sels = ['[data-period-label]','#rep_period_label','#p_label','.report .neon'];
        for(const s of sels){ const x=$(s); if(x && x.textContent && x.textContent.trim()) return 'BP periodi ' + x.textContent.trim(); }
        return 'BP periodo';
      }

      async function openWeb(){
        const body = await getReportBody(); await copyText(body); haptic('light');
        const cc = await ccList();
        const url = 'https://mail.google.com/mail/?view=cm&fs=1'
          + '&to=' + '' + '&cc=' + cc + '&bcc=' + ''
          + '&su=' + encodeURIComponent(buildSubject());
        window.open(url,'_blank','noopener');
        toast('Testo copiato. Incolla il corpo su Gmail Web.');
      }
      async function openApp(){
        const body = await getReportBody(); await copyText(body); haptic('light');
        const cc = await ccList(); const subject = encodeURIComponent(buildSubject());
        const deep = `googlegmail://co?to=&cc=${cc}&subject=${subject}`;
        try{
          window.location.href = deep;
          setTimeout(()=>{ window.location.href = `mailto:?cc=${cc}&subject=${subject}`; }, 800);
        }catch(_){
          window.location.href = `mailto:?cc=${cc}&subject=${subject}`;
        }
        toast('Testo copiato. Incolla il corpo su Gmail App.');
      }
      $('#bp_mail_gweb').addEventListener('click', openWeb);
      $('#bp_mail_gapp').addEventListener('click', openApp);

      return out;
    };
  })();

  // ===== BP: frasi motivazionali solo al SALVA =====
  document.addEventListener('click', function(ev){
    if(ev.target && ev.target.id === 'btnSaveP'){
      setTimeout(()=>{ coachSay('high'); haptic('heavy'); }, 300);
    }
  });

  // ===== Appuntamenti: hook fetch POST (crea/modifica) → frasi + (se NNCF) banner quando scatta l’ora
  if (!window.fetch.__bpWrapAppt){
    const _fetch = window.fetch; window.fetch.__bpWrapAppt = true;
    window.fetch = async function(input, init){
      const url = (typeof input==='string') ? input : (input && input.url) || '';
      const isApptPost = url.includes('/api/appointments') && (init && init.method === 'POST');
      const res = await _fetch.apply(this, arguments);
      if (isApptPost && res.ok){
        try{
          const clone = await res.clone().json();
          const body = init && init.body ? JSON.parse(init.body) : {};
          coachSay('medium'); haptic('light');
          // se è NNCF, il banner verrà mostrato dal poller quando l'appuntamento sarà finito
        }catch(_){}
      }
      return res;
    };
  }

  // ===== Appuntamenti: lista/modale solo futuri + export .ics su card + chip NNCF accanto al cliente
  ;(function hookAppointmentsView(){
    const orig = window.viewAppointments;
    if(typeof orig!=='function') return;
    window.viewAppointments = async function(){
      const out = await orig.apply(this, arguments);

      // 1) nascondi appuntamenti passati (oggi inclusi)
      try{
        const t = todayYMD();
        const rows = $$('[data-appt-id],[data-start],.app-row,.appt-row');
        rows.forEach(r=>{
          const ds = r.getAttribute('data-start') || r.dataset.start || '';
          const when = ds || r.getAttribute('data-date') || '';
          if(when && ymd(when) < t) r.style.display = 'none';
        });
      }catch(_){}

      // 2) export .ics su card
      try{
        const cards = $$('.appt-card, .app-row, [data-appt-id]');
        cards.forEach(card=>{
          const appt = {
            id: card.getAttribute('data-appt-id') || card.id || ('row-'+Math.random().toString(16).slice(2)),
            client: card.getAttribute('data-client') || $('.client',card)?.textContent || 'Cliente',
            start:  card.getAttribute('data-start') || card.dataset.start,
            end:    card.getAttribute('data-end')   || card.dataset.end,
            type:   card.getAttribute('data-type')  || card.dataset.type,
            notes:  card.getAttribute('data-notes') || ''
          };
          if(appt.start && appt.end) attachIcsButton(card, appt);
        });
      }catch(_){}

      // 3) chip NNCF vicino al cliente (se i campi esistono)
      try{
        const clientWrap = $('#a_client')?.closest('div') || $('input[name=client]')?.closest('div');
        const nn = $('#a_nncf') || $('input[name=nncf]');
        if(clientWrap && nn && !nn.__moved){
          nn.__moved = true;
          const chip = document.createElement('label');
          chip.className = 'nncf-chip';
          chip.innerHTML = `<input type="checkbox" id="${nn.id||'nncf_plus'}" ${nn.checked?'checked':''}> NNCF`;
          chip.querySelector('input').addEventListener('change', (e)=>{ nn.checked = e.target.checked; nn.dispatchEvent(new Event('input')); });
          clientWrap.appendChild(chip);
        }
      }catch(_){}

      return out;
    };
  })();

  // stile NNCF chip
  const cssNN = `
  .nncf-chip{ display:inline-flex; align-items:center; gap:6px; margin-top:4px; padding:6px 10px; border:1px solid var(--hair2, rgba(255,255,255,.2));
    border-radius:999px; background:rgba(141,123,255,.12); font-weight:700; cursor:pointer; user-select:none; }
  .nncf-chip input{ transform: scale(1.2); }
  `;
  const sNN = document.createElement('style'); sNN.textContent = cssNN; document.head.appendChild(sNN);

  // ===== Calendario: evidenzia OGGI e export .ics dentro il giorno
  ;(function hookCalendar(){
    const orig = window.viewCalendar || window.viewCalendarMonth || window.viewAgenda;
    if(!orig) return;
    const wrap = function(){
      const out = orig.apply(this, arguments);
      setTimeout(()=>{
        const t = todayYMD();
        const days = $$('.day');
        days.forEach(d=>{
          const dstr = d.getAttribute('data-date') || d.dataset.date || '';
          if(dstr && dstr === t) d.classList.add('today');
        });
        const cards = $$('.day [data-appt-id]');
        cards.forEach(card=>{
          const appt = {
            id: card.getAttribute('data-appt-id') || card.id || ('row-'+Math.random().toString(16).slice(2)),
            client: card.getAttribute('data-client') || $('.client',card)?.textContent || 'Cliente',
            start:  card.getAttribute('data-start') || card.dataset.start,
            end:    card.getAttribute('data-end')   || card.dataset.end,
            type:   card.getAttribute('data-type')  || card.dataset.type,
            notes:  card.getAttribute('data-notes') || ''
          };
          if(appt.start && appt.end) attachIcsButton(card, appt);
        });
      }, 60);
      return out;
    };
    if(window.viewCalendar) window.viewCalendar = wrap;
    if(window.viewCalendarMonth) window.viewCalendarMonth = wrap;
    if(window.viewAgenda) window.viewAgenda = wrap;
  })();

 // ===== Clienti: filtri + card arricchite + edit inline solo admin (FIX) =====
;(function hookClients(){
  const orig = window.viewClients;
  if (typeof orig !== 'function') return;

  // helper locali
  const $ = (sel,root)=> (root||document).querySelector(sel);
  const $$ = (sel,root)=> Array.prototype.slice.call((root||document).querySelectorAll(sel));
  function mapLastAppointments(appts){
    const out = {};
    (appts||[]).forEach(a=>{
      const key = String(a.client||'').trim().toLowerCase();
      const d = a.start || a.end;
      if(!key || !d) return;
      if(!out[key] || new Date(d) > new Date(out[key])) out[key] = d;
    });
    return out;
  }
  function normSt(s){ return String(s||'').toLowerCase().replace(/_/g,' ').trim(); }
  function applyClientsFilters(rows, { status, consultantId }){
    let r = rows || [];
    if(status && status!=='tutti'){
      r = r.filter(c => normSt(c.status) === normSt(status));
    }
    if(consultantId){
      r = r.filter(c => (c.consultantId||'') === consultantId);
    }
    return r;
  }

  window.viewClients = async function(){
    const out = await orig.apply(this, arguments);

    try{
      const me = (JSON.parse(localStorage.getItem('bp_user')||'null')) || {};
      const isAdmin = String(me.role||'') === 'admin';

      const [appsResp, clientsResp, usersResp] = await Promise.all([
        fetch('/api/appointments?global=1', { headers:{Authorization:'Bearer '+(me.token||'')}}).then(r=>r.json()).catch(()=>({})),
        fetch('/api/clients', { headers:{Authorization:'Bearer '+(me.token||'')}}).then(r=>r.json()).catch(()=>({})),
        fetch('/api/usernames', { headers:{Authorization:'Bearer '+(me.token||'')}}).then(r=>r.json()).catch(()=>({}))
      ]);

      const appts   = (appsResp && appsResp.appointments) || [];
      let   clients = (clientsResp && clientsResp.clients) || [];
      const users   = (usersResp && usersResp.users) || [];

      // arricchisci con ultimo appuntamento
      const mapLA = mapLastAppointments(appts);
      clients = clients.map(c => ({ ...c, lastAppointment: mapLA[String(c.name||'').toLowerCase()] || null }));

      // CONTAINER: limita al box lista clienti (evita di toccare altre card della pagina)
      const listBox = $('#clients_list') || $('[data-clients-list]') || $('#cl_list') || document.querySelector('.wrap') || document.body;

      // --- FILTRI (una sola volta) ---
      let bar = $('#bp_cli_filters', listBox);
      if(!bar){
        bar = document.createElement('div');
        bar.id = 'bp_cli_filters';
        bar.className = 'row';
        bar.style.margin = '8px 0';
        bar.innerHTML = `
          <div><label>Stato</label>
            <select id="cli_filter_status">
              <option value="tutti">Tutti</option>
              <option value="attivo">Attivo</option>
              <option value="potenziale">Potenziale</option>
              <option value="lead_non_chiuso">Lead non chiuso</option>
            </select>
          </div>
          <div><label>Consulente</label>
            <select id="cli_filter_consultant">
              <option value="">Tutti</option>
            </select>
          </div>
        `;
        listBox.prepend(bar);

        // popola consulenti
        const sel = $('#cli_filter_consultant', listBox);
        users.forEach(u=>{
          const opt = document.createElement('option');
          opt.value = u.id; opt.textContent = u.name + (u.grade ? ' ('+u.grade+')' : '');
          sel.appendChild(opt);
        });

        $('#cli_filter_status', listBox).addEventListener('change', applyFilters);
        $('#cli_filter_consultant', listBox).addEventListener('change', applyFilters);
      }

      function applyFilters(){
        const rows = applyClientsFilters(clients, {
          status: $('#cli_filter_status', listBox).value,
          consultantId: $('#cli_filter_consultant', listBox).value || null
        });
        renderList(rows);
      }

      // --- RENDER LISTA (solo card nel container dei clienti) ---
      function renderList(rows){
        const byName = {};
        rows.forEach(c => { byName[(c.name||'').toLowerCase()] = c; });

        const cards = Array.from(listBox.querySelectorAll('.card'));
        cards.forEach(card=>{
          // prova attributo, poi classici candidati dentro card
          let cname = card.getAttribute('data-client-name')
                    || card.getAttribute('data-name')
                    || (card.querySelector('.title, .big, b, strong')?.textContent || '');
          cname = String(cname||'').trim();

          const c = byName[cname.toLowerCase()];
          if(!c){
            // non nascondere eventuale card "Nuovo cliente"
            const isNew = /nuovo cliente|aggiungi/i.test(card.innerText||'');
            card.style.display = isNew ? '' : 'none';
            return;
          }
          card.style.display = '';

          // rimuovi eventuale info bar precedente
          const old = card.querySelector('.bp-client-info'); if(old) old.remove();

          // barra info
          const row = document.createElement('div');
          row.className = 'row small bp-client-info';
          row.style.marginTop = '6px';

          const st = document.createElement('div');
          st.style.minWidth = '160px';
          if(isAdmin){
            st.innerHTML = `<label>Stato</label>
              <select class="bp-stato">
                <option value="attivo">Attivo</option>
                <option value="potenziale">Potenziale</option>
                <option value="lead_non_chiuso">Lead non chiuso</option>
              </select>`;
          }else{
            st.innerHTML = `<div><span class="muted">Stato</span><br><b class="bp-stato-text"></b></div>`;
          }

          const co = document.createElement('div');
          co.style.minWidth = '220px';
          if(isAdmin){
            const opts = users.map(u=>`<option value="${u.id}">${u.name}${u.grade?(' ('+u.grade+')'):''}</option>`).join('');
            co.innerHTML = `<label>Consulente</label>
              <select class="bp-cons">${opts}</select>`;
          }else{
            co.innerHTML = `<div><span class="muted">Consulente</span><br><b class="bp-cons-text"></b></div>`;
          }

          const la = document.createElement('div');
          la.style.minWidth = '200px';
          la.innerHTML = `<div><span class="muted">Ultimo appuntamento</span><br><b class="bp-last"></b></div>`;

          row.appendChild(st); row.appendChild(co); row.appendChild(la);
          card.appendChild(row);

          // set valori
          const selSt = card.querySelector('.bp-stato');
          const txtSt = card.querySelector('.bp-stato-text');
          const selCo = card.querySelector('.bp-cons');
          const txtCo = card.querySelector('.bp-cons-text');
          const outLa = card.querySelector('.bp-last');

          if(selSt) selSt.value = (c.status||'attivo');
          if(txtSt) txtSt.textContent = (c.status||'-');
          if(selCo) selCo.value = (c.consultantId||'');
          if(txtCo) txtCo.textContent = (c.consultantName||'-');
          outLa.textContent = c.lastAppointment ? (new Date(c.lastAppointment).toLocaleDateString()) : '—';

          if(isAdmin){
            if(selSt && !selSt.__wired){
              selSt.__wired = true;
              selSt.addEventListener('change', async ()=>{
                try{ await fetch('/api/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: c.id, status: selSt.value }) }); (window.toast||console.log)('Stato cliente aggiornato'); }
                catch(_){ (window.toast||console.warn)('Errore aggiornando lo stato'); }
              });
            }
            if(selCo && !selCo.__wired){
              selCo.__wired = true;
              selCo.addEventListener('change', async ()=>{
                try{ await fetch('/api/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: c.id, consultantId: selCo.value }) }); (window.toast||console.log)('Consulente aggiornato'); }
                catch(_){ (window.toast||console.warn)('Errore aggiornando il consulente'); }
              });
            }
          }
        });
      }

      applyFilters();
    }catch(e){ console.warn(e); }

    return out;
  };
})();


  // ===== TODAY CSS (se manca nel tema principale) =====
  (function injectTodayCSS(){
    if (document.getElementById('bp_today_css')) return;
    const st = document.createElement('style'); st.id='bp_today_css';
    st.textContent = `
      .day.today{
        outline: 2px solid var(--accent, #5dd3ff);
        box-shadow: inset 0 0 0 1px rgba(93,211,255,.25);
        position: relative;
      }
      .day.today::after{
        content: "Oggi";
        position: absolute; top:6px; right:8px;
        font-size:10px; opacity:.8; color: var(--accent, #5dd3ff);
      }
    `;
    document.head.appendChild(st);
  })();

})();
