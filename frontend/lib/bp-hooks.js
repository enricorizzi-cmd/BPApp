// bp-hooks.js — minichart Dashboard/Provvigioni, grafico Squadra, evidenzia Oggi
(function(){
  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function safeChartLine(canvasId, labels, data){
    try{
      const el = document.getElementById(canvasId);
      if(!el || !window.Chart) return;
      if(el.__chart){ try{ el.__chart.destroy(); }catch(e){} }
      el.__chart = new Chart(el.getContext('2d'), {
        type:'line',
        data:{ labels:labels, datasets:[{ data:data, tension:.35, pointRadius:2, borderWidth:2 }]},
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{x:{display:true}, y:{display:true}} }
      });
    }catch(e){ console.warn('[bp-hooks chart]', e); }
  }
  function labelsFor(type, buckets){
    return buckets.map(b=>{
      const d = new Date(b.s);
      if(type==='settimanale') return String(window.isoWeekNum(d));
      if(type==='mensile'||type==='ytd'||type==='ltm') return String(d.getMonth()+1);
      if(type==='trimestrale') return String(Math.floor(d.getMonth()/3)+1);
      if(type==='semestrale') return (d.getMonth()<6)?'1':'2';
      return String(d.getFullYear());
    });
  }
  function computeSeries(periods, buckets, type, mode, indicator){
    return buckets.map(B=>{
      let s = 0;
      periods.forEach(p=>{
        if(p.type !== window.effectivePeriodType(type)) return;
        const ps = new Date(p.startDate).getTime(), pe = new Date(p.endDate).getTime();
        if(ps>=B.s && pe<=B.e){ s += window.sumIndicator(p, mode, indicator); }
      });
      return s;
    });
  }

  function patchDashboard(){
    if(typeof window.renderDashboard !== 'function') return;
    const orig = window.renderDashboard;
    window.renderDashboard = async function(){
      const r0 = await orig.apply(this, arguments);
      try{
        const r = window.readUnifiedRange ? window.readUnifiedRange('d') : { type:'mensile', end:new Date() };
        const type = r.type || 'mensile';
        const mode = (document.getElementById('d_mode')||{}).value || 'consuntivo';
        const buckets = window.buildBuckets(type, r.end);
        const periods = (window.__cache_periods||window.periods||[]).slice();
        const L = labelsFor(type, buckets);
        ['VSS','VSDPersonale','GI','NNCF'].forEach((k,i)=>{
          const data = computeSeries(periods, buckets, type, mode, k);
          safeChartLine('d_mini_'+k.toLowerCase(), L, data);
        });
      }catch(e){ console.warn('[bp-hooks dashboard]', e); }
      return r0;
    };
  }

  function patchCommissions(){
    if(typeof window.renderComms !== 'function') return;
    const orig = window.renderComms;
    window.renderComms = async function(){
      const r0 = await orig.apply(this, arguments);
      try{
        const r = window.readUnifiedRange ? window.readUnifiedRange('cm') : { type:'mensile', end:new Date() };
        const type = r.type || 'mensile';
        const mode = (document.getElementById('cm_mode')||{}).value || 'consuntivo';
        const buckets = window.buildBuckets(type, r.end);
        const periods = (window.__cache_periods||window.periods||[]).slice();
        const L = labelsFor(type, buckets);
        const data = computeSeries(periods, buckets, type, mode, 'VSDPersonale');
        safeChartLine('cm_mini_vsd', L, data);
      }catch(e){ console.warn('[bp-hooks comms]', e); }
      return r0;
    };
  }

  function ensureTeamUI(){
    const app = document.getElementById('app'); if(!app) return;
    const host = app.querySelector('#tg_chart_card');
    if(host) return;
    const wrap = app.querySelector('.wrap') || app;
    const card = document.createElement('div');
    card.className = 'card'; card.id='tg_chart_card';
    card.innerHTML = '<b>Andamento indicatore</b>'
      + '<div class="row"><div><label>Indicatore</label><select id="tg_ind">'
      + '<option value="VSS">VSS</option><option value="VSDPersonale">VSD Personale</option>'
      + '<option value="GI">GI</option><option value="NNCF">NNCF</option></select></div>'
      + '<div><label>Consulente</label><select id="tg_user"><option value="">Tutti</option></select></div></div>'
      + '<canvas id="tg_chart" height="180"></canvas>';
    wrap.appendChild(card);
    const selU = document.getElementById('tg_user');
    (window.users||[]).forEach(u=>{
      const opt=document.createElement('option'); opt.value=u.id; opt.textContent=u.name+(u.grade?(' ('+u.grade+')'):'');
      selU.appendChild(opt);
    });
  }
  function patchTeam(){
    if(typeof window.loadTeam !== 'function') return;
    const orig = window.loadTeam;
    window.loadTeam = async function(){
      const r0 = await orig.apply(this, arguments);
      try{
        ensureTeamUI();
        const r = window.readUnifiedRange ? window.readUnifiedRange('tg') : { type:'mensile', end:new Date() };
        const type = r.type || 'mensile';
        const mode = (document.getElementById('t_mode')||{}).value || 'consuntivo';
        const selU = document.getElementById('tg_user');
        const userId = selU ? (selU.value||'') : '';
        const ind = (document.getElementById('tg_ind')||{}).value || 'VSS';
        const buckets = window.buildBuckets(type, r.end);
        const L = labelsFor(type, buckets);
        const periods = (window.__cache_periods||window.periods||[]).slice();
        const data = buckets.map(B=>{
          let s=0;
          periods.forEach(p=>{
            if(p.type !== window.effectivePeriodType(type)) return;
            if(userId && String(p.userId)!==String(userId)) return;
            const ps=new Date(p.startDate).getTime(), pe=new Date(p.endDate).getTime();
            if(ps>=B.s && pe<=B.e){ s += window.sumIndicator(p, mode, ind); }
          });
          return s;
        });
        safeChartLine('tg_chart', L, data);
        document.getElementById('tg_ind').onchange = ()=>window.loadTeam();
        if(selU) selU.onchange = ()=>window.loadTeam();
      }catch(e){ console.warn('[bp-hooks team]', e); }
      return r0;
    };
  }

  function markTodayInCalendar(){
    try{
      const today = new Date(); const k = today.toISOString().slice(0,10);
      const el = document.querySelector('[data-day="'+k+'"]');
      if (el) el.classList.add('today');
    }catch(e){}
  }

  onReady(function(){
    markTodayInCalendar();
    const iv = setInterval(markTodayInCalendar, 3000);
    setTimeout(()=>clearInterval(iv), 15000);
    patchDashboard(); patchCommissions(); patchTeam();
  });
})();