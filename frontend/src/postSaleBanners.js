export function initPostSaleBanners(hapticImpact){
  // --- Parametri ---
  const LOOKBACK_DAYS = window.BANNERS_LOOKBACK_DAYS || 7; // ultimi N giorni
  const KIND_NNCF = 'nncf';
  const KIND_SALE = 'sale';

  // --- Helpers storage (snooze/Done) ---
  const snoozeKey  = (id, kind)=> `bp_snooze_${kind}_${id}`;
  const doneKey    = (id, kind)=> `bp_done_${kind}_${id}`;
  const isSnoozed  = (id,kind)=> {
    try{ const s=localStorage.getItem(snoozeKey(id,kind)); return s && (new Date(s).getTime()>Date.now()); }catch(_){ return false; }
  };
  const snooze1d   = (id,kind)=>{
    try{ const t=new Date(); t.setDate(t.getDate()+1); localStorage.setItem(snoozeKey(id,kind), t.toISOString()); }catch(_){}
  };
  const isDone     = (id,kind)=> { try{ return localStorage.getItem(doneKey(id,kind))==='1'; }catch(_){ return false; } };
  const markDone   = (id,kind)=> { try{ localStorage.setItem(doneKey(id,kind),'1'); }catch(_){ } };

  // --- Safe utils / shims già presenti altrove ---
  const GET  = (window.BPFinal && BPFinal.GET)  || window.GET;
  const POST = (window.BPFinal && BPFinal.POST) || window.POST;
  const toast = window.toast || (m=>alert(m));

  function htmlEscape(s){ return String(s||'').replace(/[&<>\"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  // --- Coda banner (riuso se già definita) ---
  function ensureBannerCSS(){
    if (document.getElementById('bp-banner-css')) return;
    const css = `
      #bp_banner_host{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;justify-content:center;pointer-events:none}
      .bp-banner-card{pointer-events:auto;width:100%;max-width:720px;background:var(--card,#fff);color:var(--text,#111);
        border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.28);padding:12px;display:flex;gap:12px;align-items:center}
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
  function pump(){ if(_showing) return; const next=_q.shift(); if(!next) return; _showing=true; ensureBannerCSS(); const host=getBannerHost(); host.innerHTML=''; host.appendChild(next(close)); function close(){ host.innerHTML=''; _showing=false; setTimeout(pump,40); } }

  // --- Client status helpers ---
  async function updateClientStatusByName(name, status){
    if(!name) return;
    const r = await GET('/api/clients');
    const list=(r&&r.clients)||[];
    const it = list.find(c=> String(c.name||'').trim().toLowerCase() === String(name).trim().toLowerCase());
    if (!it) return;
    await POST('/api/clients', { id: it.id, status });
  }

  // --- Quick editor VSS (solo quel campo) ---
  function openVSSQuickEditor(appt, opts){
    const initial = Number(appt.vss || appt.vsdPersonal || 0) || 0;
    const name = appt.client || 'Cliente';
    const d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML = `
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
              document.dispatchEvent(new CustomEvent('gi:edit', { detail: { id } }));
            }
          }catch(e){ logger.error(e); }
        }
        if (opts && typeof opts.onSaved==='function') opts.onSaved(v);
      }catch(e){ logger.error(e); toast('Errore salvataggio VSS'); }
    };
  }

  async function upsertGIFromAppointment(appt, vss){
    const payload = {
      apptId: appt.id,
      date: new Date(appt.end || appt.start || Date.now()).toISOString(),
      clientName: appt.client || 'Cliente',
      vssTotal: Math.round(Number(vss||0)),
      services: appt.services || appt.note || '',
      consultantId: appt.userId || appt.ownerId || null
    };
    const resp = await POST('/api/gi', payload);
    return (resp && (resp.sale || resp.gi || resp.data)) || resp;
  }

  function bannerSale(appt){
    return function(close){
      const card = document.createElement('div');
      card.className = 'bp-banner-card';
      card.innerHTML =
        `<div class="msg"><b>Allora, hai venduto a ${htmlEscape(appt.client||'Cliente')}?</b>
           <div class="small muted">Appuntamento di vendita concluso</div></div>
         <div class="row">
           <button class="ghost" data-act="later">Posticipa</button>
           <button class="ghost" data-act="no">No</button>
           <button data-act="yes">Sì</button>
         </div>`;
      card.querySelector('[data-act="yes"]').onclick = function(){
        close();
        openVSSQuickEditor(appt, { onSaved: ()=> markDone(appt.id, KIND_SALE) });
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        close();
        try{ await POST('/api/appointments', { id: appt.id, vss: 0 }); markDone(appt.id, KIND_SALE); toast('Registrato: nessuna vendita'); }catch(_){}
      };
      card.querySelector('[data-act="later"]').onclick = function(){
        snooze1d(appt.id, KIND_SALE); toast('Te lo ripropongo domani'); close();
      };
      return card;
    };
  }

  function bannerNNCF(appt){
    return function(close){
      const card = document.createElement('div');
      card.className = 'bp-banner-card';
      card.innerHTML =
        `<div class="msg"><b>È diventato cliente?</b> ${htmlEscape(appt.client||'')}</div>
         <div class="row">
           <button class="ghost" data-act="later">Posticipa</button>
           <button class="ghost" data-act="no">No</button>
           <button data-act="yes">Sì</button>
         </div>`;
      card.querySelector('[data-act="yes"]').onclick = async function(){
        close();
        try{
          await updateClientStatusByName(appt.client, 'attivo');
        }catch(_){}
        openVSSQuickEditor(appt, { onSaved: ()=> markDone(appt.id, KIND_NNCF) });
      };
      card.querySelector('[data-act="no"]').onclick = async function(){
        close();
        try{
          await updateClientStatusByName(appt.client, 'lead non chiuso');
          await POST('/api/appointments', { id: appt.id, vss: 0 });
          markDone(appt.id, KIND_NNCF);
          toast('Aggiornato: Lead non chiuso, VSS=0');
        }catch(_){}
      };
      card.querySelector('[data-act="later"]').onclick = function(){
        snooze1d(appt.id, KIND_NNCF); toast('Te lo ripropongo domani'); close();
      };
      return card;
    };
  }

  async function scan(){
    try{
      const r = await GET('/api/appointments');
      const now = Date.now();
      const fromTs = now - LOOKBACK_DAYS*24*60*60*1000;
      const list = (r && r.appointments) || [];
      list.sort((a,b)=> (+new Date(b.end||b.start||0))-(+new Date(a.end||a.start||0)));
      list.forEach(appt=>{
        try{
          const end = +new Date(appt.end || appt.start || 0);
          if (!end || end>now || end<fromTs) return;
          const isVendita = String(appt.type||'').toLowerCase()==='vendita' || Number(appt.vss||0)>0 || Number(appt.vsdPersonal||0)>0;
          if (appt.nncf){
            if (isDone(appt.id, KIND_NNCF) || isSnoozed(appt.id, KIND_NNCF)) return;
            enqueueBanner(bannerNNCF(appt));
          } else if (isVendita){
            if (isDone(appt.id, KIND_SALE) || isSnoozed(appt.id, KIND_SALE)) return;
            enqueueBanner(bannerSale(appt));
          }
        }catch(_){}
      });
    }catch(_){}
  }

  window.scanBanners = scan;
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scan, {once:true});
  } else {
    scan();
  }
}
