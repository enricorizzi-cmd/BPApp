/* Battle Plan - frontend main.js (v13 delta)
   Aggiunte principali:
   - Filtri unificati: settimanale / mensile / trimestrale / semestrale / annuale + YTD / LTM
   - KPI cards bordo/relief + mini-chart coerenti con granularità
   - Dashboard: “Ultimi Appuntamenti” e “Ultimi BP” cliccabili (aprono in modifica)
   - Report: prev corrente se esiste (altrimenti prossimo) + finestra sincronizzata coi Quadranti
   - Squadra: Admin = aggregato squadra + per utente, Consultant = aggregato; filtri unificati; include provvigioni
   - Nuova pagina: Provvigioni (Prev/Cons), KPI + serie + breakdown; usa grade (junior/senior)
   - Utenti (Admin): aggiunto selettore Grade
   Compatibilità: conserva namespace, funzioni e v=13. 
*/
/* global logger */
import { save, load, del, setToken, getToken, setUser, getUser, logout } from "./src/auth.js";
import { api, GET, POST, DEL } from "./src/api.js";
import { pad2, dmy, ymd, timeHM, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isoWeekNum, startOfQuarter, endOfQuarter, startOfSemester, endOfSemester, startOfYear, endOfYear, startOfIsoWeek, weekBoundsOf, nextWeekBounds, prevWeekBounds, nextMonthBounds, prevMonthBounds, nextQuarterBounds, prevQuarterBounds, nextSemesterBounds, prevSemesterBounds, nextYearBounds, prevYearBounds, formatPeriodLabel } from "./src/dateUtils.js";
import { toast, celebrate } from "./modules/notifications.js";
import { htmlEscape, fmtEuro, fmtInt, domFromHTML } from "./modules/utils.js";
import { topbarHTML, renderTopbar, toggleDrawer, rerenderTopbarSoon } from "./modules/ui.js";
import { $1, $all, getQuery } from "./src/query.js";
import "./lib/ics-single.js";
;(function () {
  'use strict';


  // ===== ROOT =====
  var appEl = document.getElementById('app');

  window.$1 = window.$1 || $1;
  window.$all = window.$all || $all;

  // Graceful fallback for optional globals
  window.addXP = window.addXP || function(){};
  if (typeof window.logger !== 'object') {
    window.logger = ['debug','info','log','warn','error'].reduce((acc, lvl) => {
      acc[lvl] = (console[lvl] || console.log).bind(console);
      return acc;
    }, {});
  }




/* ---- Fallback haptic() ---- */
if (typeof window.haptic !== 'function'){
  // no-op se non disponibile; manteniamo la firma generica
  window.haptic = function(){};
}

/* ---- Line chart helper condiviso (mini grafici = stile Squadra) ---- */
// Usa Chart.js se presente, altrimenti un semplice fallback canvas 2D.
// Mantiene un'istanza per canvasId per aggiornamenti fluidi.
;(function(){
  const registry = (window.__miniCharts = window.__miniCharts || {});
  function drawFallback(el, labels, data){
    const ctx = el.getContext('2d');
    el.width  = el.clientWidth  || 320;
    el.height = el.clientHeight || 80;
    ctx.clearRect(0,0,el.width,el.height);
    const max = Math.max(1, ...data);
    const stepX = (data.length>1) ? (el.width-8)/(data.length-1) : 0;
    ctx.strokeStyle = '#2e6cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<data.length;i++){
      const x = 4 + i*stepX;
      const y = el.height-6 - (data[i]/max)*(el.height-12);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.fillStyle = '#2e6cff';
    for(let i=0;i<data.length;i++){
      const x = 4 + i*stepX;
      const y = el.height-6 - (data[i]/max)*(el.height-12);
      ctx.beginPath();
      ctx.arc(x,y,2,0,Math.PI*2);
      ctx.fill();
    }
  }
  // Decide how to render X-axis labels: compressed or rotated
  function computeTickOptions(labels, width){
    try{
      const n = Array.isArray(labels) ? labels.length : 0;
      if(!n) return { autoSkip:true, maxRotation:0, minRotation:0 };
      const maxLen = Math.max(0, ...labels.map(s => String(s||'').length));
      const estPer = Math.max(28, Math.min(90, Math.round(maxLen * 7)));
      const need = n * estPer;
      if(need > (width||320)*1.2){
        return {
          autoSkip:true,
          maxRotation:45,
          minRotation:45,
          callback: v => String(v||'')
        };
      }
      return {
        autoSkip:true,
        maxRotation:0,
        minRotation:0,
        callback: v => String(v||'')
      };
    }catch(_){
      return { autoSkip:true, maxRotation:0, minRotation:0 };
    }
  }
  window.computeTickOptions = computeTickOptions;

  window.drawFullLine = function(canvasId, labels, data){
    const el = document.getElementById(canvasId);
    if(!el) return;
    // dimensionamento esplicito per evitare reflow da resize responsivi
    el.width  = el.clientWidth  || el.width  || 320;
    el.height = el.clientHeight || el.height || 80;
    if (typeof Chart === 'undefined'){
      drawFallback(el, labels, data);
      return;
    }
    const key = String(canvasId);
    const tickOpts = computeTickOptions(labels, el.width||320);
    if(registry[key] && registry[key].canvas !== el){
      try{ registry[key].destroy(); }catch(_){ }
      delete registry[key];
    }
    if(!registry[key]){
      const ctx = el.getContext('2d');
      registry[key] = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{
          label: '',
          data: data,
          borderColor: '#2e6cff',
          backgroundColor: 'rgba(46,108,255,0.10)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false
        }] },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          animation: false,
          animations: false,
          plugins: { legend: { display:false } },
          scales: {
            x: { grid: { display:false }, ticks: tickOpts },
            y: { beginAtZero:true }
          }
        }
      });
    } else {
      const ch = registry[key];
      ch.data.labels = labels;
      ch.data.datasets[0].data = data;
      ch.options.scales.x.ticks = computeTickOptions(labels, el.width||320);
      ch.update();
    }
  };
})();

/* === Commission helpers (client fallback; server endpoint arriverà) === */
function getRates(settings){
  var c = (settings && settings.commissions) || {};
  return {
    gi:         (typeof c.gi==='number') ? c.gi : 0.15,
    vsdJunior:  (typeof c.vsdJunior==='number') ? c.vsdJunior : 0.20,
    vsdSenior:  (typeof c.vsdSenior==='number') ? c.vsdSenior : 0.25
  };
}
function userGrade(){
  var u = getUser();
  return (u && (u.grade==='senior' || u.grade==='junior')) ? u.grade : 'junior';
}

// ===== LOGIN =====
function viewLogin(){
  document.title = 'Battle Plan – Login';
  var html =
    '<div class="hero" id="hero">'+
      '<div class="layer glow"></div>'+
      '<div class="layer grid"></div>'+
      '<div class="title">Pianifica. Eroga. Vinci. <span class="small muted">BP – stile gaming</span></div>'+
    '</div>'+
    '<div class="wrap">'+
      '<div class="grid">'+
        '<div class="card">'+
          '<h3>Accedi</h3>'+
          '<form id="loginForm" autocomplete="on">'+
            '<div class="row">'+
              '<div><label>Email</label><input id="li_email" name="email" type="email" autocomplete="username" required></div>'+
              '<div><label>Password</label><input id="li_password" name="password" type="password" autocomplete="current-password" required></div>'+
            '</div>'+
            '<div class="row"><label class="small"><input type="checkbox" id="li_remember" checked> Rimani collegato</label></div>'+
            '<div class="right" style="margin-top:8px">'+
              '<button type="submit" id="btnLogin">Accedi</button>'+
            '</div>'+
          '</form>'+
        '</div>'+
        '<div class="card">'+
          '<h3>Registrati</h3>'+
          '<form id="regForm" autocomplete="on">'+
            '<div class="row">'+
              '<div><label>Nome</label><input id="re_name" name="name" type="text" required></div>'+
              '<div><label>Email</label><input id="re_email" name="email" type="email" autocomplete="username" required></div>'+
              '<div><label>Password</label><input id="re_password" name="new-password" type="password" autocomplete="new-password" required></div>'+
            '</div>'+
            '<div class="right" style="margin-top:8px">'+
              '<button type="submit" id="btnRegister">Registrati</button>'+
            '</div>'+
          '</form>'+
        '</div>'+
      '</div>'+
    '</div>';
  appEl.innerHTML = html;

  var hero = document.getElementById('hero');
  if(hero){
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--gx', ((e.clientX-r.left)/r.width*100)+'%');
      hero.style.setProperty('--gy', ((e.clientY-r.top)/r.height*100)+'%');
    });
  }

  var loginForm = document.getElementById('loginForm');
  var regForm   = document.getElementById('regForm');

  loginForm.addEventListener('submit', function(ev){
    ev.preventDefault();
    var btn = document.getElementById('btnLogin'); btn.disabled = true;
    var email = document.getElementById('li_email').value.trim().toLowerCase();
    var password = document.getElementById('li_password').value;
    var remember = document.getElementById('li_remember').checked;
    POST('/api/login',{email:email,password:password}).then(function(r){
      if(typeof r==='string'){ try{ r=JSON.parse(r);}catch(e){} }
      setToken(r.token, remember); setUser(r.user);
      toast('Bentornato '+r.user.name+'!'); window.addXP(10);
      viewHome(); renderTopbar();
      if(window.BPPush) window.BPPush.subscribe();
    }, function(err){
      toast('Credenziali errate'); logger.error(err);
    }).catch(function(err){
      logger.error(err);
    }).finally(function(){ btn.disabled = false; });
  });

  regForm.addEventListener('submit', function(ev){
    ev.preventDefault();
    var btn = document.getElementById('btnRegister'); btn.disabled = true;
    var name = document.getElementById('re_name').value.trim();
    var email= document.getElementById('re_email').value.trim().toLowerCase();
    var password = document.getElementById('re_password').value;
    POST('/api/register',{name:name,email:email,password:password}).then(function(){
      toast('Registrazione ok. Ora accedi'); celebrate(); window.addXP(20); window.scrollTo({top:0,behavior:'smooth'});
    }).catch(function(err){
      toast('Email già registrata?'); logger.error(err);
    }).finally(function(){ btn.disabled = false; });
  });
}
// ====== FILTRI UNIFICATI (UI builders) ======
function unifiedFiltersHTML(prefix){
  const yr=(new Date()).getFullYear();
  const mm=(new Date()).getMonth()+1;
  const wk=isoWeekNum(new Date());
  return ''+
    '<div class="uf"><div class="row">'+
      '<div>'+
        '<label>Granularità</label>'+
        '<select id="'+prefix+'_gran">'+
          '<option value="settimanale">Settimanale</option>'+
          '<option value="mensile" selected>Mensile</option>'+
          '<option value="trimestrale">Trimestrale</option>'+
          '<option value="semestrale">Semestrale</option>'+
          '<option value="annuale">Annuale</option>'+
          '<option value="ytd">Anno corrente (YTD)</option>'+
          '<option value="ltm">Ultimi 12 mesi (LTM)</option>'+
        '</select>'+
      '</div>'+

      '<div id="'+prefix+'_wrap_week" style="display:none">'+
        '<label>Settimana ISO</label>'+
        '<div class="row"><input type="number" id="'+prefix+'_week" min="1" max="53" value="'+wk+'">'+
        '<input type="number" id="'+prefix+'_year_w" min="2000" max="2100" value="'+yr+'"></div>'+
      '</div>'+

      '<div id="'+prefix+'_wrap_month">'+
        '<label>Mese</label>'+
        '<div class="row"><input type="number" id="'+prefix+'_month" min="1" max="12" value="'+mm+'">'+
        '<input type="number" id="'+prefix+'_year_m" min="2000" max="2100" value="'+yr+'"></div>'+
      '</div>'+

      '<div id="'+prefix+'_wrap_quarter" style="display:none">'+
        '<label>Trimestre</label>'+
        '<div class="row"><input type="number" id="'+prefix+'_quarter" min="1" max="4" value="'+Math.floor((mm-1)/3)+1+'">'+
        '<input type="number" id="'+prefix+'_year_q" min="2000" max="2100" value="'+yr+'"></div>'+
      '</div>'+

      '<div id="'+prefix+'_wrap_sem" style="display:none">'+
        '<label>Semestre</label>'+
        '<div class="row"><select id="'+prefix+'_sem"><option value="1">1°</option><option value="2">2°</option></select>'+
        '<input type="number" id="'+prefix+'_year_s" min="2000" max="2100" value="'+yr+'"></div>'+
      '</div>'+

      '<div id="'+prefix+'_wrap_year" style="display:none">'+
        '<label>Anno</label>'+
        '<input type="number" id="'+prefix+'_year" min="2000" max="2100" value="'+yr+'">'+
      '</div>'+

      '<div style="align-self:flex-end"><button id="'+prefix+'_refresh" class="ghost">Aggiorna</button></div>'+
    '</div></div>';
}

// === Event bus: ascolto/emissione cambi range ===
(function(){
  const listeners=[];
  window.onUnifiedRangeChange=function(cb){
    if(typeof cb==='function') listeners.push(cb);
  };
  window.emitUnifiedRangeChange=function(scope){
    for(const cb of listeners){ try{ cb(scope); }catch(e){ logger.error(e);} }
  };
})();

// Mappa prefissi UI → scope atteso dai final-hooks
function __mapScope(prefix){
  if (prefix==='d' || prefix==='dash') return 'dash';
  if (prefix==='cm' || prefix==='comm') return 'comm';
  if (prefix==='tg' || prefix==='t' || prefix==='team') return 't';
  return prefix;
}

// Wiring dei controlli + toggle dei “wrap” visibili
function bindUnifiedFilters(prefix, onChange){
  function showWraps(){
    const g=document.getElementById(prefix+'_gran').value;
    const ids=['week','month','quarter','sem','year'];
    ids.forEach(i=>{
      const el=document.getElementById(prefix+'_wrap_'+i);
      if(el) el.style.display='none';
    });
    if(g==='settimanale') document.getElementById(prefix+'_wrap_week').style.display='';
    else if(g==='mensile') document.getElementById(prefix+'_wrap_month').style.display='';
    else if(g==='trimestrale') document.getElementById(prefix+'_wrap_quarter').style.display='';
    else if(g==='semestrale') document.getElementById(prefix+'_wrap_sem').style.display='';
    else if(g==='annuale') document.getElementById(prefix+'_wrap_year').style.display='';
  }
  ['gran','week','year_w','month','year_m','quarter','year_q','sem','year_s','year'].forEach(id=>{
    const el=document.getElementById(prefix+'_'+id);
    if(el){
      el.onchange=()=>{ showWraps(); if(onChange) onChange(); window.emitUnifiedRangeChange(__mapScope(prefix)); };
      el.oninput =()=>{ showWraps(); };
    }
  });
  const btn=document.getElementById(prefix+'_refresh');
  if(btn){
    btn.onclick=()=>{ if(onChange) onChange(); window.emitUnifiedRangeChange(__mapScope(prefix)); };
  }
  showWraps();
}

/* ========= NUOVO: readUnifiedRange =========
   Restituisce { type, start, end } a partire dai controlli del blocco con prefisso */
function readUnifiedRange(prefix){
  var now = new Date();

  // lettura numeri con default
  function num(id, def){
    var el = document.getElementById(prefix + '_' + id);
    var v = el ? parseInt(el.value, 10) : NaN;
    return isFinite(v) ? v : def;
  }

  var granEl = document.getElementById(prefix + '_gran');
  var g = granEl ? granEl.value : 'mensile';
  var out = { type: g, start: null, end: null };

  // SETTIMANALE (ISO: lun–dom)
  if (g === 'settimanale'){
    var yW = num('year_w', now.getFullYear());
    var w  = Math.max(1, Math.min(53, num('week', isoWeekNum(now))));
    var wb = weekBoundsOf(yW, w); out.start = wb.start; out.end = wb.end;
    return out;
  }

  // MENSILE
  if (g === 'mensile'){
    var yM = num('year_m', now.getFullYear());
    var m  = Math.max(1, Math.min(12, num('month', now.getMonth()+1)));
    out.start = new Date(yM, m-1, 1);
    out.end   = new Date(yM, m, 0, 23,59,59,999);
    return out;
  }

  // TRIMESTRALE
  if (g === 'trimestrale'){
    var yQ = num('year_q', now.getFullYear());
    var q  = Math.max(1, Math.min(4, num('quarter', Math.floor(now.getMonth()/3)+1)));
    out.start = new Date(yQ, (q-1)*3, 1);
    out.end   = new Date(yQ, q*3, 0, 23,59,59,999);
    return out;
  }

  // SEMESTRALE
  if (g === 'semestrale'){
    var yS = num('year_s', now.getFullYear());
    var sm = num('sem', (now.getMonth()<6?1:2));
    out.start = new Date(yS, sm===1?0:6, 1);
    out.end   = new Date(yS, sm===1?6:12, 0, 23,59,59,999);
    return out;
  }

  // ANNUALE
  if (g === 'annuale'){
    var y = num('year', now.getFullYear());
    out.start = new Date(y,0,1);
    out.end   = new Date(y,11,31,23,59,59,999);
    return out;
  }

  // YTD (1 gennaio → fine mese corrente)
  if (g === 'ytd'){
    var endYTD = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
    out.start = new Date(now.getFullYear(), 0, 1);
    out.end   = endYTD;
    return out;
  }

  // LTM (ultimi 12 mesi: primo giorno di 11 mesi fa → fine mese corrente)
  if (g === 'ltm'){
    var endLTM = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
    var startLTM = new Date(endLTM.getFullYear(), endLTM.getMonth()-11, 1);
    out.start = startLTM;
    out.end   = endLTM;
    return out;
  }

  // Fallback sicuro: mensile corrente
  out.type  = 'mensile';
  out.start = new Date(now.getFullYear(), now.getMonth(), 1);
  out.end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  return out;
}

/* === Helper standard: tipo per aggregazioni/grafici/API ===
   YTD e LTM usano bucket mensili per serie/endpoint */
function effectivePeriodType(gran){
  return (gran==='ytd' || gran==='ltm') ? 'mensile' : gran;
}
window.effectivePeriodType = effectivePeriodType;


/* === PATCH A (rev) — buckets/etichette rolling; niente ridefinizioni di isoWeekNum/effectivePeriodType/readUnifiedRange === */

// Usa SEMPRE la effectivePeriodType globale già definita
function buildBuckets(type, ref){
  var t = effectivePeriodType(type||'mensile');
  var now = ref ? new Date(ref) : new Date();
  var y = now.getUTCFullYear();
  var buckets = [];

  function push(s,e){ buckets.push({s:s.getTime(), e:e.getTime()}); }
  function toUTC(y,m,d){ return new Date(Date.UTC(y,m,d)); }
  function eodUTC(dt){ return new Date(dt.getTime() + 24*3600*1000 - 1); }
  function lastOfMonth(yy,mm){ return new Date(Date.UTC(yy,mm+1,0)); }

  if (t==='settimanale'){
    // 53 settimane rolling, allineate al lunedì ISO (UTC)
    var cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var day = (cur.getUTCDay()+6)%7;
    cur.setUTCDate(cur.getUTCDate()-day);
    for (var i=52;i>=0;i--){
      var start = new Date(cur); start.setUTCDate(cur.getUTCDate()-i*7);
      var end   = new Date(start); end.setUTCDate(start.getUTCDate()+6); end.setUTCHours(23,59,59,999);
      push(start,end);
    }
    return buckets;
  }

  if (t==='mensile'){
    // ultimi 24 mesi rolling
    var mRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (var k=23;k>=0;k--){
      var m = new Date(Date.UTC(mRef.getUTCFullYear(), mRef.getUTCMonth()-k, 1));
      push(m, eodUTC(lastOfMonth(m.getUTCFullYear(), m.getUTCMonth())));
    }
    return buckets;
  }

  if (t==='trimestrale'){
    // ultimi 12 trimestri rolling
    var baseQ = Math.floor(now.getUTCMonth()/3);
    for (var q=11;q>=0;q--){
      var qM = (baseQ - q);
      var yq = y + Math.floor(qM/4);
      var mq = ((qM%4)+4)%4;
      var start = toUTC(yq, mq*3, 1);
      var end   = eodUTC(new Date(Date.UTC(yq, mq*3+3, 0)));
      push(start,end);
    }
    return buckets;
  }

  if (t==='semestrale'){
    // ultimi 6 semestri rolling
    var baseS = (now.getUTCMonth()<6)?0:1;
    for (var sIdx=5;sIdx>=0;sIdx--){
      var si  = baseS - sIdx;
      var ys  = y + Math.floor(si/2);
      var hs  = ((si%2)+2)%2;
      var sm  = (hs===0)?0:6;
      var startS = toUTC(ys, sm, 1);
      var endS   = eodUTC(new Date(Date.UTC(ys, sm+6, 0)));
      push(startS, endS);
    }
    return buckets;
  }

  // annuale → ultimi 3 anni rolling
  for (var yy=2; yy>=0; yy--){
    var ya = y - yy;
    push(toUTC(ya,0,1), eodUTC(new Date(Date.UTC(ya,12,0))));
  }
  return buckets;
}

// Etichette coerenti con i buckets
function labelsForBuckets(type, buckets){
  var t = effectivePeriodType(type||'mensile');
  return (buckets||[]).map(function(B){
    var d = new Date(B.s);
    if (t==='settimanale')  return 'W'+isoWeekNum(d)+' '+d.getUTCFullYear();
    if (t==='mensile')      return String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
    if (t==='trimestrale')  return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear();
    if (t==='semestrale')   return (d.getUTCMonth()<6?'S1 ':'S2 ')+d.getUTCFullYear();
    return String(d.getUTCFullYear());
  });
}
/* === END PATCH A (rev) === */

// ===== DASHBOARD =====
function viewHome(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Dashboard';

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+
      '<div class="card">'+
        '<b>Filtro</b>'+
        '<div class="row" style="margin-top:6px;align-items:flex-end;gap:16px;flex-wrap:wrap">'+
          '<div>'+
            '<label>Modalità</label>'+
            '<select id="dash_mode" name="mode">'+
              '<option value="consuntivo">Consuntivo</option>'+
              '<option value="previsionale">Previsionale</option>'+
            '</select>'+
          '</div>'+
          '<div>'+
            '<label>Consulente</label>'+
            '<select id="dash_cons"><option value="">Tutti</option></select>'+
          '</div>'+
        '</div>'+
        unifiedFiltersHTML("dash")+
      '</div>'+

      '<div class="grid" id="kpiGrid">'+
        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>VSS</b><span id="kpi_vss" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_vss" width="320" height="90"></canvas>'+
        '</div>'+
'<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>VSD personale</b><span id="kpi_vsd" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_vsdpersonale" width="320" height="90"></canvas>'+
        '</div>'+
        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>VSD indiretto</b><span id="kpi_vsd_ind" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_vsdindiretto" width="320" height="90"></canvas>'+
        '</div>'+        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>GI</b><span id="kpi_gi" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_gi" width="320" height="90"></canvas>'+
        '</div>'+
        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>NNCF</b><span id="kpi_nncf" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_nncf" width="320" height="90"></canvas>'+
        '</div>'+
        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
            '<b>Tot Provvigioni</b><span id="kpi_provv" class="big">—</span>'+
          '</div>'+
          '<canvas id="d_mini_provv" width="320" height="90"></canvas>'+
        '</div>'+
      '</div>'+

      '<div class="card">'+
        '<b>Ultimi appuntamenti</b>'+
        '<div id="lastApps" class="row" style="margin-top:8px"></div>'+
      '</div>'+

      '<div class="card">'+
        '<b>Ultimi BP inviati</b>'+
        '<div id="lastBPs" class="row" style="margin-top:8px"></div>'+
      '</div>'+
    '</div>';

  renderTopbar();

  // ===== mini helpers base (riuso funzioni globali se presenti)
  function setText(id, text){ var el=document.getElementById(id); if(el) el.textContent = text; }
  function fmtEuro(n){ var v=Number(n)||0; return v.toLocaleString('it-IT')+'€'; }
  function fmtInt(n){ var v=Number(n)||0; return String(Math.round(v)); }
  function htmlEscape(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]); }

  // ===== Filtro consulenti (identico a Squadra)
  (function fillConsultants(){
    GET('/api/usernames').then(function(r){
      var users=(r&&r.users)||[];
      var sel=document.getElementById('dash_cons');
      if(!sel) return;
      sel.innerHTML = '<option value="">Tutti</option>'+users.map(function(u){
        return '<option value="'+htmlEscape(String(u.id))+'">'+htmlEscape(u.name||u.email||('User #'+u.id))+'</option>';
      }).join('');
    }).catch(function(){});
  })();

  // ===== label per bucket (come Squadra)
  function labelFor(d, type){
    if(type==='settimanale') return (window.isoWeekNum ? window.isoWeekNum(d) : Math.ceil(d.getDate()/7));
    if(type==='mensile' || type==='ytd' || type==='ltm') return (d.getMonth()+1);
    if(type==='trimestrale') return (Math.floor(d.getMonth()/3)+1);
    if(type==='semestrale')  return (d.getMonth()<6 ? 1 : 2);
    return d.getFullYear();
  }

  // ===== costruzione buckets (stesso approccio Squadra)
  function buildBucketsRangeDash(gran){
    if (typeof buildBuckets==='function'){
      return (buildBuckets(gran, new Date())||[]).map(function(b){ return { s:b.s, e:b.e }; });
    }
    // fallback rolling minimo
    var now=new Date(), out=[];
    function p(s,e){ out.push({s:s.getTime(), e:e.getTime()}); }
    function eod(d){ var x=new Date(d); x.setHours(23,59,59,999); return x; }
    function lastOfMonth(y,m){ return new Date(y,m+1,0,23,59,59,999); }
    var t=String(gran||'mensile').toLowerCase();
    if(t==='settimanale'){
      var cur=new Date(now); var day=(cur.getDay()+6)%7; cur.setDate(cur.getDate()-day); cur.setHours(0,0,0,0);
      for(var i=52;i>=0;i--){ var s=new Date(cur); s.setDate(s.getDate()-i*7); var e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); p(s,e); }
      return out;
    }
    if(t==='mensile' || t==='ytd' || t==='ltm'){
      if(t==='ytd'){
        for(var m=0;m<=now.getMonth();m++){ var s1=new Date(now.getFullYear(),m,1); p(s1, lastOfMonth(now.getFullYear(),m)); }
      }else{
        var span=(t==='ltm')?12:24, ref=new Date(now.getFullYear(), now.getMonth(),1);
        for(var k=span-1;k>=0;k--){ var s=new Date(ref.getFullYear(), ref.getMonth()-k, 1); p(s, lastOfMonth(s.getFullYear(), s.getMonth())); }
      }
      return out;
    }
    if(t==='trimestrale'){
      var baseQ=Math.floor(now.getMonth()/3)*3, refQ=new Date(now.getFullYear(), baseQ,1);
      for(var q=11;q>=0;q--){ var sQ=new Date(refQ.getFullYear(), refQ.getMonth()-q*3,1); p(sQ, eod(new Date(sQ.getFullYear(), sQ.getMonth()+3,0))); }
      return out;
    }
    if(t==='semestrale'){
      var baseS=(now.getMonth()<6?0:6), refS=new Date(now.getFullYear(), baseS,1);
      for(var s=5;s>=0;s--){ var sS=new Date(refS.getFullYear(), refS.getMonth()-s*6,1); p(sS, eod(new Date(sS.getFullYear(), sS.getMonth()+6,0))); }
      return out;
    }
    for(var a=2;a>=0;a--){ var ys=new Date(now.getFullYear()-a,0,1); p(ys, eod(new Date(ys.getFullYear(),12,0))); }
    return out;
  }

  // ===== serie locale identica a Squadra (cambiando solo il namespace 'dash')
  function canonIndicatorDash(val){
    switch(String(val)){
      case 'provv_gi':  return 'ProvvGI';
      case 'provv_vsd': return 'ProvvVSD';
      case 'tot_provv': return 'TotProvvigioni';
      default:          return val;
    }
  }
  function computeSeriesLocallyDash(indicator, mode, userId, range){
    var r = range || readUnifiedRange('dash');
    var tSel = String(r.type||'mensile').toLowerCase();
    var baseType = (tSel==='ytd' || tSel==='ltm') ? 'mensile' : tSel;
    var buckets = buildBucketsRangeDash(tSel);

    function within(b, p){
      var ps = new Date(p.startDate).getTime();
      var pe = new Date(p.endDate).getTime();
      return ps>=b.s && pe<=b.e;
    }
    function pick(bag, ind){
      if(!bag) return 0;
      if(ind==='VSDTotale') return Number(bag.VSDPersonale||0) + Number(bag.VSDIndiretto||0);
      if(ind==='ProvvGI')   return Number(bag.ProvvGI||0);
      if(ind==='ProvvVSD')  return Number(bag.ProvvVSD||0);
      if(ind==='TotProvvigioni'){
        var tot = bag.TotProvvigioni;
        return Number(tot!=null ? tot : (Number(bag.ProvvGI||0)+Number(bag.ProvvVSD||0)));
      }
      return Number(bag[ind]||0);
    }

    // uso periods locale come in Squadra quando /api/series non è disponibile
    return GET('/api/periods?global=1').catch(function(){ return GET('/api/periods'); }).then(function(resp){
      var periods = (resp && resp.periods) || [];

      var filtered = periods.filter(function(p){
        if (p.type !== baseType) return false;
        if (userId && String(p.userId||p.uid||'') !== String(userId)) return false;
        return true;
      });

      var IND = canonIndicatorDash(indicator);
      var points = buckets.map(function(b){
        var sum = 0;
        for (var i=0;i<filtered.length;i++){
          var p = filtered[i];
          if (!within(b, p)) continue;
          var bag = (mode==='previsionale' ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
          sum += pick(bag, IND);
        }
        return { x:new Date(b.s), y: Math.round(sum*100)/100 };
      });

      return points;
    });
  }

  // ===== disegno mini (usa drawFullLine se c'è)
  function drawLineGeneric(canvasId, labels, data){
    var el=document.getElementById(canvasId); if(!el) return;
    if(typeof window.drawFullLine==='function'){ window.drawFullLine(canvasId, labels, data); return; }
    var ctx=el.getContext('2d'); el.width=el.clientWidth||320; el.height=el.clientHeight||80;
    ctx.clearRect(0,0,el.width,el.height);
    var max=Math.max(1, ...data); var stepX=(data.length>1)? (el.width-8)/(data.length-1) : 0;
    ctx.strokeStyle='#2e6cff'; ctx.lineWidth=2; ctx.beginPath();
    for(var i=0;i<data.length;i++){
      var x=4+i*stepX, y=el.height-6-(data[i]/max)*(el.height-12);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  // ===== KPI aggregati (come Squadra: rispetto range from/to; filtro consulente)
function recomputeKPI(){
  var mode = (document.getElementById('dash_mode')||{}).value || 'consuntivo';
  var r    = readUnifiedRange('dash');

  // usa numeri (niente ISO / timezone)
  var f = new Date(r.start).getTime();
  var t = new Date(r.end).getTime();

  var cons = (document.getElementById('dash_cons')||{}).value || '';

  // helper robusti
  function asNum(v){ v = Number((v==null?'':v)); return isFinite(v)?v:0; }
  function pickVSDInd(bag){
    if(!bag) return 0;
    // tenta varie chiavi comuni
    var k = ['VSDIndiretto','vsdIndiretto','VSD_indiretto','VSDI'];
    for(var i=0;i<k.length;i++){
      if (bag[k[i]] != null) return asNum(bag[k[i]]);
    }
    // fallback: se ho il totale, ricavo indiretto = totale - personale
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

  return GET('/api/periods').then(function(j){
    var periods = (j && j.periods) || [];

    var TOT = { VSS:0, VSDPersonale:0, VSDIndiretto:0, GI:0, NNCF:0, PROVV:0 };

    for(var i=0;i<periods.length;i++){
      var p = periods[i];

      // rispetta il consulente
      if(cons && String(p.userId||p.uid||'') !== String(cons)) continue;

      // rispetta l’intervallo selezionato
      var ps = new Date(p.startDate).getTime();
      var pe = new Date(p.endDate).getTime();
      if (ps < f || pe > t) continue;

      // scegli prev/cons come nel resto della dashboard
      var bag = (mode==='previsionale' ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));

      TOT.VSS           += asNum(bag.VSS);
      TOT.VSDPersonale  += asNum(bag.VSDPersonale);
      TOT.VSDIndiretto  += pickVSDInd(bag);        // <-- robusto
      TOT.GI            += asNum(bag.GI);
      TOT.NNCF          += asNum(bag.NNCF);
      TOT.PROVV         += pickProvv(bag);
    }

    setText('kpi_vss',      fmtEuro(TOT.VSS));
    setText('kpi_vsd',      fmtEuro(TOT.VSDPersonale)); // VSD personale (rinominato)
    setText('kpi_vsd_ind',  fmtEuro(TOT.VSDIndiretto)); // <-- ora valorizzato correttamente
    setText('kpi_gi',       fmtEuro(TOT.GI));
    setText('kpi_nncf',     fmtInt(TOT.NNCF));
    setText('kpi_provv',    fmtEuro(TOT.PROVV));
  });
}

  // ===== Serie minichart (identiche a Squadra)
  function recomputeMini(){
    var mode = (document.getElementById('dash_mode')||{}).value || 'consuntivo';
    var cons = (document.getElementById('dash_cons')||{}).value || '';
    var range= readUnifiedRange('dash');
    var type = String(range.type||'mensile').toLowerCase();

    // Etichette estese in base ai buckets calcolati come in Squadra
    var bucketsDash = buildBucketsRangeDash(type);
    var labelsExt = (typeof labelsForBuckets==='function')
      ? labelsForBuckets(type, bucketsDash)
      : bucketsDash.map(function(b){ return labelFor(new Date(b.s), type); });

    function render(points, canvasId){
      var data = points.map(function(p){ return p.y; });
      drawLineGeneric(canvasId, labelsExt, data);
    }

    Promise.all([
      computeSeriesLocallyDash('VSS',            mode, cons||null, range),
      computeSeriesLocallyDash('VSDPersonale',   mode, cons||null, range),
      computeSeriesLocallyDash('VSDIndiretto',   mode, cons||null, range),
      computeSeriesLocallyDash('GI',             mode, cons||null, range),
      computeSeriesLocallyDash('NNCF',           mode, cons||null, range),
      computeSeriesLocallyDash('TotProvvigioni', mode, cons||null, range)
    ]).then(function(arr){
      render(arr[0], 'd_mini_vss');
      render(arr[1], 'd_mini_vsdpersonale');
      render(arr[2], 'd_mini_vsdindiretto');
      render(arr[3], 'd_mini_gi');
      render(arr[4], 'd_mini_nncf');
      render(arr[5], 'd_mini_provv');
    }).catch(function(err){
      logger.error(err);
    });
  }

// ===== liste “ultimi” (rispettano range + consulente)
// === SOSTITUISCI INTERAMENTE QUESTA FUNZIONE IN viewHome ===
// === SOSTITUISCI INTERAMENTE QUESTA FUNZIONE IN viewHome ===
function refreshLists(){
  var cons = (document.getElementById('dash_cons')||{}).value || '';

  // assicura la card "Prossimi appuntamenti" sopra "Ultimi appuntamenti"
  (function ensureNextAppsCard(){
    var lastAppsBox = document.getElementById('lastApps');
    if(!lastAppsBox) return;
    var lastCard = lastAppsBox.parentElement; // la card che contiene "Ultimi appuntamenti"
    if(!document.getElementById('nextApps')){
      var nextCard = document.createElement('div');
      nextCard.className = 'card';
      nextCard.innerHTML =
        '<b>Prossimi appuntamenti (oggi + domani)</b>'+
        '<div id="nextApps" style="margin-top:8px"></div>';
      lastCard.parentElement.insertBefore(nextCard, lastCard); // inserisci sopra
    }
  })();

  function grid3(inner){
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">'+inner+'</div>';
  }
function defDurByType(t){
  t = String(t||'').toLowerCase();
  if (t.indexOf('mezza')  > -1) return 240; // mezza giornata
  if (t.indexOf('giorn')  > -1) return 570; // giornata intera (9,5h)
  if (t.indexOf('vend')   > -1) return 90;  // vendita
  return 90;                                  // fallback
}



function cardAppt(x){
  // normalizza fine: se mancante/invalid o "prima" dell'inizio → start + durata predefinita
  var s = new Date(x.start);
  var e = new Date(x.end);
  if (!(e instanceof Date) || isNaN(e) || e < s){
    e = new Date(s.getTime() + defDurByType(x.type||'vendita') * 60000);
  }

  var when   = dmy(s)+' '+timeHM(s)+'–'+(('0'+e.getHours()).slice(-2)+':'+('0'+e.getMinutes()).slice(-2));
  var nncfTxt = x.nncf ? ' · NNCF ✅' : '';
  return ''+
    '<div class="card lastApp" data-aid="'+htmlEscape(String(x.id||''))+'" style="cursor:pointer">'+
      '<div class="small muted">'+htmlEscape(when)+' · '+htmlEscape(x.type||'manuale')+'</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'+
        '<div><b>'+htmlEscape(x.client||'')+'</b></div>'+
        '<div class="row" style="gap:6px">'+
          '<button class="ghost btn-ics" title="Esporta .ics" data-ics="'+htmlEscape(String(x.id||''))+'">📅</button>'+
        '</div>'+
      '</div>'+
      '<div class="small">VSS '+fmtEuro(x.vss||0)+' · VSD '+fmtEuro(x.vsdPersonal||0)+nncfTxt+'</div>'+
    '</div>';
}



  function hasCons(bag){ return bag && Object.keys(bag).length>0; }
  function safeN(n){ n = Number(n||0); return isFinite(n)?n:0; }

  Promise.all([ GET('/api/appointments'), GET('/api/periods') ]).then(function(arr){
    var apps = (arr[0] && arr[0].appointments) || [];
    var pers = (arr[1] && arr[1].periods)      || [];

    // ===== PROSSIMI APPUNTAMENTI (oggi + domani) =====
    (function renderNext(){
      var host = document.getElementById('nextApps'); if(!host) return;
      var now = new Date();
      var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
      var endTomorrow= new Date(now.getFullYear(), now.getMonth(), now.getDate()+2, 0,0,0,0); // esclusivo
      var list = apps.filter(function(a){
        var st = new Date(a.start).getTime();
        var ok = (st >= startToday.getTime() && st < endTomorrow.getTime());
        var okUser = cons ? (String(a.userId||a.uid||'')===String(cons)) : true;
        return ok && okUser;
      }).sort(function(a,b){ return new Date(a.start)-new Date(b.start); });

      host.innerHTML = list.length ? grid3(list.map(cardAppt).join(''))
                                   : '<div class="muted">Nessun appuntamento tra oggi e domani</div>';

      // click → apri in modifica
      host.querySelectorAll('.lastApp[data-aid]').forEach(function(card){
        card.addEventListener('click', function(){
          try{ save('bp_edit_aid', card.getAttribute('data-aid')); }catch(_){}
          viewAppointments();
        });
      });
      // export .ics
      host.querySelectorAll('button[data-ics]').forEach(function(bt){
        bt.addEventListener('click', function(ev){
          ev.stopPropagation();
          var id = bt.getAttribute('data-ics');
          var a  = list.find(z=>String(z.id)===String(id)) || apps.find(z=>String(z.id)===String(id));
          if(!a) { toast('Appuntamento non trovato'); return; }
          if (window.BP && BP.ICS && typeof BP.ICS.downloadIcsForAppointment==='function'){
            const ok = BP.ICS.downloadIcsForAppointment(a);
            if (ok) {
              if (typeof haptic==='function') haptic('medium');
              try{ document.dispatchEvent(new Event('ics:exported')); }catch(_){ }
              toast('.ics esportato');
            } else {
              toast('Export .ics non disponibile');
            }
          } else {
            toast('Export .ics non disponibile');
          }
        });
      });
    })();

    // ===== ULTIMI APPUNTAMENTI (ultimi 6, 2 righe × 3) =====
    (function renderLast(){
      var host = document.getElementById('lastApps'); if(!host) return;
      var list = apps.filter(function(a){
        return cons ? (String(a.userId||a.uid||'')===String(cons)) : true;
      }).sort(function(a,b){ return new Date(b.start)-new Date(a.start); }).slice(0,6);

      host.innerHTML = list.length ? grid3(list.map(cardAppt).join(''))
                                   : '<div class="muted">Nessun appuntamento</div>';

      // click → apri in modifica
      host.querySelectorAll('.lastApp[data-aid]').forEach(function(card){
        card.addEventListener('click', function(){
          try{ save('bp_edit_aid', card.getAttribute('data-aid')); }catch(_){}
          viewAppointments();
        });
      });
      // export .ics
      host.querySelectorAll('button[data-ics]').forEach(function(bt){
        bt.addEventListener('click', function(ev){
          ev.stopPropagation();
          var id = bt.getAttribute('data-ics');
          var a  = list.find(z=>String(z.id)===String(id)) || apps.find(z=>String(z.id)===String(id));
          if(!a) { toast('Appuntamento non trovato'); return; }
          if (window.BP && BP.ICS && typeof BP.ICS.downloadIcsForAppointment==='function'){
            const ok = BP.ICS.downloadIcsForAppointment(a);
            if (ok) {
              if (typeof haptic==='function') haptic('medium');
              try{ document.dispatchEvent(new Event('ics:exported')); }catch(_){ }
              toast('.ics esportato');
            } else {
              toast('Export .ics non disponibile');
            }
          } else {
            toast('Export .ics non disponibile');
          }
        });
      });
    })();

    // ===== ULTIMI BP INVIATI → ultimi 3 (con stato + indicatori) =====
    (function renderLastBPs(){
      var lastBPsEl = document.getElementById('lastBPs'); if(!lastBPsEl) return;
      var pFiltered = pers.filter(function(p){
        if(cons && String(p.userId||p.uid||'') !== String(cons)) return false;
        return true;
      }).sort(function(a,b){ return new Date(b.endDate)-new Date(a.endDate); }).slice(0,3);

      var htmlP = pFiltered.map(function(p){
        var lab  = formatPeriodLabel(p.type, p.startDate);
        var prev = p.indicatorsPrev||{};
        var consBag = p.indicatorsCons||{};
        var isCons = hasCons(consBag);
        var bag = isCons ? consBag : prev;

        var vss  = safeN(bag.VSS);
        var vsdP = safeN(bag.VSDPersonale);
        var vsdI = safeN(bag.VSDIndiretto);
        var gi   = safeN(bag.GI);
        var nncf = safeN(bag.NNCF);
        var vsdT = vsdP + vsdI;

        return ''+
          '<div class="card lastBP" data-pid="'+htmlEscape(String(p.id||''))+'" style="cursor:pointer;flex:1 1 320px">'+
            '<div style="display:flex;align-items:center;gap:8px">'+
              '<div><b>'+htmlEscape(lab)+'</b></div>'+
              '<span class="chip small">'+(isCons?'Consuntivo':'Previsionale')+'</span>'+
            '</div>'+
            '<div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap">'+
              '<span class="chip small">VSS <b>'+fmtEuro(vss)+'</b></span>'+
              '<span class="chip small">VSD <b>'+fmtEuro(vsdT)+'</b> <span class="muted">(P '+fmtEuro(vsdP)+' · I '+fmtEuro(vsdI)+')</span></span>'+
              '<span class="chip small">GI <b>'+fmtEuro(gi)+'</b></span>'+
              '<span class="chip small">NNCF <b>'+fmtInt(nncf)+'</b></span>'+
            '</div>'+
          '</div>';
      }).join('');

      // layout responsive
      lastBPsEl.innerHTML = htmlP
        ? grid3(htmlP)
        : '<div class="muted">Nessun BP</div>';

      lastBPsEl.querySelectorAll('.lastBP[data-pid]').forEach(function(card){
        card.addEventListener('click', function(){
          try{ save('bp_open_period', { id: card.getAttribute('data-pid'), mode: false }); }catch(_){}
          viewPeriods();
        });
      });
    })();

  }).catch(function(err){ logger.error(err); });
}

  // ===== bind identici a Squadra
  bindUnifiedFilters('dash', function(){
    if (typeof haptic==='function') haptic('light');
    recomputeKPI();    // KPIs rispettano from/to
    recomputeMini();   // minichart rolling per granularità
    refreshLists();
  });
  var selMode = document.getElementById('dash_mode');
  if (selMode) selMode.onchange = function(){
    if (typeof haptic==='function') haptic('light');
    recomputeKPI();
    recomputeMini();
    refreshLists();
  };
  var selCons = document.getElementById('dash_cons');
  if (selCons) selCons.onchange = function(){
    if (typeof haptic==='function') haptic('light');
    recomputeKPI();
    recomputeMini();
    refreshLists();
  };

  // first run
  recomputeKPI();
  recomputeMini();
  refreshLists();

  if (typeof kickFinal === 'function') kickFinal('dashboard');
}

// ===== CALENDARIO =====
function viewCalendar(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Calendario';

  // Orari in locale coerenti con dashboard/appuntamenti
  // Usa il formatter condiviso `timeHM` (gestisce correttamente ISO/UTC → locale)
  function timeHMlocal(s){
    return timeHM(s);
  }

  // CSS del calendario (iniettato una sola volta)
  if(!document.getElementById('cal_dynamic_css')){
    var css = `
      /* ============== CALENDAR ============== */
      #cal_container{ overflow-x:auto; -webkit-overflow-scrolling:touch; }
      #cal_container .calendar{ min-width: 860px; }

      .calendar{ display:grid; grid-template-columns: 44px repeat(7, 1fr); gap:10px; }
      .calendar .weekLabel{ color:var(--muted); font-size:12px; display:flex; align-items:center; justify-content:center; }

      .calendar .day{
        min-height:120px; background: var(--card);
        border:2px solid var(--hair2); border-radius:14px; padding:8px;
        display:flex; flex-direction:column; gap:3px; overflow:hidden;
      }
      .calendar .day.today{
        outline: 2px solid var(--accent);
        box-shadow: 0 0 0 2px rgba(0,0,0,.06) inset;
      }
      .calendar .day .dnum{ font-weight:800; }
      .calendar .day .small{
        font-size:12px; line-height:1.15;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;
      }
      .calendar .day .tag{ padding:2px 6px; border-radius:999px; border:1px solid var(--hair2); font-size:11px; align-self:flex-start; }
      .calendar .day.busy0{ border-color:#27ae60; background:rgba(39,174,96,.08); }
      .calendar .day.busy1{ border-color:#ff9f1a; background:rgba(255,159,26,.10); }
      .calendar .day.busy2{ border-color:#7d1731; background:rgba(125,23,49,.12); }
      .calendar .day.dense .small{ font-size:11px; line-height:1.1; }
      .calendar .day.dense .tag{ transform:scale(.9); transform-origin:left top; }

      @media (max-width: 900px){
        .calendar{ grid-template-columns: 36px repeat(7, 1fr); }
        .calendar .weekLabel{ display:flex !important; font-size:11px; }
        .calendar .day{ min-height:92px; padding:6px; }
        .calendar .day .dnum{ font-size:16px; }
        .calendar .day .small{ white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
        .calendar .day.dense .small{ font-size:clamp(9px,2.4vw,11px); }
        .calendar .day .tag{ font-size:10px; }
      }

      .cal-filters .chip{
        display:inline-flex; align-items:center; gap:6px;
        padding:6px 10px; border-radius:999px; border:1px solid var(--hair2);
      }
    `;
    var st = document.createElement('style');
    st.id = 'cal_dynamic_css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var now = new Date();
  var ymSel = ymd(startOfMonth(now)).slice(0,7);

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+
      '<div class="card">'+
        '<div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">'+
          '<div class="row" style="align-items:flex-end;gap:8px">'+
            '<button id="cal_prev" class="ghost" title="Mese precedente">◀</button>'+
            '<div><label>Mese</label><input type="month" id="cal_month" value="'+ymSel+'"></div>'+
            '<button id="cal_next" class="ghost" title="Mese successivo">▶</button>'+
          '</div>'+
          '<div class="cal-filters">'+
            '<label class="chip small"><input type="checkbox" id="only_free"> Solo giorni liberi</label> '+
            '<label class="chip small"><input type="checkbox" id="only_4h"> Solo slot ≥ 4h</label>'+
          '</div>'+
          '<button id="cal_add" class="ghost">Aggiungi appuntamento</button>'+
          '<div class="right" style="margin-left:auto"><button id="cal_refresh" class="ghost">Aggiorna</button></div>'+
        '</div>'+
      '</div>'+
      '<div id="cal_container"></div>'+

      // <<< Riquadro RISULTATI (nuovo, sotto calendario, prima di day-box e slots)
      '<div id="cal_results" class="card" style="margin-top:8px;display:none"></div>'+

      '<div id="cal_day_box" class="card" style="margin-top:8px;display:none"></div>'+
      '<div class="card" id="cal_free_slots" style="margin-top:8px;display:none"></div>'+
    '</div>';
  renderTopbar();

  function renderMonth(y, m, filters){
    Promise.all([
      GET('/api/appointments'),
      GET('/api/availability?from='+y+'-'+pad2(m)+'-01&to='+y+'-'+pad2(m)+'-'+pad2(new Date(y,m,0).getDate()))
    ])
    .then(function(arr){
      var apps  = (arr[0] && arr[0].appointments) ? arr[0].appointments : [];
      var avAll = arr[1]||{slots:[],summary:{total:0,mondays:0,others:0}};
      var slots = avAll.slots||[];

      var from = new Date(y, m-1, 1);
      var to   = new Date(y, m, 0, 23,59,59,999);

      // --- util risultati ---
      function sumInRange(s, e){
        var out = {vss:0, vsd:0, nncf:0, count:0};
        for(var i=0;i<apps.length;i++){
          var a = apps[i];
          var t = new Date(a.start);
          if(t>=s && t<=e){
            out.vss   += Number(a.vss||0);
            out.vsd   += Number(a.vsdPersonal||0);
            out.nncf  += (a.nncf?1:0);
            out.count += 1;
          }
        }
        return out;
      }
      function showResultsBox(tot, label, weekly){
        var host = document.getElementById('cal_results'); if(!host) return;
        var right = weekly ? '<div class="right"><button id="res_reset" class="ghost">Torna al mese</button></div>' : '';
        host.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center">'+
            '<b>Risultati · '+label+'</b>'+ right +
          '</div>'+
          '<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">'+
            '<span class="chip small">VSS <b>'+fmtEuro(tot.vss)+'</b></span>'+
            '<span class="chip small">VSD <b>'+fmtEuro(tot.vsd)+'</b></span>'+
            '<span class="chip small">NNCF <b>'+fmtInt(tot.nncf)+'</b></span>'+
            '<span class="chip small">N. app <b>'+fmtInt(tot.count)+'</b></span>'+
          '</div>';
        host.style.display='block';
        if(weekly){
          var btn=document.getElementById('res_reset');
          if(btn) btn.onclick=function(){ showResultsBox(sumInRange(from,to), monthLabel, false); };
        }
      }

      // indicizza per giorno (solo mese corrente, per rendering celle)
      var map = {};
      for(var i=0;i<apps.length;i++){
        var a=apps[i]; var s=new Date(a.start);
        if(s<from || s>to) continue;
        var key = ymd(s);
        if(!map[key]) map[key]={vss:0,vsd:0,nncf:0,mins:0,count:0,items:[]};
        map[key].vss += Number(a.vss||0);
        map[key].vsd += Number(a.vsdPersonal||0);
        map[key].nncf += (a.nncf?1:0);
        map[key].mins += Number(a.durationMinutes||0);
        map[key].count += 1;
        map[key].items.push(a);
      }

      var dayNames=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
      var monthLabel = new Date(y, m-1, 1).toLocaleString('it-IT',{month:'long', year:'numeric'});
      var grid = '<div class="card"><b class="neon">'+monthLabel+'</b></div>';

      grid += '<div class="calendar">';
      grid += '<div class="weekLabel">W</div>';
      for(var dn=0;dn<7;dn++){ grid+='<div class="weekLabel">'+dayNames[dn]+'</div>'; }

      var firstDate = new Date(y, m-1, 1);
      var firstDow = (firstDate.getDay()+6)%7;  // lun=0
      var d = new Date(firstDate); d.setDate(firstDate.getDate()-firstDow);

      for(var wk=0; wk<6; wk++){
        // etichetta settimana cliccabile con data (lunedì) della riga
        var weekStart = new Date(d);
        var wLabel = 'W'+isoWeekNum(weekStart);
        grid += '<div class="weekLabel" data-ws="'+ymd(weekStart)+'" style="cursor:pointer">'+wLabel+'</div>';

        for(var k=0;k<7;k++){
          var inMonth = (d.getMonth()===(m-1));
          var key = ymd(d);
          var v = map[key]||{vss:0,vsd:0,nncf:0,mins:0,count:0,items:[]};
          var dow = d.getDay(); // 0=Dom .. 6=Sab
          var isWeekend = (dow===0 || dow===6);
          var hasSlot4h = !isWeekend && (slots.some(function(s){ return s.date===key; }));

          // Filtri
          if(inMonth && filters){
            if(filters.only_free && v.count>0){ grid+='<div></div>'; d.setDate(d.getDate()+1); continue; }
            if(filters.only_4h && !hasSlot4h){ grid+='<div></div>'; d.setDate(d.getDate()+1); continue; }
          }

          if(!inMonth){ grid += '<div></div>'; }
          else{
            // colore stato
            var cls = '';
            if(!isWeekend){
              if(v.count===0) cls='busy0';
              else if(hasSlot4h) cls='busy1';
              else cls='busy2';
            } else {
              if(v.count>0) cls='busy2';
            }

            // righe
            var lines = '';
            var nLines = 0;
            if(!(isWeekend && v.count===0)){
              if(v.vss>0){  lines += '<div class="small">VSS '+fmtEuro(v.vss)+'</div>'; nLines++; }
              if(v.vsd>0){  lines += '<div class="small">VSD '+fmtEuro(v.vsd)+'</div>'; nLines++; }
              if(v.nncf>0){ lines += '<div class="small">NNCF '+fmtInt(v.nncf)+'</div>'; nLines++; }
              if(v.count>0){lines += '<div class="small">App. '+fmtInt(v.count)+'</div>'; nLines++; }
              if(hasSlot4h){ lines += '<div class="tag" style="margin-top:4px">slot ≥4h</div>'; nLines++; }
            }

            var extra = (nLines>=3 ? ' dense' : '');
            var slotCls = hasSlot4h ? ' slot-free' : '';
            grid += ''+
              '<div class="day '+cls+extra+slotCls+'" data-day="'+key+'" title="Settimana '+isoWeekNum(d)+'">'+
                '<div class="dnum">'+d.getDate()+'</div>'+
                (lines||'')+
              '</div>';
          }
          d.setDate(d.getDate()+1);
        }
      }
      grid += '</div>';
      document.getElementById('cal_container').innerHTML = grid;

      // RISULTATI iniziali (mese)
      showResultsBox(sumInRange(from,to), monthLabel, false);

      // click etichetta settimana → risultati settimana (lun–dom)
      document.querySelectorAll('.calendar .weekLabel[data-ws]').forEach(function(wl){
        wl.addEventListener('click', function(){
          var wsStr = wl.getAttribute('data-ws');
          var ws = new Date(wsStr);
          var we = new Date(ws); we.setDate(we.getDate()+6);
          we.setHours(23,59,59,999);
          var lab = 'Settimana '+('W'+isoWeekNum(ws))+' · '+dmy(ws)+'–'+dmy(we);
          showResultsBox(sumInRange(ws,we), lab, true);
        });
      });

      // click giorno → elenco appuntamenti (orari in LOCALE)
      document.querySelectorAll('.day[data-day]').forEach(function(el){
        el.addEventListener('click', function(){
          var dateStr = el.getAttribute('data-day');
          var items = (map[dateStr] && map[dateStr].items) ? map[dateStr].items.slice() : [];
          items.sort(function(a,b){ return new Date(a.start)-new Date(b.start); });
          var box = document.getElementById('cal_day_box');
          var h='<b>Appuntamenti del '+dateStr.split('-').reverse().join('/')+'</b>';
          if(!items.length){ h += '<div class="muted" style="margin-top:6px">Nessun appuntamento</div>'; }
          else{
            h += '<div class="row" style="margin-top:8px">';
            for(var i=0;i<items.length;i++){
              var x=items[i];
              var ds=' data-start="'+x.start+'" data-end="'+x.end+'" data-title="'+htmlEscape(x.client||'Appuntamento')+'" ';
              h += '<div class="card cal-app" data-aid="'+x.id+'" '+ds+' style="flex:1 1 320px;cursor:pointer">'+
                     '<div class="small muted">'+timeHMlocal(x.start)+'–'+timeHMlocal(x.end)+' · '+htmlEscape(x.type||'')+'</div>'+
                     '<div><b>'+htmlEscape(x.client||'')+'</b></div>'+
                     '<div class="small">VSS '+fmtEuro(x.vss)+' · VSD '+fmtEuro(x.vsdPersonal)+' · NNCF '+(x.nncf?'✅':'—')+'</div>'+
                     (x.notes?('<div class="small muted">'+htmlEscape(x.notes)+'</div>'):'')+
                   '</div>';
            }
            h+='</div>';
          }
          var daySlots = (slots||[]).filter(function(s){ return s.date===dateStr; });
          if(daySlots.length){
            h += '<div class="row" style="margin-top:8px">';
            for(var si=0; si<daySlots.length; si++){
              var s = daySlots[si];
              var partTxt = (s.part==='morning'?'mattina':'pomeriggio');
              h += '<div class="card slotBtn" data-start="'+s.start+'" data-end="'+s.end+'" style="flex:1 1 280px;cursor:pointer">'+
                    '<div class="small">'+partTxt+' · '+timeHMlocal(s.start)+'–'+timeHMlocal(s.end)+'</div>'+
                    '</div>';
            }
            h += '</div>';
          }

          box.style.display='block'; box.innerHTML = h;

          box.querySelectorAll('.cal-app').forEach(function(c){
            c.addEventListener('click', function(ev){
              ev.stopPropagation();
              save('bp_edit_aid', c.getAttribute('data-aid'));
              viewAppointments();
            });
          });

          box.querySelectorAll('.slotBtn').forEach(function(el){
            el.addEventListener('click', function(ev){
              ev.stopPropagation();
              save('bp_prefill_slot', {start:el.getAttribute('data-start'), end:el.getAttribute('data-end')});
              viewAppointments(); toast('Slot precompilato negli appuntamenti');
            });
          });

          window.scrollTo({top: box.getBoundingClientRect().top + window.scrollY - 80, behavior:'smooth'});
          if (typeof window.wireICSInsideDayBox === 'function') { try{ window.wireICSInsideDayBox(); }catch(_){ } }
        });
      });

      // slots liberi (SOLO >= oggi). Se 0 → mostra box esplicito.
      var box2 = document.getElementById('cal_free_slots');
      var todayKeyStr = (function(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());})();
      var futureSlots = (slots||[]).filter(function(s){ return String(s.date||'').slice(0,10) >= todayKeyStr; });

      if(futureSlots.length){
        var h2 = '<b>Slot liberi ≥ 4h (da oggi in poi)</b> · <span class="badge">Tot: '+futureSlots.length+'</span>';
        h2 += '<div class="row" style="margin-top:8px">';
        for(var sidx=0; sidx<futureSlots.length && sidx<80; sidx++){
          var s = futureSlots[sidx];
          var partTxt = (s.part==='morning'?'mattina':'pomeriggio');
          h2 += '<div class="card slotBtn" data-start="'+s.start+'" data-end="'+s.end+'" style="flex:1 1 280px;cursor:pointer">'+
                '<div class="small"><b>'+dmy(s.start)+'</b> · '+partTxt+'</div>'+
                '<div class="small">'+timeHMlocal(s.start)+'–'+timeHMlocal(s.end)+'</div>'+
               '</div>';
        }
        h2 += '</div>';
        box2.style.display='block'; box2.innerHTML = h2;
        box2.querySelectorAll('.slotBtn').forEach(function(el){
          el.addEventListener('click', function(){
            save('bp_prefill_slot', {start:el.getAttribute('data-start'), end:el.getAttribute('data-end')});
            viewAppointments(); toast('Slot precompilato negli appuntamenti');
          });
        });
      } else {
        box2.style.display='block';
        box2.innerHTML = '<b>Slot liberi ≥ 4h (da oggi in poi)</b> · <span class="badge">Tot: 0</span>'+
                         '<div class="muted" style="margin-top:6px">Nessuno slot libero disponibile.</div>';
      }

      // Evidenzia "OGGI" + clamp slot passato (hook da final-hooks.js se presenti)
      try{ if (window.injectTodayCSS) window.injectTodayCSS(); }catch(_){}
      try{
        if (window.hookCalendar) window.hookCalendar();
        else { if (window.markToday) window.markToday(); if (window.clampSlotCounters) window.clampSlotCounters(); }
      }catch(_){}
    }).catch(function(err){ logger.error(err); toast('Errore calendario'); });
  }

  function doRender(){
    var mval = document.getElementById('cal_month').value;
    var y = parseInt(mval.split('-')[0],10);
    var m = parseInt(mval.split('-')[1],10);
    var filters = { only_free: document.getElementById('only_free').checked, only_4h: document.getElementById('only_4h').checked };
    renderMonth(y, m, filters);
  }
  document.getElementById('cal_refresh').onclick = doRender;
  var btnAdd = document.getElementById('cal_add');
  if(btnAdd) btnAdd.onclick = function(){ viewAppointments(); };
  document.getElementById('cal_month').onchange = doRender;

  // bottoni prev/next mese
  function shiftMonth(delta){
    var el = document.getElementById('cal_month'); if(!el) return;
    var parts = el.value.split('-'); var y = +parts[0]; var m = +parts[1];
    m += delta;
    if (m<=0){ m=12; y--; } else if (m>12){ m=1; y++; }
    el.value = y + '-' + pad2(m);
    doRender();
  }
  var btnPrev = document.getElementById('cal_prev');
  var btnNext = document.getElementById('cal_next');
  if(btnPrev) btnPrev.onclick = function(){ shiftMonth(-1); };
  if(btnNext) btnNext.onclick = function(){ shiftMonth(+1); };

  document.getElementById('only_free').onchange = doRender;
  document.getElementById('only_4h').onchange = doRender;

  doRender();
}
// ===== FINE CALENDARIO =====



// ===== PERIODI (BP) =====
function viewPeriods(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – BP';

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+

      // — SUGGERITI / DA INVIARE —
      '<div class="card"><b>Da inviare</b><div id="bp_to_send" class="grid" style="margin-top:8px"></div></div>'+

      // — BP INVIATI (periodi in essere) COLLASSABILE —
      '<div class="card" id="bp_sent_box" style="margin-top:8px">'+
        '<div id="bp_sent_head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">'+
          '<b>BP inviati (periodi in essere)</b><span id="bp_sent_chev" class="chev">▸</span>'+
        '</div>'+
        '<div id="bp_sent" class="row" style="margin-top:8px;display:none"></div>'+
      '</div>'+

      // — FORM CREA / AGGIORNA —
      '<div class="card" style="margin-top:8px">'+
        '<b>Crea/Aggiorna BP</b>'+
        '<div class="row" style="margin-top:8px">'+
          '<div><label>Tipo</label><select id="p_type">'+
            '<option value="settimanale">Settimanale (lun–dom)</option>'+
            '<option value="mensile">Mensile</option>'+
            '<option value="trimestrale">Trimestrale</option>'+
            '<option value="semestrale">Semestrale</option>'+
            '<option value="annuale">Annuale</option>'+
          '</select></div>'+

          '<div id="wrap_week" style="display:none"><label>Settimana ISO (1–53)</label><input type="number" id="p_week" min="1" max="53" value="'+isoWeekNum(new Date())+'"></div>'+
          '<div id="wrap_month" style="display:none"><label>Mese</label><select id="p_month">'+
            '<option value="1">Gennaio</option><option value="2">Febbraio</option><option value="3">Marzo</option>'+
            '<option value="4">Aprile</option><option value="5">Maggio</option><option value="6">Giugno</option>'+
            '<option value="7">Luglio</option><option value="8">Agosto</option><option value="9">Settembre</option>'+
            '<option value="10">Ottobre</option><option value="11">Novembre</option><option value="12">Dicembre</option>'+
          '</select></div>'+
          '<div id="wrap_quarter" style="display:none"><label>Trimestre</label><select id="p_quarter"><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option></select></div>'+
          '<div id="wrap_semester" style="display:none"><label>Semestre</label><select id="p_sem"><option value="1">1° semestre</option><option value="2">2° semestre</option></select></div>'+
          '<div><label>Anno</label><input type="number" id="p_year" min="2000" max="2100" value="'+(new Date().getFullYear())+'"></div>'+
        '</div>'+

        '<div class="row"><div class="small muted">Modalità: <b id="p_mode_lbl">Previsionale</b> · <button class="ghost" id="btnImport" style="padding:4px 8px">Importa da agenda</button></div></div>'+
        '<div class="row" style="align-items:center"><div class="small"><b>Periodo selezionato:</b> <span id="p_label" class="neon">—</span></div><input type="hidden" id="p_start"><input type="hidden" id="p_end"></div>'+

        '<div class="row small" style="margin-top:6px;opacity:.9"><div><b>Previsionale</b></div><div><b>Consuntivo</b></div><div><b>Avanzamento</b></div></div>'+
        '<div class="row" id="p_rows" style="margin-top:4px"></div>'+

        '<div class="row" style="margin-top:8px;align-items:center;gap:8px;justify-content:space-between">'+
          '<div id="p_delete_zone"></div>'+
          '<div class="right"><button id="btnSaveP">Salva BP</button></div>'+
        '</div>'+
      '</div>'+

      // — ELENCO COMPLETO BP —
      '<div class="card"><b>BP salvati</b><div id="p_list" class="row" style="margin-top:8px"></div></div>'+
    '</div>';
  renderTopbar();

  // === stato/variabili ===
  var CONS_MODE=false, EDIT_PID=null, IND=[], CURRENT_P=null;
  var ME = getUser() || {};

  // === utils ===
  function htmlEscape(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]);}
  function ymd(d){if(!d)return'';var x=new Date(d);return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2);}
  function dmy(d){var x=new Date(d);return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2)+'/'+x.getFullYear();}
  function fmtEuro(n){var v=Number(n)||0;return v.toLocaleString('it-IT')+'€';}
  function domFromHTML(h){var t=document.createElement('div');t.innerHTML=h.trim();return t.firstChild;}
  function hasCons(p){ return !!(p && p.indicatorsCons && Object.keys(p.indicatorsCons).length>0); }

  // === grade (senza /api/me) ===
  function ensureGrade(){
    if (ME && ME.grade) return Promise.resolve(ME);
    return GET('/api/usernames').then(function(r){
      var youId = String((getUser()||{}).id || '');
      var you   = ((r && r.users) || []).find(function(u){ return String(u.id)===youId; });
      if (you && you.grade) ME.grade = you.grade;
      return ME;
    }).catch(function(){ return ME; });
  }
  function getGrade(){ var g=(ME&&ME.grade)||((getUser()||{}).grade); return (g==='senior')?'senior':'junior'; }
  ensureGrade();

  // === refs UI ===
  var typeSel=document.getElementById('p_type'), yearInp=document.getElementById('p_year'),
      weekWrap=document.getElementById('wrap_week'), monthWrap=document.getElementById('wrap_month'),
      quarterWrap=document.getElementById('wrap_quarter'), semWrap=document.getElementById('wrap_semester'),
      weekInp=document.getElementById('p_week'), monthSel=document.getElementById('p_month'), quarterSel=document.getElementById('p_quarter'), semSel=document.getElementById('p_sem'),
      lbl=document.getElementById('p_label'), startH=document.getElementById('p_start'), endH=document.getElementById('p_end'),
      modeLbl=document.getElementById('p_mode_lbl'), btnImport=document.getElementById('btnImport');

  // === modalità form ===
  function setFormMode(cons){
    CONS_MODE=!!cons;
    modeLbl.textContent = CONS_MODE?'Consuntivo':'Previsionale';
    btnImport.style.display = CONS_MODE?'none':'';
    var rows=document.querySelectorAll('[data-row]');
    rows.forEach(function(r){
      var p=r.querySelector('[data-prev]'), c=r.querySelector('[data-cons]'), bar=r.querySelector('[data-bar]');
      if(CONS_MODE){
        if(p){ p.removeAttribute('hidden'); var inp=p.querySelector('input'); if(inp){inp.setAttribute('readonly','readonly'); inp.classList.add('disabled');} }
        if(c){ c.removeAttribute('hidden'); var ic=c.querySelector('input'); if(ic){ic.removeAttribute('readonly'); ic.classList.remove('disabled');} }
        if(bar){ bar.removeAttribute('hidden'); }
      }else{
        if(p){ p.removeAttribute('hidden'); var inp2=p.querySelector('input'); if(inp2){inp2.removeAttribute('readonly'); inp2.classList.remove('disabled');} }
        if(c){ c.setAttribute('hidden','hidden'); }
        if(bar){ bar.setAttribute('hidden','hidden'); }
      }
    });
    renderDeleteZone();
  }

  function showControlsForType(){
    var t=typeSel.value;
    weekWrap.style.display=(t==='settimanale')?'':'none';
    monthWrap.style.display=(t==='mensile')?'':'none';
    quarterWrap.style.display=(t==='trimestrale')?'':'none';
    semWrap.style.display=(t==='semestrale')?'':'none';
    computeBoundsAndPreview();
  }

  function computeBoundsAndPreview(){
    var t=typeSel.value, y=parseInt(yearInp.value,10), s,e,text;
    if(t==='settimanale'){var w=Math.max(1,Math.min(53,parseInt(weekInp.value||'1',10)));var b=weekBoundsOf(y,w);s=b.start;e=b.end;text='Sett. '+w+' · '+dmy(s)+' → '+dmy(e);}
    else if(t==='mensile'){var m=parseInt(monthSel.value,10);s=new Date(y,m-1,1);e=new Date(y,m,0);text=s.toLocaleString('it-IT',{month:'long',year:'numeric'})+' · '+dmy(s)+' → '+dmy(e);}
    else if(t==='trimestrale'){var q=parseInt(quarterSel.value,10);s=new Date(y,(q-1)*3,1);e=new Date(y,q*3,0);text='Trimestre '+q+' '+y+' · '+dmy(s)+' → '+dmy(e);}
    else if(t==='semestrale'){var sm=parseInt(semSel.value,10);s=new Date(y,sm===1?0:6,1);e=new Date(y,sm===1?6:12,0);text=(sm===1?'1°':'2°')+' semestre '+y+' · '+dmy(s)+' → '+dmy(e);}
    else {s=new Date(y,0,1);e=new Date(y,11,31);text='Anno '+y+' · '+dmy(s)+' → '+dmy(e);}
    startH.value=ymd(s); endH.value=ymd(e); lbl.textContent=text;
    setFormMode(false); EDIT_PID=null; CURRENT_P=null; clearCons(); renderDeleteZone();
  }

  // === righe indicatori ===
  function buildRows(ind){
    var rows='';
    for(var i=0;i<ind.length;i++){
      var k=ind[i], money=/^(VSS|VSDPersonale|VSDIndiretto|GI)$/i.test(k);
      rows+= '<div class="row" data-row="'+k+'">'+
               '<div data-prev><label>'+k+' (Prev)</label><input type="number" step="1" id="prev_'+k+'" placeholder="'+(money?'€':'n')+'"></div>'+
               '<div data-cons><label>'+k+' (Cons)</label><input type="number" step="1" id="cons_'+k+'" placeholder="'+(money?'€':'n')+'"></div>'+
               '<div data-bar class="small">'+
                 '<div style="height:10px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden"><div id="bar_'+k+'" style="height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));"></div></div>'+
                 '<div id="pct_'+k+'" class="small muted">0%</div>'+
               '</div>'+
             '</div>';
    }
    document.getElementById('p_rows').innerHTML=rows;
    setFormMode(false); bindProgressInputs(); progressBars();
  }
  function progressBars(){
    for(var i=0;i<IND.length;i++){
      var k=IND[i], pvEl=document.getElementById('prev_'+k), cvEl=document.getElementById('cons_'+k);
      if(!pvEl||!cvEl) continue;
      var pv=Number(pvEl.value||0), cv=Number(cvEl.value||0);
      var pct=pv>0?Math.round((cv/pv)*100):(cv>0?100:0); pct=Math.max(0,Math.min(200,pct));
      var bar=document.getElementById('bar_'+k), tx=document.getElementById('pct_'+k);
      if(bar) bar.style.width=Math.min(pct,100)+'%'; if(tx) tx.textContent=pct+'%';
    }
  }
  function bindProgressInputs(){ for(var i=0;i<IND.length;i++){ (function(k){ var a=document.getElementById('prev_'+k), b=document.getElementById('cons_'+k); if(a) a.oninput=progressBars; if(b) b.oninput=progressBars; })(IND[i]); } }
  function clearPrev(){ for(var i=0;i<IND.length;i++){ var el=document.getElementById('prev_'+IND[i]); if(el) el.value=''; } progressBars(); }
  function clearCons(){ for(var i=0;i<IND.length;i++){ var el=document.getElementById('cons_'+IND[i]); if(el) el.value=''; } progressBars(); }
  function fillPrev(vals){ for(var k in vals){ var el=document.getElementById('prev_'+k); if(el) el.value=String(vals[k]||0); } progressBars(); }
  function fillCons(vals){ for(var k in vals){ var el=document.getElementById('cons_'+k); if(el) el.value=String(vals[k]||0); } progressBars(); }

  // === Import da agenda (solo Previsionale)
  function doImportAgenda(){
    if(CONS_MODE) return;
    var s=startH.value, e=endH.value; if(!s||!e){toast('Seleziona il periodo');return;}
    GET('/api/appointments').then(function(r){
      var list=r.appointments||[], sD=new Date(s), eD=new Date(e);
      var agg={VSS:0,VSDPersonale:0,VSDIndiretto:0,GI:0,Telefonate:0,AppFissati:0,AppFatti:0,CorsiLeadership:0,iProfile:0,MBS:0,NNCF:0};
      for(var i=0;i<list.length;i++){ var a=list[i], d=new Date(a.start);
        if(d>=sD && d<=eD){ agg.VSS+=Number(a.vss||0); agg.VSDPersonale+=Number(a.vsdPersonal||0); if(a.nncf) agg.NNCF+=1; }
      }
      fillPrev(agg); toast('Previsionale compilato dalla tua agenda'); celebrate(); window.addXP(10);
    }).catch(function(){ toast('Errore import agenda'); });
  }

  // === Provvigioni (derivate, NON nel form) ===
  function computeCommissions(bag, grade){
    bag = Object.assign({}, bag||{});
    var gi   = Number(bag.GI||0);
    var vsdP = Number(bag.VSDPersonale||0);
    var pGI  = gi * 0.15;
    var pVSD = vsdP * (String(grade)==='senior' ? 0.25 : 0.20);
    bag.ProvvGI        = Math.round(pGI*100)/100;
    bag.ProvvVSD       = Math.round(pVSD*100)/100;
    bag.TotProvvigioni = Math.round((bag.ProvvGI + bag.ProvvVSD)*100)/100;
    return bag;
  }

  // === Delete helpers (priorità alle POST) ===
  function tryJSON(method,url,body){
    return fetch(url,{method:method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined})
      .then(function(r){ if(!r.ok) return Promise.reject(new Error('HTTP '+r.status)); return r.json().catch(function(){return{};}); });
  }
  function apiDeletePeriod(id){
    var urlId=encodeURIComponent(id);
    var attempts=[
      function(){return tryJSON('POST','/api/periods/delete',{id:id});},
      function(){return tryJSON('POST','/api/periods',{id:id,_delete:true});},
      function(){return tryJSON('POST','/api/periods/'+urlId,{_method:'DELETE'});},
      function(){return tryJSON('DELETE','/api/periods/'+urlId,null);},
      function(){return tryJSON('DELETE','/api/periods?id='+urlId,null);}
    ];
    var p=Promise.reject(new Error('start')); for(var i=0;i<attempts.length;i++){ (function(fn){ p=p.catch(fn); })(attempts[i]); }
    return p.catch(function(err){ logger.warn('Delete fallback: tutte le route fallite',err); throw err; });
  }

  function buildUpdatePayloadFromCurrent(newCons){
    if(!CURRENT_P) return null;
    return {
      id: EDIT_PID || CURRENT_P.id,
      type: CURRENT_P.type,
      startDate: ymd(CURRENT_P.startDate),
      endDate: ymd(CURRENT_P.endDate),
      indicatorsPrev: Object.assign({}, CURRENT_P.indicatorsPrev||{}),
      indicatorsCons: (newCons!=null?newCons:Object.assign({}, CURRENT_P.indicatorsCons||{}))
    };
  }

  function renderDeleteZone(){
    var zone=document.getElementById('p_delete_zone'); if(!zone) return;
    if(!EDIT_PID){ zone.innerHTML=''; return; }
    var showDelCons = !!(CURRENT_P && hasCons(CURRENT_P));
    var html='';
    if(showDelCons) html += '<button id="btnDelCons" class="ghost" style="border-color:#7d1731;color:#7d1731">Elimina Consuntivo</button> ';
    html += '<button id="btnDelBP" class="ghost" style="border-color:#7d1731;color:#7d1731">Elimina BP</button>';
    zone.innerHTML=html;

    var delBP=document.getElementById('btnDelBP');
    if(delBP) delBP.onclick=function(){
      if(!confirm('Eliminare definitivamente questo BP?')) return;
      delBP.disabled=true;
      apiDeletePeriod(EDIT_PID).then(function(){
        toast('BP eliminato'); EDIT_PID=null; CURRENT_P=null; clearPrev(); clearCons(); setFormMode(false); computeBoundsAndPreview(); listPeriods();
      }).catch(function(){ toast('Endpoint delete non disponibile'); }).finally(function(){ delBP.disabled=false; });
    };

    var delCons=document.getElementById('btnDelCons');
    if(delCons) delCons.onclick=function(){
      if(!confirm('Rimuovere solo il Consuntivo?')) return;
      delCons.disabled=true;
      var payload=buildUpdatePayloadFromCurrent({});
      if(!payload){ delCons.disabled=false; return; }
      var grade = getGrade();
      payload.indicatorsPrev = computeCommissions(payload.indicatorsPrev, grade);
      payload.indicatorsCons = {};
      POST('/api/periods', payload).then(function(){
        toast('Consuntivo eliminato');
        if(CURRENT_P){ CURRENT_P.indicatorsCons={}; }
        setFormMode(true); listPeriods(); renderDeleteZone();
      }).catch(function(){ toast('Errore eliminazione Consuntivo'); }).finally(function(){ delCons.disabled=false; });
    };
  }

  // === Salvataggio ===
  function savePeriod(){
    var type=typeSel.value, s=startH.value, e=endH.value;
    if(!s||!e){ toast('Seleziona il periodo'); return; }
    var prev={}, cons={};
    for(var i=0;i<IND.length;i++){
      var k=IND[i]; prev[k]=Number(document.getElementById('prev_'+k).value||0);
      if(CONS_MODE){ cons[k]=Number(document.getElementById('cons_'+k).value||0); }
    }
    var grade = getGrade();
    prev = computeCommissions(prev, grade);
    if(CONS_MODE) cons = computeCommissions(cons, grade);

    var payload={type:type,startDate:s,endDate:e,indicatorsPrev:prev};
    if(CONS_MODE) payload.indicatorsCons=cons;
    if(EDIT_PID) payload.id=EDIT_PID;

    POST('/api/periods',payload).then(function(resp){
      toast('BP salvato'); if(CONS_MODE) window.addXP(20); else window.addXP(10); celebrate();
      try{ document.dispatchEvent(new Event('bp:saved')); }catch(_){ }
      listPeriods();
      if(!EDIT_PID && resp && resp.id){ EDIT_PID=resp.id; }
      if(EDIT_PID && CURRENT_P){
        CURRENT_P.indicatorsPrev=prev; if(CONS_MODE) CURRENT_P.indicatorsCons=cons;
      }
      renderDeleteZone();
    }).catch(function(){ toast('Errore salvataggio BP'); });
  }

  // === Elenco + apertura ===
  function listPeriods(){
    GET('/api/periods').then(function(r){
      var list=r.periods||[]; list.sort(function(a,b){return new Date(b.startDate)-new Date(a.startDate);});
      var html='';
      for(var i=0;i<list.length;i++){
        var p=list[i], name=formatPeriodLabel(p.type,p.startDate)+' · '+dmy(p.startDate)+' → '+dmy(p.endDate);
        html += '<div class="card" style="flex:1 1 360px">'+
                  '<div><b>'+htmlEscape(name)+'</b></div>'+
                  '<div class="small">Prev VSS '+fmtEuro((p.indicatorsPrev||{}).VSS||0)+' · Cons '+fmtEuro((p.indicatorsCons||{}).VSS||0)+'</div>'+
                  '<div class="right" style="margin-top:6px">'+
                    '<button class="ghost" data-edit="'+p.id+'">Modifica previs.</button>'+
                    '<button data-cons="'+p.id+'">Consuntivo…</button>'+
                  '</div>'+
                '</div>';
      }
      document.getElementById('p_list').innerHTML = html || '<div class="muted">Nessun BP</div>';

      document.querySelectorAll('[data-edit]').forEach(function(el){
        el.addEventListener('click', function(){
          var id=el.getAttribute('data-edit'); var it=(r.periods||[]).find(function(pp){return pp.id===id;});
          if(it) loadPeriodIntoForm(it,false);
        });
      });
      document.querySelectorAll('[data-cons]').forEach(function(el){
        el.addEventListener('click', function(){
          var id=el.getAttribute('data-cons'); var it=(r.periods||[]).find(function(pp){return pp.id===id;});
          if(it) loadPeriodIntoForm(it,true);
        });
      });

      buildTopSections(list);

      var open=load('bp_open_period',null);
      if(open){ del('bp_open_period'); var it2=list.find(function(p){return p.id===open.id;}); if(it2) loadPeriodIntoForm(it2, open.mode===true); }
    });
  }

  function loadPeriodIntoForm(p, consMode){
    CURRENT_P=p||null;
    typeSel.value=p.type;
    var d=new Date(p.startDate), y=d.getFullYear(); yearInp.value=String(y);
    if(p.type==='settimanale'){ weekInp.value=String(isoWeekNum(d)); }
    else if(p.type==='mensile'){ monthSel.value=String(d.getMonth()+1); }
    else if(p.type==='trimestrale'){ var q=Math.floor(d.getMonth()/3)+1; quarterSel.value=String(q); }
    else if(p.type==='semestrale'){ semSel.value=(d.getMonth()<6)?'1':'2'; }
    showControlsForType();
    clearPrev(); clearCons(); fillPrev(p.indicatorsPrev||{}); fillCons(p.indicatorsCons||{});
    setFormMode(!!consMode);
    EDIT_PID=p.id||null;
    renderDeleteZone();
    toast(consMode?'Compila il consuntivo':'Modifica previsionale');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  // === suggeriti / inviati ===
  function currentBounds(tp,d){ d=d||new Date(); var y=d.getFullYear();
    if(tp==='settimanale'){ var wb=weekBoundsOf(y,isoWeekNum(d)); return {start:wb.start,end:wb.end}; }
    if(tp==='mensile'){ return {start:startOfMonth(d),end:endOfMonth(d)}; }
    if(tp==='trimestrale'){ return {start:startOfQuarter(d),end:endOfQuarter(d)}; }
    if(tp==='semestrale'){ return {start:startOfSemester(d),end:endOfSemester(d)}; }
    return {start:startOfYear(d),end:endOfYear(d)};
  }
  function nextBounds(tp,d){ d=d||new Date();
    if(tp==='settimanale') return nextWeekBounds(d);
    if(tp==='mensile') return nextMonthBounds(d);
    if(tp==='trimestrale') return nextQuarterBounds(d);
    if(tp==='semestrale') return nextSemesterBounds(d);
    return nextYearBounds(d);
  }
  function isEndWindowFor(boundEndDate){
    var wb=weekBoundsOf(new Date().getFullYear(),isoWeekNum(new Date()));
    var monday=wb.start; var diffDays=Math.floor((new Date(boundEndDate)-monday)/(1000*60*60*24));
    return diffDays<=13;
  }
  function suggestionCard(mode,type,s,e,cta,onClick){
    var tLabel=formatPeriodLabel(type,s);
    var el=domFromHTML('<div class="card" style="position:relative">'+
      '<div class="small muted">'+htmlEscape(mode)+'</div>'+
      '<div><b>'+htmlEscape(tLabel)+'</b></div>'+
      '<div class="small muted">'+dmy(s)+' → '+dmy(e)+'</div>'+
      '<div class="right" style="margin-top:6px"><button class="ghost" type="button" data-sug="1">'+htmlEscape(cta)+'</button></div>'+
      '</div>');
    el.querySelector('[data-sug]').addEventListener('click',onClick); return el;
  }
  function buildTopSections(periods){
    var contSend=document.getElementById('bp_to_send'), contSent=document.getElementById('bp_sent');
    contSend.innerHTML=''; contSent.innerHTML='';
    function findBP(tp,s,e){ return periods.find(function(p){return p.type===tp && ymd(p.startDate)===ymd(s) && ymd(p.endDate)===ymd(e);}); }
    var now=new Date(), dow=now.getDay(), weekendWindow=(dow===5||dow===6||dow===0);
    var eom=endOfMonth(now), eoq=endOfQuarter(now), eos=endOfSemester(now), eoy=endOfYear(now);
    var monthWindow=weekendWindow && isEndWindowFor(eom),
        quarterWindow=weekendWindow && isEndWindowFor(eoq),
        semWindow=weekendWindow && isEndWindowFor(eos),
        yearWindow=weekendWindow && isEndWindowFor(eoy);

    ['settimanale','mensile','trimestrale','semestrale','annuale'].forEach(function(tp){
      var cur=currentBounds(tp,now), bp=findBP(tp,cur.start,cur.end);
      if(bp){
        var node=domFromHTML('<div class="card" style="flex:1 1 360px">'+
          '<div><b>'+htmlEscape(formatPeriodLabel(tp,cur.start))+'</b></div>'+
          '<div class="small muted">'+dmy(cur.start)+' → '+dmy(cur.end)+'</div>'+
          '<div class="right" style="margin-top:6px"><button class="ghost" type="button" data-mid="'+bp.id+'">Modifica</button></div>'+
        '</div>');
        node.querySelector('[data-mid]').addEventListener('click',function(){ loadPeriodIntoForm(bp,false);});
        contSent.appendChild(node);
      }
    });

    function pushPrevOrCompile(tp,cur,nxt){
      var bpNext=findBP(tp,nxt.start,nxt.end), bpCur=findBP(tp,cur.start,cur.end);
      if(bpNext){
        contSend.appendChild(suggestionCard('Previsionale',tp,nxt.start,nxt.end,'Modifica',function(){ loadPeriodIntoForm(bpNext,false);} ));
      }else{
        contSend.appendChild(suggestionCard('Previsionale',tp,nxt.start,nxt.end,'Compila',function(){
          typeSel.value=tp; yearInp.value=String(nxt.start.getFullYear());
          if(tp==='settimanale'){ weekInp.value=String(isoWeekNum(nxt.start)); }
          else if(tp==='mensile'){ monthSel.value=String(nxt.start.getMonth()+1); }
          else if(tp==='trimestrale'){ var q=Math.floor(nxt.start.getMonth()/3)+1; quarterSel.value=String(q); }
          else if(tp==='semestrale'){ semSel.value=(nxt.start.getMonth()<6)?'1':'2'; }
          showControlsForType();
        }));
      }
      if(bpCur && !hasCons(bpCur)){
        contSend.appendChild(suggestionCard('Consuntivo',tp,cur.start,cur.end,'Consuntivo',function(){ loadPeriodIntoForm(bpCur,true);} ));
      }
    }

    if(weekendWindow){ var curW=currentBounds('settimanale',now), nxtW=nextBounds('settimanale',now); pushPrevOrCompile('settimanale',curW,nxtW); }
    if(monthWindow){ var curM=currentBounds('mensile',now), nxtM=nextBounds('mensile',now); pushPrevOrCompile('mensile',curM,nxtM); }
    if(quarterWindow){ var curQ=currentBounds('trimestrale',now), nxtQ=nextBounds('trimestrale',now); pushPrevOrCompile('trimestrale',curQ,nxtQ); }
    if(semWindow){ var curS=currentBounds('semestrale',now), nxtS=nextBounds('semestrale',now); pushPrevOrCompile('semestrale',curS,nxtS); }
    if(yearWindow){ var curY=currentBounds('annuale',now), nxtY=nextBounds('annuale',now); pushPrevOrCompile('annuale',curY,nxtY); }

    if(!contSend.children.length){ contSend.innerHTML='<div class="muted">Nessun suggerimento attivo in questo momento</div>'; }

    var head=document.getElementById('bp_sent_head'), chev=document.getElementById('bp_sent_chev');
    head.onclick=function(){ var box=document.getElementById('bp_sent'); var vis=(box.style.display!=='none'); box.style.display=vis?'none':''; chev.textContent=vis?'▸':'▾'; };
  }

  // === wiring/init ===
  GET('/api/settings').then(function(s){
    IND=(s && s.indicators) || ['VSS','VSDPersonale','VSDIndiretto','GI','Telefonate','AppFissati','AppFatti','CorsiLeadership','iProfile','MBS','NNCF'];
    buildRows(IND);
  }).catch(function(){ IND=['VSS','VSDPersonale','GI','NNCF']; buildRows(IND); });

  typeSel.onchange=showControlsForType;
  yearInp.oninput=computeBoundsAndPreview;
  weekInp.oninput=computeBoundsAndPreview;
  monthSel.onchange=computeBoundsAndPreview;
  quarterSel.onchange=computeBoundsAndPreview;
  semSel.onchange=computeBoundsAndPreview;

  btnImport.onclick=doImportAgenda;
  document.getElementById('btnSaveP').onclick=savePeriod;

  showControlsForType();
  listPeriods();
}

// ===== APPUNTAMENTI =====
function viewAppointments(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Appuntamenti';

  // --------- STILI: NNCF uguale ai 3 bottoni (seg/active) ----------
  if(!document.getElementById('appts_css')){
    const st=document.createElement('style');
    st.id='appts_css';
    st.textContent = `
      .appt-type .seg, #a_nncf.seg{
        padding:8px 12px;border:1px solid #bcd7ff;border-radius:12px;
        background:#eef5ff;color:#1463ff;cursor:pointer;user-select:none;
        transition:.15s;
      }
      .appt-type .seg.active, #a_nncf.seg.active{
        background:var(--accent);color:#fff;border-color:var(--accent);
        box-shadow:0 0 0 2px rgba(20,99,255,.08) inset;
      }
      #a_list .grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
    `;
    document.head.appendChild(st);
  }

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+
      '<div class="card">'+
        '<b id="a_form_title">Nuovo appuntamento</b>'+
        '<div class="row" style="margin-top:8px;align-items:flex-end;gap:12px;flex-wrap:wrap">'+
          '<div style="min-width:320px"><label>Cliente *</label>'+
            '<div style="display:flex;gap:8px;align-items:center">'+
              '<input id="a_client" list="clientList" placeholder="Denominazione" style="flex:1">'+
              '<datalist id="clientList"></datalist>'+
              '<button id="a_nncf" class="seg" data-active="0" aria-pressed="false">NNCF</button>'+
            '</div>'+
          '</div>'+
          '<div><label>Data/ora inizio</label><input id="a_start" type="datetime-local"></div>'+
          '<div><label>Ora fine</label><input id="a_end" type="time"></div>'+
          '<div><label>Durata (min)</label><input id="a_dur" type="number" placeholder="60" min="1"></div>'+
        '</div>'+
        '<div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">'+
          '<div class="appt-type">'+
            '<label>Tipo</label>'+
            '<div>'+
              '<button type="button" id="t_vendita" class="seg">Vendita</button>'+
              '<button type="button" id="t_mezza"   class="seg" data-vsd="1000">Mezza giornata</button>'+
              '<button type="button" id="t_full"    class="seg" data-vsd="2000">Giornata intera</button>'+
            '</div>'+
            '<input id="a_type" type="hidden" value="vendita">'+
          '</div>'+
          '<div><label>VSS</label><input id="a_vss" type="number" step="1" placeholder="0"></div>'+
          '<div><label>VSD personale</label><input id="a_vsd" type="number" step="1" placeholder="0"></div>'+
        '</div>'+
        '<div class="row" style="margin-top:8px;gap:8px;align-items:center">'+
          '<div><button id="btnSaveA">Salva</button></div>'+
          '<div><button id="btnSaveExportA" class="ghost">Salva ed esporta</button></div>'+
          '<div class="right" style="margin-left:auto"><button id="btnDeleteA" class="danger" style="display:none">Elimina</button></div>'+
        '</div>'+
      '</div>'+
      '<div class="card">'+
        '<b>Elenco appuntamenti</b>'+
        '<div class="row" style="margin-top:8px;align-items:flex-end;gap:12px;flex-wrap:wrap">'+
          '<div><label>Vista</label>'+
            '<select id="af_type"><option value="sett">Settimana</option><option value="mese">Mese</option></select>'+
          '</div>'+
          '<div id="af_week_wrap"><label>Settimana ISO</label>'+
            '<input id="af_week" type="number" min="1" max="53" value="'+isoWeekNum(new Date())+'"></div>'+
          '<div id="af_month_wrap" style="display:none"><label>Mese</label>'+
            '<select id="af_month">'+
              '<option value="1">Gennaio</option><option value="2">Febbraio</option><option value="3">Marzo</option>'+
              '<option value="4">Aprile</option><option value="5">Maggio</option><option value="6">Giugno</option>'+
              '<option value="7">Luglio</option><option value="8">Agosto</option><option value="9">Settembre</option>'+
              '<option value="10">Ottobre</option><option value="11">Novembre</option><option value="12">Dicembre</option>'+
            '</select>'+
          '</div>'+
          '<div><label>Anno</label><input id="af_year" type="number" min="2000" max="2100" value="'+(new Date().getFullYear())+'"></div>'+
          '<div class="right" style="margin-left:auto;display:flex;gap:8px">'+
            '<button id="af_prev" class="ghost">◀</button>'+
            '<button id="af_next" class="ghost">▶</button>'+
          '</div>'+
        '</div>'+
        '<div id="a_list" style="margin-top:8px"></div>'+
      '</div>'+
    '</div>';

  renderTopbar();

  // --------- helpers ----------
  function htmlEscape(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]);}
  function fmtEuro(n){var v=Number(n)||0; return v.toLocaleString('it-IT')+'€';}
  function dmy(d){var x=new Date(d); return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2)+'/'+x.getFullYear();}
  function hm(d){var x=new Date(d); return ('0'+x.getHours()).slice(-2)+':'+('0'+x.getMinutes()).slice(-2);}
  function localInputToISO(val){ if(!val) return ''; const d=new Date(val); return isNaN(d)?'':d.toISOString(); }
  function isoToLocalInput(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return ''; return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  function defDurByType(t){
    t = String(t||'').toLowerCase();
    if(t.indexOf('mezza')>-1) return 240;
    if(t.indexOf('giorn')>-1) return 570;
    return 90; // vendita (default)
  }

  // --------- NNCF toggle ----------
  const nncfBtn = document.getElementById('a_nncf');
  nncfBtn.addEventListener('click', ()=> {
    const on = nncfBtn.getAttribute('data-active')!=='1';
    nncfBtn.setAttribute('data-active', on?'1':'0');
    nncfBtn.setAttribute('aria-pressed', on?'true':'false');
    nncfBtn.classList.toggle('active', on);
    if(on) selectSeg(document.getElementById('t_vendita'));
  });

  // --------- segment buttons ----------
  const segSale = document.getElementById('t_vendita');
  const segHalf = document.getElementById('t_mezza');
  const segFull = document.getElementById('t_full');
  const allSegs = [segSale, segHalf, segFull];
  function selectSeg(btn){
    allSegs.forEach(b=>b.classList.toggle('active', b===btn));
    const typeHidden = document.getElementById('a_type');
    if(btn===segSale){ typeHidden.value='vendita'; setDur(90); }
    if(btn===segHalf){ typeHidden.value='mezza';   setDur(240); document.getElementById('a_vsd').value='1000'; }
    if(btn===segFull){ typeHidden.value='giornata';setDur(570); document.getElementById('a_vsd').value='2000'; }
  }
  function setDur(min){
    const dEl=document.getElementById('a_dur');
    dEl.value=String(min);
    updateEndFromDur();
  }
  allSegs.forEach(b=> b.addEventListener('click', (e)=>{ e.preventDefault(); selectSeg(b); }));
  selectSeg(segSale);

  // --------- sync start/end/dur ----------
  function updateEndFromDur(){
    const sVal=document.getElementById('a_start').value;
    const m = parseInt(document.getElementById('a_dur').value||'0',10);
    if(!sVal || !isFinite(m) || m<=0){ document.getElementById('a_end').value=''; return; }
    const s=new Date(sVal); const e=new Date(s.getTime()+m*60000);
    document.getElementById('a_end').value=('0'+e.getHours()).slice(-2)+':'+('0'+e.getMinutes()).slice(-2);
  }
  function updateDurFromEnd(){
    const sVal=document.getElementById('a_start').value;
    const t=document.getElementById('a_end').value; if(!sVal||!t) return;
    const s=new Date(sVal); const p=t.split(':'); if(p.length<2) return;
    const e=new Date(s); e.setHours(parseInt(p[0],10)||0, parseInt(p[1],10)||0,0,0);
    if(e < s) e.setDate(e.getDate()+1);
    let mins=Math.round((e-s)/60000);
    document.getElementById('a_dur').value=String(Math.max(1,mins));
  }
  document.getElementById('a_start').addEventListener('change', updateEndFromDur);
  document.getElementById('a_dur').addEventListener('input', updateEndFromDur);
  document.getElementById('a_end').addEventListener('change', updateDurFromEnd);

  // --------- clients datalist ----------
  GET('/api/clients').then(r=>{
    const list=(r&&r.clients)||[];
    const dl=document.getElementById('clientList'); if(!dl) return;
    dl.innerHTML=list.map(c=>'<option value="'+htmlEscape(c.name)+'"></option>').join('');
  });

  // --------- form state ----------
  let editId=null;
  function resetForm(){
    editId=null;
    document.getElementById('a_form_title').textContent='Nuovo appuntamento';
    document.getElementById('a_client').value='';
    document.getElementById('a_start').value='';
    document.getElementById('a_end').value='';
    document.getElementById('a_dur').value='';
    document.getElementById('a_vss').value='';
    document.getElementById('a_vsd').value='';
    nncfBtn.setAttribute('data-active','0'); nncfBtn.setAttribute('aria-pressed','false');
    nncfBtn.classList.remove('active');
    selectSeg(segSale);
    document.getElementById('btnDeleteA').style.display='none';
  }
  function fillForm(a){
    editId=a.id;
    document.getElementById('a_form_title').textContent='Modifica appuntamento';
    document.getElementById('a_client').value=a.client||'';
    document.getElementById('a_start').value=isoToLocalInput(a.start);

    const s = new Date(a.start);
    let e = a.end ? new Date(a.end) : null;
    let dur = Number(a.durationMinutes);
    if(e instanceof Date && !isNaN(e) && e >= s){
      dur = Math.max(1, Math.round((e - s)/60000));
    } else if(isFinite(dur) && dur > 0){
      e = new Date(s.getTime() + dur*60000);
    } else {
      dur = defDurByType(a.type||'vendita');
      e = new Date(s.getTime()+dur*60000);
    }
    document.getElementById('a_dur').value = String(dur);
    document.getElementById('a_end').value = ('0'+e.getHours()).slice(-2)+':'+('0'+e.getMinutes()).slice(-2);

    document.getElementById('a_vss').value=a.vss||'';
    document.getElementById('a_vsd').value=a.vsdPersonal || a.vsd || '';
    const on=!!a.nncf;
    nncfBtn.setAttribute('data-active', on?'1':'0'); nncfBtn.setAttribute('aria-pressed', on?'true':'false');
    nncfBtn.classList.toggle('active', on);
    // Mantieni il tipo selezionato dall'utente (non dedurre dalla durata)
    var t = String(a.type||'vendita').toLowerCase();
    if(t.indexOf('mezza')>-1) selectSeg(segHalf);
    else if(t.indexOf('giorn')>-1) selectSeg(segFull);
    else selectSeg(segSale);

    document.getElementById('btnDeleteA').style.display='';
  }

  // --------- save / delete ----------
  function collectForm(){
    const client=(document.getElementById('a_client').value||'').trim();
    if(!client){ toast('Cliente obbligatorio'); return null; }
    const startLocal=document.getElementById('a_start').value;
    if(!startLocal){ toast('Data/ora obbligatorie'); return null; }

    let dur=parseInt(document.getElementById('a_dur').value||'60',10);
    if(!isFinite(dur)||dur<=0) dur=60;

    const endStr=document.getElementById('a_end').value;
    let endISO;
    if(endStr){
      const s=new Date(startLocal);
      const pr=endStr.split(':');
      const e=new Date(s);
      e.setHours(parseInt(pr[0],10)||0, parseInt(pr[1],10)||0, 0, 0);
      if(e < s) e.setDate(e.getDate()+1);
      endISO=e.toISOString();
      dur=Math.max(1, Math.round((e-s)/60000));
      document.getElementById('a_dur').value=String(dur);
    }else{
      const eLocal = new Date(new Date(startLocal).getTime()+dur*60000);
      endISO = eLocal.toISOString();
    }

    return {
      id: editId || undefined,
      client: client,
      start: localInputToISO(startLocal),
      end: endISO,
      durationMinutes: dur,
      type: document.getElementById('a_type').value,
      vss: Number(document.getElementById('a_vss').value||0),
      vsdPersonal: Number(document.getElementById('a_vsd').value||0),
      nncf: (nncfBtn.getAttribute('data-active')==='1')
    };
  }
  function saveA(exportAfter){
    const payload=collectForm(); if(!payload) return;
    const wasNew = !editId;
    POST('/api/appointments', payload).then(()=>{
 toast('Appuntamento salvato');
      if (typeof haptics!=='undefined') haptics.try('success');
      document.dispatchEvent(new Event('appt:saved'));
      if (wasNew){ try{ document.dispatchEvent(new Event('appt:created')); }catch(_){ } }
      if (exportAfter && window.BP && BP.ICS && typeof BP.ICS.downloadIcsForAppointment==='function') {
        const ok = BP.ICS.downloadIcsForAppointment(payload);
        if (ok) {
          if (typeof haptics!=='undefined') haptics.try('medium');
          try{ document.dispatchEvent(new Event('ics:exported')); }catch(_){ }
          toast('.ics esportato');
        } else {
          toast('Export .ics non disponibile');
        }
      }
      resetForm(); listA();
    }).catch(()=> toast('Errore salvataggio'));
  }
function deleteA(){
    if(!editId) return;
    if(!confirm('Eliminare l\'appuntamento?')) return;
 // backup per UNDO (ricrea l’appuntamento)
    const backup = collectForm();
    fetch('/api/appointments?id='+encodeURIComponent(editId), { method:'DELETE', headers:{ 'Authorization':'Bearer '+getToken() } })
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(()=>{
       toast('Eliminato');
        if (typeof showUndo==='function' && backup){
          showUndo('Appuntamento eliminato', function(){ return POST('/api/appointments', backup); }, 5000);
        }
        resetForm(); listA();
      })
      .catch(()=> toast('Errore eliminazione'));
  }
  document.getElementById('btnSaveA').onclick       = ()=> saveA(false);
  document.getElementById('btnSaveExportA').onclick = ()=> saveA(true);
  document.getElementById('btnDeleteA').onclick     = deleteA;

  // --------- filtro lista (settimana/mese + prev/next) ----------
  function boundsForList(){
    const t=document.getElementById('af_type').value;
    const y=parseInt(document.getElementById('af_year').value,10);
    if(t==='sett'){
      const w=Math.max(1, Math.min(53, parseInt(document.getElementById('af_week').value||isoWeekNum(new Date()),10)));
      const wb=weekBoundsOf(y,w);
      return {s:new Date(wb.start), e:new Date(wb.end)};
    }else{
      const m=parseInt(document.getElementById('af_month').value|| (new Date().getMonth()+1),10);
      return {s:new Date(y,m-1,1), e:new Date(y,m,0,23,59,59,999)};
    }
  }
  function shiftPeriod(dir){
    const t=document.getElementById('af_type').value;
    const y=parseInt(document.getElementById('af_year').value,10);
    if(t==='sett'){
      const w=parseInt(document.getElementById('af_week').value,10);
      const d=new Date(weekBoundsOf(y,w).start); d.setDate(d.getDate()+7*dir);
      document.getElementById('af_year').value=d.getFullYear();
      document.getElementById('af_week').value=isoWeekNum(d);
    }else{
      const m=parseInt(document.getElementById('af_month').value,10);
      const d=new Date(y,m-1,1); d.setMonth(d.getMonth()+dir);
      document.getElementById('af_year').value=d.getFullYear();
      document.getElementById('af_month').value=d.getMonth()+1;
    }
    listA();
  }
  document.getElementById('af_prev').onclick = ()=> shiftPeriod(-1);
  document.getElementById('af_next').onclick = ()=> shiftPeriod(+1);
  const afType=document.getElementById('af_type');
  const afWeek=document.getElementById('af_week');
  const afMonth=document.getElementById('af_month');
  const afYear=document.getElementById('af_year');
  afType.onchange = function(){
    const t=afType.value;
    document.getElementById('af_week_wrap').style.display  = (t==='sett')?'':'none';
    document.getElementById('af_month_wrap').style.display = (t==='mese')?'':'none';
    listA();
  };
  [afWeek,afMonth,afYear].forEach(el=>{ if(el) el.onchange=listA; });

  // --------- rendering lista ----------
  function cardHTML(a){
    const s = new Date(a.start);
    let e = a.end ? new Date(a.end) : null;
    if(!(e instanceof Date) || isNaN(e) || e < s){
      const dur = isFinite(a.durationMinutes) ? Number(a.durationMinutes) : defDurByType(a.type||'vendita');
      e = new Date(s.getTime() + dur*60000);
    }
    const when = dmy(s)+' '+('0'+s.getHours()).slice(-2)+':'+('0'+s.getMinutes()).slice(-2)+'–'+('0'+e.getHours()).slice(-2)+':'+('0'+e.getMinutes()).slice(-2);
    const line2 = 'VSS '+fmtEuro(a.vss||0)+' · VSD '+fmtEuro(a.vsdPersonal||0)+' · NNCF '+(a.nncf?'✅':'—');
    return ''+
      '<div class="card" data-aid="'+htmlEscape(String(a.id||''))+'" style="flex:1 1 320px;cursor:pointer">'+
        '<div class="small muted">'+htmlEscape(when)+' · '+htmlEscape(a.type||'vendita')+'</div>'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'+
          '<div><b>'+htmlEscape(a.client||'')+'</b></div>'+
          '<button class="ghost btn-ics" title="Esporta" data-ics="'+htmlEscape(String(a.id||''))+'">📅</button>'+
        '</div>'+
        '<div class="small">'+line2+'</div>'+
      '</div>';
  }
  function listA(){
    GET('/api/appointments').then(r=>{
      const list=(r&&r.appointments)||[];
      const b=boundsForList(); const s=b.s.getTime(), e=b.e.getTime();
      const filtered=list.filter(a=>{ const t=new Date(a.start).getTime(); return t>=s && t<=e; })
                         .sort((a,b)=> new Date(a.start)-new Date(b.start));

      const now=new Date();
      const fut = filtered.filter(a=> new Date(a.start)>=now);
      const past= filtered.filter(a=> new Date(a.start)< now);

      const host=document.getElementById('a_list');
      let html='';
      html += '<div><b>Prossimi</b></div>';
      html += fut.length ? '<div class="grid3">'+fut.map(cardHTML).join('')+'</div>' :
              '<div class="muted" style="margin:6px 0 12px">Nessun appuntamento futuro</div>';

      const pid='past_'+Math.random().toString(36).slice(2,8);
      html += '<div id="'+pid+'_head" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer">'+
                '<b>Passati</b><span class="chev">▸</span></div>'+
              '<div id="'+pid+'_box" style="display:none;margin-top:8px">'+
                (past.length ? '<div class="grid3">'+past.map(cardHTML).join('')+'</div>' :
                               '<div class="muted">Nessun appuntamento passato</div>')+
              '</div>';
      host.innerHTML=html;

      (function(){
        const head=document.getElementById(pid+'_head');
        const box=document.getElementById(pid+'_box');
        const chev=head.querySelector('.chev');
        head.onclick=function(){
          const open=(box.style.display==='none');
          box.style.display=open?'':'none';
          chev.textContent=open?'▾':'▸';
        };
      })();

      const allShown = filtered;
      host.querySelectorAll('[data-ics]').forEach(bt=>{
        bt.addEventListener('click', ev=>{
          ev.stopPropagation();
          const id=bt.getAttribute('data-ics');
          const a=allShown.find(z=> String(z.id)===String(id));
          if(!a){ toast('Appuntamento non trovato'); return; }
          if (window.BP && BP.ICS && typeof BP.ICS.downloadIcsForAppointment==='function'){
            const ok = BP.ICS.downloadIcsForAppointment(a);
            if (ok) {
              if (typeof haptics!=='undefined') haptics.try('medium');
              try{ document.dispatchEvent(new Event('ics:exported')); }catch(_){ }
              toast('Esportato');
            } else {
              toast('Export .ics non disponibile');
            }
          } else { toast('Export .ics non disponibile'); }
        });
      });
      // Click on the whole card opens it in edit
      host.querySelectorAll('.card[data-aid]').forEach(card=>{
        card.addEventListener('click', ()=>{
          const id=card.getAttribute('data-aid');
          const a=allShown.find(z=> String(z.id)===String(id));
          if(a){ fillForm(a); window.scrollTo({top:0, behavior:'smooth'}); }
        });
      });
    });
  }

  // --------- bridge e init ----------
  try{
    const slot=load('bp_prefill_slot', null);
    if(slot && slot.start){
      const s=new Date(slot.start), e=new Date(slot.end||slot.start);
      const local = new Date(s.getTime()-s.getTimezoneOffset()*60000).toISOString().slice(0,16);
      document.getElementById('a_start').value=local;
      document.getElementById('a_dur').value=String(Math.max(1,Math.round((e-s)/60000)));
      updateEndFromDur();
      toast('Slot precompilato negli appuntamenti');
    }
    del('bp_prefill_slot');
  }catch(_){}

  try{
    const aid=load('bp_edit_aid', null);
    if(aid){
      GET('/api/appointments').then(r=>{
        const list=(r&&r.appointments)||[];
        const it=list.find(a=> String(a.id)===String(aid));
        if(it){ fillForm(it); window.scrollTo({top:0, behavior:'smooth'}); }
      }).finally(()=>{ try{ del('bp_edit_aid'); }catch(_){ } });
    }
  }catch(_){}

  document.getElementById('btnSaveA').onclick       = ()=> saveA(false);
  document.getElementById('btnSaveExportA').onclick = ()=> saveA(true);
  document.getElementById('btnDeleteA').onclick     = deleteA;

  GET('/api/clients').then(()=>{});
  listA();
}

// ===== CLASSIFICHE =====
function viewLeaderboard(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Classifiche';

  appEl.innerHTML = topbarHTML() + (
    '<div class="wrap">'+
      '<div class="card">'+
        '<div class="row">'+
          '<div>'+
            '<label>Vista</label>'+
            '<select id="lb_tab">'+
              '<option value="per_indicator">Per indicatore</option>'+
              '<option value="overall">Generale (score)</option>'+
            '</select>'+
          '</div>'+
          '<div>'+
            '<label>Modalità</label>'+
            '<select id="lb_mode"><option value="consuntivo">Consuntivo</option><option value="previsionale">Previsionale</option></select>'+
          '</div>'+
          '<div id="lb_ind_wrap">'+
            '<label>Indicatore</label>'+
            '<select id="lb_indicator"><option value="VSS">VSS</option><option value="VSDPersonale">VSD</option><option value="GI">GI</option><option value="NNCF">NNCF</option></select>'+
          '</div>'+
        '</div>'+
        unifiedFiltersHTML("lb")+
      '</div>'+
      '<div class="card"><b id="lb_title">Classifica</b><div id="lb_podium" style="margin:10px 0"></div><div id="lb_table"></div></div>'+
    '</div>'
  );

  renderTopbar();

  function ymd(d){ if(!d) return ''; var x=new Date(d); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); }
  function effectivePeriodType(gran){ return (gran==='ytd' || gran==='ltm') ? 'mensile' : gran; }

  document.getElementById('lb_tab').onchange = function(){
    var v=this.value;
    document.getElementById('lb_ind_wrap').style.display = (v==='per_indicator') ? '' : 'none';
    doLoad();
  };

  bindUnifiedFilters('lb', doLoad);
  document.getElementById('lb_mode').onchange = doLoad;
  document.getElementById('lb_indicator').onchange = doLoad;

  function qsFromToType(){
    var r=readUnifiedRange('lb'); var f=ymd(r.start), t=ymd(r.end); var type=effectivePeriodType(r.type||'mensile');
    return '&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t)+'&type='+encodeURIComponent(type);
  }
  function doLoad(){
    var tab = document.getElementById('lb_tab').value;
    var qs = qsFromToType();
    var mode = document.getElementById('lb_mode').value;
    if(tab==='overall'){
      GET('/api/leaderboard_overall?mode='+encodeURIComponent(mode)+qs).then(renderOverall);
    }else{
      var ind  = document.getElementById('lb_indicator').value;
      GET('/api/leaderboard?indicator='+encodeURIComponent(ind)+'&mode='+encodeURIComponent(mode)+qs).then(function(r){
        renderPerIndicator(r, ind);
      });
    }
  }
  function medal(i){ if(i===0) return '🥇'; if(i===1) return '🥈'; if(i===2) return '🥉'; return (i+1)+'.'; }

  function renderPodium(rows){
    var cont = document.getElementById('lb_podium');
    if(!rows || !rows.length){ cont.innerHTML=''; return; }
    var top = rows.slice(0,3);
    var h='<div class="row" style="align-items:flex-end">';
    for(var i=0;i<top.length;i++){
      var height = 80 - i*15;
      h += '<div class="card" style="flex:1 1 120px;height:'+height+'px;display:flex;align-items:flex-end;justify-content:center">'+
            '<div>'+htmlEscape(medal(i)+' '+top[i].name)+'</div>'+
           '</div>';
    }
    h+='</div>';
    cont.innerHTML=h;
  }

  function rowCard(name, line1, score){
    var barW = Math.min(100, Math.max(0, Math.round(score)));
    return ''+
      '<div class="card lb-card" style="flex:1 1 280px">'+
        '<div class="big">'+htmlEscape(name)+'</div>'+
        '<div class="small muted">'+htmlEscape(line1)+'</div>'+
        '<div class="lb-bar"><div style="width:'+barW+'%"></div></div>'+
      '</div>';
  }

  function renderPerIndicator(r, ind){
    document.getElementById('lb_title').textContent = 'Classifica – '+ind;
    var rows = r.ranking||[];
    renderPodium(rows);
    if(!rows.length){ document.getElementById('lb_table').innerHTML='<div class="muted">Nessun dato</div>'; return; }
    var html = '<div class="row">';
    var max = rows[0].total || 1;
    for(var i=0;i<rows.length;i++){
      var it=rows[i];
      html += rowCard(medal(i)+' '+it.name, 'Totale: '+fmtInt(it.total), (max? (it.total/max*100) : 0));
    }
    html+='</div>';
    document.getElementById('lb_table').innerHTML = html;
  }
  function renderOverall(r){
    document.getElementById('lb_title').textContent = 'Classifica generale';
    var rows = r.ranking||[];
    renderPodium(rows);
    if(!rows.length){ document.getElementById('lb_table').innerHTML='<div class="muted">Nessun dato</div>'; return; }
    var best = rows[0].score||0;
    var html = '<div class="row">';
    for(var i=0;i<rows.length;i++){
      var it=rows[i];
      html += rowCard(medal(i)+' '+it.name, 'Score: '+fmtInt(it.score)+'/100', (best? (it.score/best*100):0));
    }
    html+='</div>';
    document.getElementById('lb_table').innerHTML = html;
  }

  doLoad();
}

// === Overlay helpers (global) ===
(function () {
  function ensureOverlay() {
    var ov = document.getElementById('bp-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'bp-overlay';
      ov.className = 'hidden';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.innerHTML =
        '<div class="bp-overlay-backdrop" id="bp-overlay-backdrop"></div>' +
        '<div class="bp-overlay-panel" id="bp-overlay-panel"></div>';
      document.body.appendChild(ov);
      // chiudi cliccando sul backdrop
      document.getElementById('bp-overlay-backdrop').addEventListener('click', hideOverlay);
    }
    return ov;
  }

  window.showOverlay = function (html) {
    var ov = ensureOverlay();
    var panel = document.getElementById('bp-overlay-panel');
    panel.innerHTML = html || '';
    ov.classList.remove('hidden');
    // focus al primo campo utile se presente
    var first = panel.querySelector('input, textarea, select, button');
    if (first) setTimeout(function(){ try{ first.focus(); }catch(e){} }, 0);
  };

  window.hideOverlay = function () {
    var ov = document.getElementById('bp-overlay');
    if (ov) ov.classList.add('hidden');
  };
})();


// ===== CLIENTI =====
function viewClients(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Clienti';

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+
      '<div class="card">'+
        '<b>Nuovo cliente</b>'+
        '<div class="row" style="margin-top:8px">'+
          '<div><label>Ragione sociale</label><input id="cl_name" type="text" placeholder="Es. Rossi S.r.l."></div>'+
          '<div><label>Stato</label>'+
            '<select id="cl_new_state">'+
              '<option value="potenziale">Potenziale</option>'+
              '<option value="lead non chiuso">Lead non chiuso</option>'+
              '<option value="attivo">Attivo</option>'+
            '</select>'+
          '</div>'+
          '<div><label>Consulente</label><select id="cl_new_owner"><option value="">—</option></select></div>'+
          '<div class="right"><button id="cl_add">Aggiungi</button></div>'+
        '</div>'+
      '</div>'+

      '<div class="card">'+
        '<b>Filtri elenco</b>'+
        '<div class="row" style="margin-top:8px">'+
          '<div><label>Stato</label>'+
            '<select id="cl_f_state">'+
              '<option value="">Tutti</option>'+
              '<option value="attivo">Attivo</option>'+
              '<option value="lead non chiuso">Lead non chiuso</option>'+
              '<option value="potenziale">Potenziale</option>'+
            '</select>'+
          '</div>'+
          '<div><label>Consulente</label>'+
            '<select id="cl_f_cons"><option value="">Tutti</option></select>'+
          '</div>'+
          '<div><label>Ordina per</label>'+
            '<select id="cl_order">'+
              '<option value="az">Ragione sociale (A→Z)</option>'+
              '<option value="last_desc">Ultimo appuntamento (recenti prima)</option>'+
            '</select>'+
          '</div>'+
          '<div class="right"><button class="ghost" id="cl_f_apply">Applica</button></div>'+
        '</div>'+
      '</div>'+

      '<div class="card">'+
        '<b>Elenco clienti</b>'+
        '<div id="cl_list" class="row" style="margin-top:8px"></div>'+
      '</div>'+
    '</div>';

  renderTopbar();

  function addClient(){
    const name = (document.getElementById('cl_name').value||'').trim();
    if(!name){ toast('Nome obbligatorio'); return; }
    const st = document.getElementById('cl_new_state');
    const ow = document.getElementById('cl_new_owner');
    const payload = { name: name };
    if(st) payload.status = st.value;
    if(ow && ow.value) payload.consultantId = ow.value;

    POST('/api/clients', payload).then(function(){
      document.getElementById('cl_name').value='';
      listClients();
      celebrate(); window.addXP(5);
    }).catch(function(err){ logger.error(err); toast('Errore creazione cliente'); });
  }

  function fillConsultants(){
    // popola sia filtro sia creazione
    GET('/api/usernames').then(function(r){
      const users=(r&&r.users)||[];
      const selF=document.getElementById('cl_f_cons');
      const selN=document.getElementById('cl_new_owner');
      if(selF){
        selF.innerHTML='<option value="">Tutti</option>'+users.map(function(u){
          return '<option value="'+u.id+'">'+htmlEscape(u.name)+(u.grade?(' ('+u.grade+')'):'')+'</option>';
        }).join('');
      }
      if(selN){
        selN.innerHTML='<option value="">—</option>'+users.map(function(u){
          return '<option value="'+u.id+'">'+htmlEscape(u.name)+(u.grade?(' ('+u.grade+')'):'')+'</option>';
        }).join('');
      }
    }).catch(function(err){ logger.error(err); });
  }

  function listClients(){
    GET('/api/clients').then(function(r){
      const clients=(r&&r.clients)||[];

      const fState=document.getElementById('cl_f_state').value;
      const fCons =document.getElementById('cl_f_cons').value;

      function norm(s){ return String(s||'').trim().toLowerCase(); }

      const res=clients.filter(function(c){
        if(fState && norm(c.status)!==norm(fState)) return false;
        if(fCons && String(c.consultantId||'')!==String(fCons)) return false;
        return true;
      });

      const html=res.map(function(c){
        const name=htmlEscape(c.name||'');
        const status=htmlEscape(c.status||'potenziale');
        const cons = c.consultantName ? htmlEscape(c.consultantName) : 'unknown';
        const id = String(c.id||'');
        return ''+
          '<div class="card" data-clid="'+id+'" data-name-lower="'+name.toLowerCase()+'" data-status="'+status+'" data-consultant-id="'+htmlEscape(String(c.consultantId||''))+'" style="flex:1 1 380px">'+
            '<div><b>'+name+'</b></div>'+
            '<div class="small">Stato: <b class="cl-status">'+status+'</b></div>'+
            '<div class="small">Consulente: <b class="cl-cons">'+cons+'</b></div>'+
            '<div class="small muted">Ultimo appuntamento: <span class="last-appt">—</span></div>'+
            '<div class="right" style="margin-top:6px"><button class="ghost" data-del="'+id+'">Rimuovi</button></div>'+
          '</div>';
      }).join('');

      document.getElementById('cl_list').innerHTML = html || '<div class="muted">Nessun cliente</div>';

      // delete
      document.querySelectorAll('[data-del]').forEach(function(bt){
        bt.addEventListener('click', function(){
          const id = bt.getAttribute('data-del');
          if(!confirm('Rimuovere il cliente?')) return;
          fetch('/api/clients?id='+encodeURIComponent(id), { method:'DELETE', headers:{ 'Authorization': 'Bearer '+getToken() } })
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(){ toast('Cliente rimosso'); listClients(); })
            .catch(function(err){ logger.error(err); toast('Errore rimozione'); });
        });
      });

      // final hooks (enrich + inline + sort)
      if(window.BPFinal && typeof BPFinal.ensureClientSection==='function'){
        BPFinal.ensureClientSection();
      } else {
        // fallback minimo: ordina A→Z
        setTimeout(function(){
          const host=document.getElementById('cl_list');
          const cards=Array.from(host.children).filter(n=>n.classList.contains('card'));
          cards.sort((a,b)=>String(a.getAttribute('data-name-lower')||'').localeCompare(String(b.getAttribute('data-name-lower')||'')));
          for(const c of cards) host.appendChild(c);
        },0);
      }
    });
  }

  document.getElementById('cl_add').onclick    = addClient;
  document.getElementById('cl_f_apply').onclick= listClients;

  fillConsultants();
  listClients();
  if (typeof kickFinal === 'function') kickFinal('clients');
}

// ===== SQUADRA =====
function viewTeam(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Squadra';

  // abilita vista admin per tutti come in v13
  var isAdmin = true;

  // markup
  var html = topbarHTML()+
    '<div class="wrap">'+
      (isAdmin ? (
        '<div class="card">'+
          '<b>Vista Amministratore</b>'+
          '<div id="t_adminbar" class="row" style="margin-top:8px;display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">'+
            '<div><label>Modalità</label>'+
              '<select id="t_mode" name="mode">'+
                '<option value="consuntivo">Consuntivo</option>'+
                '<option value="previsionale">Previsionale</option>'+
              '</select>'+
            '</div>'+
            '<div id="t_unified_wrap">'+ unifiedFiltersHTML("t") + '</div>'+
          '</div>'+
        '</div>'+

        '<div class="card">'+
          '<b>Riepilogo per utente</b>'+
          '<div id="t_users" class="row" style="margin-top:8px"></div>'+
        '</div>'+

        '<div class="card">'+
          '<b>Aggregato Squadra</b>'+
          '<div id="t_agg" class="row" style="margin-top:8px"></div>'+
          '<div class="row" style="margin-top:12px;align-items:flex-end;gap:16px;flex-wrap:wrap">'+
            '<div>'+
              '<label>Indicatore grafico</label>'+
              '<select id="t_ind">'+
                '<option value="VSS">VSS</option>'+
                '<option value="VSDPersonale">VSD Personale</option>'+
                '<option value="VSDIndiretto">VSD Indiretto</option>'+
                '<option value="VSDTotale">VSD Totale</option>'+
                '<option value="GI">GI</option>'+
                '<option value="NNCF">NNCF</option>'+
                '<option value="provv_gi">Provv GI</option>'+
                '<option value="provv_vsd">Provv VSD</option>'+
                '<option value="tot_provv" selected>Tot Provvigioni</option>'+
              '</select>'+
            '</div>'+
            '<div>'+
              '<label>Consulente</label>'+
              '<select id="t_cons"><option value="">Tutti</option></select>'+
            '</div>'+
          '</div>'+
          '<div style="margin-top:8px"><canvas id="t_chart" height="160"></canvas></div>'+
        '</div>'
      ) : '')+
    '</div>';

  appEl.innerHTML = html;
  renderTopbar();

  // allinea i filtri granularità/mese/anno nella stessa riga
  (function inlineUnified(){
    var bar  = document.getElementById('t_adminbar');
    var wrap = document.getElementById('t_unified_wrap');
    if(!bar || !wrap) return;
    var row  = wrap.querySelector('.row'); if(!row) return;
    Array.from(row.children).forEach(function(k){
      k.classList.remove('right');
      k.style.marginTop='0';
      bar.appendChild(k);
    });
    wrap.remove();
  })();

  // helpers
  function asNumber(v){ v = Number(v||0); return isFinite(v)?v:0; }
  function ymd(d){ if(!d) return ''; var x=new Date(d); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); }
  function effType(g){
    g = String(g||'mensile').toLowerCase();
    if(g.indexOf('sett')===0) return 'settimanale';
    if(g.indexOf('mes')===0)  return 'mensile';
    if(g.indexOf('tri')===0)  return 'trimestrale';
    if(g.indexOf('sem')===0)  return 'semestrale';
    if(g.indexOf('ann')===0)  return 'annuale';
    return 'mensile';
  }
  function qsFromToType(){
    var r = readUnifiedRange('t');
    var f = ymd(r.start), t = ymd(r.end), type = effType(r.type);
    return '&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t)+'&type='+encodeURIComponent(type);
  }
  function canonIndicator(val){
    switch(String(val)){
      case 'provv_gi':  return 'ProvvGI';
      case 'provv_vsd': return 'ProvvVSD';
      case 'tot_provv': return 'TotProvvigioni';
      default:          return val; // VSS, VSDPersonale, VSDIndiretto, VSDTotale, GI, NNCF
    }
  }
  function fmtEuro(n){ var v=Number(n)||0; return v.toLocaleString('it-IT')+'€'; }
  function fmtInt(n){ var v=Number(n)||0; return String(Math.round(v)); }
  function htmlEscape(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]); }

  // Chart helpers (con fallback se Chart.js manca)
  var tChart=null;
  function labelFor(d, type){
    if(type==='settimanale') return (window.isoWeekNum ? window.isoWeekNum(d) : Math.ceil(d.getDate()/7));
    if(type==='mensile' || type==='ytd' || type==='ltm') return (d.getMonth()+1);
    if(type==='trimestrale') return (Math.floor(d.getMonth()/3)+1);
    if(type==='semestrale')  return (d.getMonth()<6 ? 1 : 2);
    return d.getFullYear();
  }
  function drawChart(points, type){
    var canvas = document.getElementById('t_chart'); if(!canvas) return;

    // Etichette estese basate sui buckets (coerenti con Dashboard)
    var buckets = buildBucketsRange(type);
    var labels = (typeof labelsForBuckets==='function')
      ? labelsForBuckets(type, buckets)
      : points.map(function(p){ return labelFor(p.x, type); });
    var data   = points.map(function(p){ return p.y; });

    if (typeof Chart === 'undefined'){
      // fallback a linea semplice
      var ctx = canvas.getContext('2d');
      canvas.width = canvas.clientWidth || 600;
      canvas.height= canvas.clientHeight|| 160;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      var max=Math.max(1, ...data);
      var step=(data.length>1)?(canvas.width-8)/(data.length-1):0;
      ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle='#2e6cff';
      data.forEach(function(v,i){
        var x=4+i*step, y=canvas.height-6-(v/max)*(canvas.height-12);
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      });
      ctx.stroke();
      ctx.fillStyle='#2e6cff';
      data.forEach(function(v,i){
        var x=4+i*step, y=canvas.height-6-(v/max)*(canvas.height-12);
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();
      });
      return;
    }

    var ctx = canvas.getContext('2d');
    var tickOpts = (typeof window.computeTickOptions==='function')
      ? window.computeTickOptions(labels, canvas.width||600)
      : {autoSkip:true, maxRotation:0, minRotation:0};
    if(!tChart){
      var existing = typeof Chart.getChart==='function'?Chart.getChart(canvas):null;
      if(existing) existing.destroy();
      tChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: '', data: data, tension: .3, pointRadius: 3, pointHoverRadius:5 }] },
        options: {
          responsive:false, maintainAspectRatio:false,
          animation:false, animations:false,
          plugins:{ legend:{ display:false } },
          scales:{
            x:{ grid:{ display:false }, ticks: tickOpts },
            y:{ beginAtZero:true }
          }
        }
      });
    }else{
      tChart.data.labels = labels;
      tChart.data.datasets[0].data = data;
      tChart.options.scales.x.ticks = tickOpts;
      tChart.update();
    }
  }

  // Cards
  function cardUser(u){
    return ''+
      '<div class="card" style="flex:1 1 360px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div><b>'+htmlEscape(u.name||('User #'+u.userId))+'</b></div>'+
          (u.grade? '<span class="chip small">'+htmlEscape(u.grade)+'</span>' : '')+
        '</div>'+
        '<div class="small" style="margin-top:6px">VSS '+fmtEuro(u.vss||0)+'</div>'+
        '<div class="small">VSD Pers. '+fmtEuro(u.vsdP||0)+'</div>'+
        '<div class="small">VSD Ind. '+fmtEuro(u.vsdI||0)+'</div>'+
        '<div class="small">VSD Tot. '+fmtEuro((u.vsdP||0)+(u.vsdI||0))+'</div>'+
        '<div class="small">GI '+fmtEuro(u.gi||0)+'</div>'+
        '<div class="small">NNCF '+fmtInt(u.nncf||0)+'</div>'+
        '<div class="small muted" style="margin-top:6px">Provv GI '+fmtEuro(u.provvGi||0)+'</div>'+
        '<div class="small muted">Provv VSD '+fmtEuro(u.provvVsd||0)+'</div>'+
        '<div class="small"><b>Tot Provvigioni '+fmtEuro(u.provvTot||0)+'</b></div>'+
      '</div>';
  }
  function cardsAgg(tot){
    return ''+
      '<div class="card" style="flex:1 1 460px">'+
        '<div class="neon" style="font-weight:900">Totali squadra</div>'+
        '<div class="small" style="margin-top:6px">VSS '+fmtEuro(tot.vss)+'</div>'+
        '<div class="small">VSD Pers. '+fmtEuro(tot.vsdP)+'</div>'+
        '<div class="small">VSD Ind. '+fmtEuro(tot.vsdI)+'</div>'+
        '<div class="small">VSD Tot. '+fmtEuro(tot.vsdP + tot.vsdI)+'</div>'+
        '<div class="small">GI '+fmtEuro(tot.gi)+'</div>'+
        '<div class="small">NNCF '+fmtInt(tot.nncf)+'</div>'+
        '<div class="small muted" style="margin-top:6px">Provv GI '+fmtEuro(tot.provvGi)+'</div>'+
        '<div class="small muted">Provv VSD '+fmtEuro(tot.provvVsd)+'</div>'+
        '<div class="small"><b>Tot Provvigioni '+fmtEuro(tot.provvTot)+'</b></div>'+
      '</div>';
  }

  // Loader principale
  function loadTeam(){
    var mode = (document.getElementById('t_mode')||{}).value || 'consuntivo';
    var qs   = qsFromToType();

    Promise.all([
      GET('/api/usernames'),
      GET('/api/leaderboard?indicator='+encodeURIComponent('VSS')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('VSDPersonale')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('VSDIndiretto')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('GI')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('NNCF')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('ProvvGI')+qs+'&mode='+encodeURIComponent(mode)),
      GET('/api/leaderboard?indicator='+encodeURIComponent('ProvvVSD')+qs+'&mode='+encodeURIComponent(mode))
    ]).then(function(arr){
      var usersRes = arr[0]||{};
      var rowsVSS  = (arr[1] && (arr[1].rows||arr[1].ranking)) || [];
      var rowsVSDP = (arr[2] && (arr[2].rows||arr[2].ranking)) || [];
      var rowsVSDI = (arr[3] && (arr[3].rows||arr[3].ranking)) || [];
      var rowsGI   = (arr[4] && (arr[4].rows||arr[4].ranking)) || [];
      var rowsNNCF = (arr[5] && (arr[5].rows||arr[5].ranking)) || [];
      var rowsPGI  = (arr[6] && (arr[6].rows||arr[6].ranking)) || [];
      var rowsPVSD = (arr[7] && (arr[7].rows||arr[7].ranking)) || [];

      var users = (usersRes.users||[]).map(function(u){
        return { id:String(u.id), name:u.name||u.email||('User #'+u.id), grade:(u.grade==='senior'?'senior':'junior') };
      });

      // filtro consulente
      var consSel = document.getElementById('t_cons');
      if(consSel){
        consSel.innerHTML = '<option value="">Tutti</option>'+users.map(function(u){
          return '<option value="'+u.id+'">'+htmlEscape(u.name)+'</option>';
        }).join('');
      }

      function mapByUser(rows){
        var m={};
        for(var i=0;i<rows.length;i++){
          var x=rows[i];
          var id = String(x.userId||x.id||x.uid||'');
          var val = asNumber(x.total||x.value||x.sum||0);
          if(id) m[id] = val;
        }
        return m;
      }
      var mVSS  = mapByUser(rowsVSS);
      var mVSDP = mapByUser(rowsVSDP);
      var mVSDI = mapByUser(rowsVSDI);
      var mGI   = mapByUser(rowsGI);
      var mNNCF = mapByUser(rowsNNCF);
      var mPGI  = mapByUser(rowsPGI);
      var mPVSD = mapByUser(rowsPVSD);

      var rows = users.map(function(u){
        var vss  = asNumber(mVSS[u.id]);
        var vsdP = asNumber(mVSDP[u.id]);
        var vsdI = asNumber(mVSDI[u.id]);
        var gi   = asNumber(mGI[u.id]);
        var nncf = asNumber(mNNCF[u.id]);
        var pgi  = asNumber(mPGI[u.id]);
        var pvsd = asNumber(mPVSD[u.id]);
        return {
          userId:u.id, name:u.name, grade:u.grade,
          vss:vss, vsdP:vsdP, vsdI:vsdI, gi:gi, nncf:nncf,
          provvGi:pgi, provvVsd:pvsd, provvTot:(pgi+pvsd)
        };
      });

      // cards utenti
      var host = document.getElementById('t_users');
      if(host) host.innerHTML = rows.length ? rows.map(cardUser).join('') : '<div class="muted">Nessun dato</div>';

      // totali aggregati
      var tot = rows.reduce(function(a,x){
        a.vss+=x.vss; a.vsdP+=x.vsdP; a.vsdI+=x.vsdI;
        a.gi+=x.gi; a.nncf+=x.nncf;
        a.provvGi+=x.provvGi; a.provvVsd+=x.provvVsd; a.provvTot+=x.provvTot;
        return a;
      }, {vss:0,vsdP:0,vsdI:0,gi:0,nncf:0,provvGi:0,provvVsd:0,provvTot:0});
      var aggEl = document.getElementById('t_agg');
      if(aggEl) aggEl.innerHTML = cardsAgg(tot);

      // grafico
      loadChart();
    }).catch(function(err){
      logger.error(err);
      toast('Errore caricamento squadra');
    });
  }

  // ==== Serie locale dal DB dei periodi (fallback) ====

  function buildBucketsRange(gran){
    return (typeof buildBuckets==='function' ? buildBuckets(gran, new Date()) : [])
      .map(function(b){ return { s:b.s, e:b.e }; });
  }

  function computeSeriesLocally(indicator, mode, userId, range){
    var r = range || readUnifiedRange('t');
    var tSel = String(r.type||'mensile').toLowerCase(); // settimanale|mensile|trimestrale|semestrale|annuale|ytd|ltm
    var baseType = (tSel==='ytd' || tSel==='ltm') ? 'mensile' : tSel; // filtra periodi: mai mix
    var buckets = buildBucketsRange(tSel);

    function within(b, p){
      var ps = new Date(p.startDate).getTime();
      var pe = new Date(p.endDate).getTime();
      return ps>=b.s && pe<=b.e;
    }
    function pick(bag, ind){
      if(!bag) return 0;
      if(ind==='VSDTotale') return Number(bag.VSDPersonale||0) + Number(bag.VSDIndiretto||0);
      if(ind==='ProvvGI')   return Number(bag.ProvvGI||0);
      if(ind==='ProvvVSD')  return Number(bag.ProvvVSD||0);
      if(ind==='TotProvvigioni'){
        var tot = bag.TotProvvigioni;
        return Number(tot!=null ? tot : (Number(bag.ProvvGI||0)+Number(bag.ProvvVSD||0)));
      }
      return Number(bag[ind]||0);
    }

    return GET('/api/periods?global=1').catch(function(){ return GET('/api/periods'); }).then(function(resp){
      var periods = (resp && resp.periods) || [];

      var filtered = periods.filter(function(p){
        if (p.type !== baseType) return false;
        if (userId && String(p.userId||p.uid||'') !== String(userId)) return false;
        return true;
      });

      var points = buckets.map(function(b){
        var sum = 0;
        for (var i=0;i<filtered.length;i++){
          var p = filtered[i];
          if (!within(b, p)) continue;
          var bag = (mode==='previsionale' ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
          sum += pick(bag, canonIndicator(indicator));
        }
        return { x:new Date(b.s), y: Math.round(sum*100)/100 };
      });

      return points;
    });
  }

  function loadChart(){
    var ind   = document.getElementById('t_ind').value;
    var mode  = document.getElementById('t_mode').value || 'consuntivo';
    var cons  = document.getElementById('t_cons').value || '';
    var range = readUnifiedRange('t');
    var type  = range.type;

    // prova endpoint /api/series se presente (feature flag)
 var HAS_SERIES_API = false; // disabilitato: usa sempre computeSeriesLocally, niente 404 in console
    var IND = canonIndicator(ind);

    function normalizeSeries(resp){
      var rows=[];
      if(!resp) return [];
      if(Array.isArray(resp)) rows = resp;
      else if(resp.series)    rows = resp.series;
      else if(resp.rows)      rows = resp.rows;
      else if(resp.data)      rows = resp.data;
      else if(resp.ranking)   rows = resp.ranking;
      var out=[];
      for(var i=0;i<rows.length;i++){
        var r = rows[i];
        var d = r.date || r.period || r.month || r.label || r.time || r.ts || r.key;
        var v = (r.total!=null?r.total:(r.sum!=null?r.sum:(r.value!=null?r.value:(r.amount!=null?r.amount:(r.y!=null?r.y:(r.v!=null?r.v:r.count))))));
        if(!d || v==null) continue;
        var dx = (d instanceof Date) ? d : new Date(d);
        if(isNaN(dx)) continue;
        var num = Number(v); if(!isFinite(num)) continue;
        out.push({ x: dx, y: num });
      }
      out.sort(function(a,b){ return a.x - b.x; });
      return out;
    }

    var qs = qsFromToType()
            + (cons ? ('&userId='+encodeURIComponent(cons)) : '')
            + ('&indicator='+encodeURIComponent(IND))
            + ('&mode='+encodeURIComponent(mode));

    var p = HAS_SERIES_API
      ? GET('/api/series?'+qs).then(normalizeSeries).catch(function(){ return computeSeriesLocally(IND, mode, cons||null, range); })
      : computeSeriesLocally(IND, mode, cons||null, range);

    p.then(function(points){
      drawChart(points, type);
    }).catch(function(e){
      logger.error(e);
      // fallback a serie vuota
      drawChart([], type);
    });
  }

  // wiring
  bindUnifiedFilters('t', function(){
    if (typeof haptic==='function') haptic('light');
    loadTeam();
  });
  document.getElementById('t_mode').onchange = function(){ if (typeof haptic==='function') haptic('light'); loadTeam(); };
  document.getElementById('t_ind').onchange  = function(){ if (typeof haptic==='function') haptic('light'); loadChart(); };
  document.getElementById('t_cons').onchange = function(){ if (typeof haptic==='function') haptic('light'); loadChart(); };

  // Run
  loadTeam();
}

// ===== PROVVIGIONI =====
function viewCommissions(){
  if(!getUser()) return viewLogin();
  var isAdmin = getUser().role==='admin';
  document.title = 'Battle Plan – Provvigioni';

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+

      // Header / Filtri
      '<div class="card">'+
        '<b>Calcolo provvigioni</b>'+
        '<div class="row" style="margin-top:8px; gap:12px; flex-wrap:wrap">'+
          (isAdmin? '<div><label>Utente</label><select id="comm_user"><option value="__all">Tutta la squadra</option></select></div>' : '')+
          '<div><label>Modalità</label><select id="comm_mode" name="mode"><option value="consuntivo">Consuntivo</option><option value="previsionale">Previsionale</option></select></div>'+
        '</div>'+
        unifiedFiltersHTML("comm")+
      '</div>'+

      // Indicatori sintetici
      '<div class="card">'+
        '<b>Indicatori periodo</b>'+
        '<div id="comm_total" class="row" style="margin-top:8px; gap:12px; flex-wrap:wrap"></div>'+
      '</div>'+

      // Torta provvigioni
      '<div class="card">'+
        '<b>Provvigioni – ripartizione</b>'+
        '<div class="small muted">Confronto tra Provvigioni GI e Provvigioni VSD sul periodo selezionato</div>'+
        '<div class="row" style="margin-top:8px; align-items:center; gap:16px; flex-wrap:wrap">'+
          '<canvas id="cm_pie_provv" width="260" height="260" style="max-width:260px; max-height:260px"></canvas>'+
          '<div id="cm_pie_legend" class="small"></div>'+
        '</div>'+
      '</div>'+

      // Dettaglio
      '<div class="card">'+
        '<b>Dettaglio</b>'+
        '<div id="comm_rows" class="row" style="margin-top:8px; gap:12px; flex-wrap:wrap"></div>'+
      '</div>'+
    '</div>';

  renderTopbar();

  // ===== Helpers
  function $(id){ return document.getElementById(id); }
  function ymd(d){ if(!d) return ''; var x=new Date(d); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); }
  function fmtEuro(n){ var v=Number(n)||0; return v.toLocaleString('it-IT')+'€'; }
  function fmtInt(n){ var v=Number(n)||0; return String(Math.round(v)); }
  function asNum(v){ v = Number((v==null?'':v)); return isFinite(v)?v:0; }

  // – chiavi robuste come Dashboard
  function pickProvvTot(bag){
    if(!bag) return 0;
    if (bag.TotProvvigioni != null) return asNum(bag.TotProvvigioni);
    return asNum(bag.ProvvGI) + asNum(bag.ProvvVSD);
  }

  // ===== UI builders
  function stat(label, value){
    return ''+
      '<div class="card" style="flex:1 1 180px">'+
        '<div class="small muted">'+htmlEscape(label)+'</div>'+
        '<div style="font-weight:700; font-size:20px; margin-top:4px">'+value+'</div>'+
      '</div>';
  }
  function cardTot(t){
    return ''+
      stat('VSD personale', fmtEuro(t.vsd||0))+
      stat('GI', fmtEuro(t.gi||0))+
      stat('Provv. VSD', fmtEuro(t.provv_vsd||0))+
      stat('Provv. GI', fmtEuro(t.provv_gi||0))+
      stat('Totale Provvigioni', fmtEuro(t.provv_total||0));
  }
  function renderRows(rows){
    if(!rows.length) return '<div class="muted">Nessun dato</div>';
    return rows.map(function(r){
      return '<div class="card" style="flex:1 1 320px">'+
        '<div><b>'+htmlEscape(r.name)+'</b></div>'+
        '<div class="small" style="margin-top:4px">GI '+fmtEuro(r.gi||0)+' · VSD '+fmtEuro(r.vsd||0)+'</div>'+
        '<div class="small muted" style="margin-top:2px">Provv. GI '+fmtEuro(r.provv_gi||0)+' · Provv. VSD '+fmtEuro(r.provv_vsd||0)+'</div>'+
        '<div class="small" style="margin-top:6px"><b>Totale: '+fmtEuro(r.provv_total||0)+'</b></div>'+
      '</div>';
    }).join('');
  }

  // ===== Pie chart (canvas 2D)
// --- Pie chart (canvas 2D) con percentuale centrale: (provv_tot / GI) * 100
function renderProvvPie(provvGI, provvVSD, giBase){
  var canvas = document.getElementById('cm_pie_provv'), legendEl = document.getElementById('cm_pie_legend');
  if(!canvas || !canvas.getContext){ if(legendEl) legendEl.innerHTML=''; return; }
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height, cx=W/2, cy=H/2, r=Math.min(W,H)/2 - 8;
  ctx.clearRect(0,0,W,H);

  var a = Math.max(0, provvGI||0);
  var b = Math.max(0, provvVSD||0);
  var totProvv = a + b;
  var inc = (giBase>0) ? Math.round((totProvv/giBase)*100) : null; // null => “—”

  // niente dati: anello tratteggiato + percentuale (0% o —)
  if(totProvv<=0){
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle='#ccd0d5'; ctx.lineWidth=10; ctx.setLineDash([6,6]); ctx.stroke(); ctx.setLineDash([]);

    // buco
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath(); ctx.arc(cx,cy,r*0.55,0,Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation='source-over';

    // percentuale centrale
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(inc==null ? '—' : (inc+'%'), cx, cy);

    if(legendEl) legendEl.innerHTML = '<div class="muted">Nessuna provvigione nel periodo</div>';
    return;
  }

  // spicchi
  var parts = [
    {label:'Provv. GI',  value:a, color:'#4F8EF7'},
    {label:'Provv. VSD', value:b, color:'#F79F4F'}
  ];
  var start = -Math.PI/2;
  parts.forEach(function(p){
    var ang = (p.value/totProvv)*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+ang);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    start += ang;
  });

  // buco “donut”
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,r*0.55,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // percentuale centrale: incidenza provvigioni totali su GI
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(inc==null ? '—' : (inc+'%'), cx, cy);

  // legenda
  var pGI = Math.round(a/totProvv*100), pVSD = Math.round(b/totProvv*100);
  if(legendEl){
    legendEl.innerHTML =
      '<div class="row" style="gap:16px; flex-wrap:wrap">'+
        '<div class="row" style="gap:8px; align-items:center">'+
          '<span style="display:inline-block;width:12px;height:12px;background:#4F8EF7;border-radius:3px"></span>'+
          '<span><b>Provv. GI</b> '+fmtEuro(a)+' · '+pGI+'%</span>'+
        '</div>'+
        '<div class="row" style="gap:8px; align-items:center">'+
          '<span style="display:inline-block;width:12px;height:12px;background:#F79F4F;border-radius:3px"></span>'+
          '<span><b>Provv. VSD</b> '+fmtEuro(b)+' · '+pVSD+'%</span>'+
        '</div>'+
      '</div>';
  }
}
  // ===== Data source: come Dashboard → /api/periods
  function compute(){
    var r = readUnifiedRange('comm');               // granularità settimana/mese/trimestre/semestra/anno
    var mode = $('comm_mode').value || 'consuntivo';
    var userSel = isAdmin ? ($('comm_user').value || '__all') : String(getUser().id);
    var from = new Date(r.start).getTime();
    var to   = new Date(r.end).getTime();

    GET('/api/periods').then(function(j){
      var periods = (j && j.periods) || [];

      // filtro periodo + utente (se admin != tutta squadra)
      var filtered = periods.filter(function(p){
        var ps = new Date(p.startDate).getTime();
        var pe = new Date(p.endDate).getTime();
        if (ps < from || pe > to) return false;
        if (isAdmin && userSel!=='__all' && String(p.userId||p.uid||'') !== String(userSel)) return false;
        if (!isAdmin && String(p.userId||p.uid||'') !== String(getUser().id)) return false;
        return true;
      });

      // aggregati totali
      var TOT = { gi:0, vsd:0, provv_gi:0, provv_vsd:0, provv_total:0 };

      // dettaglio per utente
      var byUser = {}; // userId -> {name, gi, vsd, provv_gi, provv_vsd, provv_total}
      filtered.forEach(function(p){
        var bag = (mode==='previsionale' ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
        var uid = String(p.userId||p.uid||'');
        var name = p.userName || p.name || ('User '+uid);

        var gi  = asNum(bag.GI);
        var vsd = asNum(bag.VSDPersonale);
        var prg = asNum(bag.ProvvGI);
        var prv = asNum(bag.ProvvVSD);
        var prt = pickProvvTot(bag);

        TOT.gi += gi; TOT.vsd += vsd; TOT.provv_gi += prg; TOT.provv_vsd += prv; TOT.provv_total += prt;

        if(!byUser[uid]) byUser[uid] = { userId:uid, name:name, gi:0, vsd:0, provv_gi:0, provv_vsd:0, provv_total:0 };
        byUser[uid].gi += gi; byUser[uid].vsd += vsd;
        byUser[uid].provv_gi += prg; byUser[uid].provv_vsd += prv; byUser[uid].provv_total += prt;
      });

      $('comm_total').innerHTML = cardTot(TOT);
      $('comm_rows').innerHTML  = renderRows(Object.values(byUser).sort(function(a,b){ return (b.provv_total||0)-(a.provv_total||0); }));

renderProvvPie(TOT.provv_gi||0, TOT.provv_vsd||0, TOT.gi||0);
    }).catch(function(err){
      logger.error(err); toast('Errore nel caricamento dati');
    });
  }

  // ===== Bind
  function fillUsers(){
    if(!isAdmin) return;
    GET('/api/usernames').then(function(r){
      var sel = $('comm_user'); if(!sel) return;
      var h = '<option value="__all">Tutta la squadra</option>';
      var users = (r && r.users) || [];
      for(var i=0;i<users.length;i++){
        var u = users[i];
        h += '<option value="'+u.id+'">'+htmlEscape(u.name||('User '+u.id))+'</option>';
      }
      sel.innerHTML = h;
    });
  }

  bindUnifiedFilters('comm', function(){ compute(); });
  $('comm_mode').onchange = function(){ haptic('light'); compute(); };
  if (isAdmin) $('comm_user').onchange = function(){ haptic('light'); compute(); };

  // Init
  fillUsers();
  compute();
}
// ===== GI & SCADENZARIO =====
function viewGI(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – GI & Scadenzario';

appEl.innerHTML = topbarHTML() + `
  <div class="wrap">

    <div class="card">
      <b>Filtro</b>
      <div class="row" style="margin-top:6px;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div>
          <label>Consulente</label>
          <select id="gi_cons"><option value="">Tutti</option></select>
        </div>
      </div>
      ${unifiedFiltersHTML("gi")}
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>Vendite (GI)</b>
        <button class="ghost" id="gi_add">Nuova vendita</button>
      </div>
      <div class="table" style="overflow:auto">
        <table class="simple" style="min-width:980px">
          <thead>
            <tr>
              <th>Data vendita</th>
              <th>Cliente</th>
              <th>Consulente</th>
              <th>Servizi</th>
              <th style="text-align:right">Tot. VSS</th>
              <th>Piano pagamenti</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="gi_rows"></tbody>
        </table>
      </div>
    </div>

  </div>`;

  renderTopbar();

  // ========== helpers ==========
  const $ = id => document.getElementById(id);
  const esc = s => String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtEuro = n => (Number(n)||0).toLocaleString('it-IT')+'€';
  const ymd = d => { const x=new Date(d); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); };

  function readRange(){
    const R = (window.readUnifiedRange && window.readUnifiedRange('gi')) || {};
    if (!R || !R.start || !R.end){
      const now=new Date(), from=new Date(now.getFullYear(),0,1), to=new Date(now.getFullYear(),11,31,23,59,59);
      return { from: ymd(from), to: ymd(to) };
    }
    return { from: ymd(R.start), to: ymd(R.end) };
  }

  // cache clienti + consulenti
  let _clients = [];
  function loadClients(){
    return GET('/api/clients').then(j=>{
      _clients = (j&&j.clients)||[];
      return GET('/api/usernames');
    }).then(r=>{
      const users=(r&&r.users)||[];
      const s=$('gi_cons'); if(!s) return;
      s.innerHTML = '<option value="">Tutti</option>'+users.map(u =>
        '<option value="'+esc(String(u.id))+'">'+esc(u.name)+'</option>').join('');
    });
  }

  function paymentSummary(x){
    const S = Array.isArray(x.schedule)? x.schedule.slice() : [];
    if (!S.length) return '<span class="muted">—</span>';
    const dep = S.find(r => r.kind==='deposit' || /acconto/i.test(r.note||''));
    const others = S.filter(r => r!==dep);
    const depTxt = dep ? 'Acconto: '+fmtEuro(dep.amount) : '';
    if (!others.length) return depTxt || '<span class="muted">—</span>';
    const a0 = Math.round(others[0].amount||0);
    const allEq = others.every(r => Math.abs(Math.round(r.amount||0)-a0)<=1);
    return (depTxt? depTxt+' + ' : '') + (allEq ? (others.length+' rate da '+fmtEuro(a0)) : 'piano personalizzato');
  }

  function rowHTML(x){
    return '<tr data-id="'+esc(String(x.id))+'">'+
      '<td>'+new Date(x.date||x.createdAt).toLocaleDateString('it-IT')+'</td>'+
      '<td>'+esc(x.clientName||'')+'</td>'+
      '<td>'+esc(x.consultantName||'')+'</td>'+
      '<td>'+esc(x.services||'')+'</td>'+
      '<td style="text-align:right"><b>'+fmtEuro(x.vssTotal||0)+'</b></td>'+
      '<td>'+paymentSummary(x)+'</td>'+
      '<td class="right"><button class="ghost" data-edit="'+esc(String(x.id))+'">Modifica</button></td>'+
    '</tr>';
  }

  function load(){
    const r = readRange();
    const uid = ($('gi_cons')||{}).value || '';
    const qs = '?from='+encodeURIComponent(r.from)+'&to='+encodeURIComponent(r.to)+(uid?('&userId='+encodeURIComponent(uid)):'');
    GET('/api/gi'+qs).then(j=>{
      let rows=(j&&j.sales)||[];
      rows.sort((a,b)=> (+new Date(b.date||b.createdAt||0))-(+new Date(a.date||a.createdAt||0))); // più recenti in alto
      $('gi_rows').innerHTML = rows.length ? rows.map(rowHTML).join('') :
        '<tr><td colspan="7" class="muted">Nessuna vendita</td></tr>';
      bindRowActions();
    }).catch(e=>{ logger.error(e); toast('Errore caricamento GI'); });
  }

  // ========= MODALE (nuovo / modifica) =========
  function showGiModal(opts){
    const it = opts.sale || {};
    const sched = Array.isArray(it.schedule)? it.schedule.slice() : [];
    const dep   = sched.find(r => r.kind==='deposit' || /acconto/i.test(r.note||''));
    const rest  = sched.filter(r => r!==dep);
    const eqAmt = rest.length>0 ? rest.every(r => Math.abs((+r.amount||0) - (+rest[0].amount||0))<=1) : true;
    const defaultMode = (rest.length && eqAmt) ? 'rate' : 'manual';
    const today = ymd(new Date());

    const html =
    '<div class="modal"><div class="card gi-modal">'+
      '<style>'+
        '.gi-modal{min-width:min(760px,96vw);max-width:980px;max-height:86vh;overflow:auto}'+
        '@media (max-width:740px){ .gi-grid{display:block} .gi-col{width:100%} .gi-modal{min-width:96vw} }'+
        '.gi-grid{display:flex; gap:12px; flex-wrap:wrap} .gi-col{flex:1; min-width:240px}'+
        '.gi-section{border-top:1px solid var(--hair, rgba(0,0,0,.12)); padding-top:10px; margin-top:10px}'+
        '.pilltabs{display:flex; gap:12px; align-items:center} .pilltabs label{display:flex; align-items:center; gap:6px; cursor:pointer}'+
        '.mrow{display:flex; gap:8px; align-items:center; flex-wrap:wrap}'+
        '.mini input[type=number]{width:120px}'+
        '.gi-rlist{margin-top:6px; max-height:200px; overflow:auto; border:1px dashed rgba(0,0,0,.15); border-radius:8px; padding:6px}'+
        '.gi-r{display:flex; gap:6px; align-items:center; padding:4px 0}'+
        '.gi-foot{display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:12px}'+
      '</style>'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<b>'+(opts.title || (it.id?'Modifica vendita':'Nuova vendita'))+'</b>'+
        '<button class="ghost" id="m_close">Chiudi</button>'+
      '</div>'+

      '<div class="gi-grid">'+
        '<div class="gi-col"><label>Data</label><input id="m_date" type="date" value="'+esc(ymd(it.date||today))+'"></div>'+
        '<div class="gi-col"><label>Cliente</label><select id="gi_client_select"><option value="">Caricamento…</option></select></div>'+
        '<div class="gi-col"><label>Totale VSS</label><input id="m_vss" type="number" step="1" value="'+esc(Number(it.vssTotal||0))+'"></div>'+
      '</div>'+

      '<div class="gi-section"><label>Servizi</label><textarea id="m_srv" rows="2">'+esc(it.services||'')+'</textarea></div>'+

      '<div class="gi-section">'+
        '<b>Acconto</b>'+
        '<div class="mrow mini" style="margin-top:6px">'+
          '<label><input id="acc_enable" type="checkbox" '+(dep?'checked':'')+'> Abilita</label>'+
          '<label>Tipo</label>'+
          '<select id="acc_type"><option value="abs">Valore assoluto</option><option value="perc">Percentuale</option></select>'+
          '<label>Valore</label><input id="acc_value" type="number" step="1" value="'+(dep? esc(Number(dep._fromPerc ? dep._rawPerc : dep.amount)) : '0')+'">'+
          '<label>Scadenza</label><input id="acc_date" type="date" value="'+esc(dep? ymd(dep.dueDate) : ymd(it.date||today))+'">'+
          '<label>Nota</label><input id="acc_note" placeholder="es. Acconto" value="'+esc(dep? (dep.note||'Acconto') : 'Acconto')+'">'+
        '</div>'+
      '</div>'+

      '<div class="gi-section">'+
        '<b>Modalità pagamenti</b>'+
        '<div class="pilltabs" style="margin:6px 0 8px">'+
          '<label><input type="radio" name="pmode" value="rate" '+(defaultMode==='rate'?'checked':'')+'> Rateale</label>'+
          '<label><input type="radio" name="pmode" value="manual" '+(defaultMode!=='rate'?'checked':'')+'> Scaglioni manuali</label>'+
        '</div>'+
        '<div id="p_rate" style="display:'+(defaultMode==='rate'?'block':'none')+'">'+
          '<div class="mrow mini">'+
            '<label>N° rate</label><input id="rt_n" type="number" value="'+esc(rest.length||12)+'">'+
            '<label>Frequenza</label>'+
              '<select id="rt_freq"><option value="M">Mensile</option><option value="Q">Trimestrale</option><option value="W">Settimanale</option><option value="Y">Annuale</option></select>'+
            '<label>Prima scadenza</label><input id="rt_first" type="date" value="'+esc(rest[0]? ymd(rest[0].dueDate) : ymd(it.date||today))+'">'+
            '<button class="ghost" id="rt_build">Ricalcola rate</button>'+
          '</div>'+
          '<div id="rt_preview" class="gi-rlist muted small">—</div>'+
        '</div>'+
        '<div id="p_manual" style="display:'+(defaultMode!=='rate'?'block':'none')+'">'+
          '<div class="mrow mini"><button class="ghost" id="mn_add">Aggiungi scaglione</button></div>'+
          '<div id="mn_list" class="gi-rlist"></div>'+
        '</div>'+
      '</div>'+

      '<div class="gi-foot">'+
        '<div>'+
          '<div id="tot_prog" class="small muted">Programmato: 0€</div>'+
          '<div id="tot_chk"  class="small muted">Totale VSS: 0€</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px">'+
          (it.id ? '<button class="ghost danger" id="m_del">Elimina</button>' : '')+
          '<button id="m_save">Salva</button>'+
        '</div>'+
      '</div>'+

    '</div></div>';

    showOverlay(html);
    // lock scroll body finché la modale è aperta
    const prev = document.documentElement.style.overflow; document.documentElement.style.overflow='hidden';
    function close(){ document.documentElement.style.overflow=prev; hideOverlay(); }

    // riempi select clienti
    (function fillClients(){
      const sel = $('gi_client_select');
      sel.innerHTML = '<option value="">— seleziona cliente —</option>' +
        _clients.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
      const cid = (it.clientId||it.client_id||'');
      if (cid) sel.value = String(cid);
      if (!sel.value && it.clientName){
        const found = _clients.find(c => String(c.name).trim().toLowerCase() === String(it.clientName).trim().toLowerCase());
        if (found) sel.value = String(found.id);
      }
    })();

    // stato iniziale acconto
    if (dep && dep._fromPerc) $('acc_type').value='perc';

    Array.from(document.querySelectorAll('input[name="pmode"]')).forEach(r=>{
      r.addEventListener('change', ()=>{
        const rateOn = document.querySelector('input[name="pmode"]:checked').value==='rate';
        $('p_rate').style.display = rateOn ? 'block' : 'none';
        $('p_manual').style.display = rateOn ? 'none'  : 'block';
        updateTotals();
      });
    });

    function addMonths(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
    function addWeeks(d,n){ const x=new Date(d); x.setDate(x.getDate()+n*7); return x; }
    function addQuarters(d,n){ const x=new Date(d); x.setMonth(x.getMonth()+n*3); return x; }
    function addYears(d,n){ const x=new Date(d); x.setFullYear(x.getFullYear()+n); return x; }

    function buildRates(){
      const n   = Math.max(1, Number($('rt_n').value||0));
      const f   = $('rt_freq').value; // M|Q|W|Y
      const fst = new Date($('rt_first').value||today);
      const vss = Math.max(0, Number($('m_vss').value||0));
      const depAmt = computeDepositAmount();
      const resid = Math.max(0, vss - depAmt);
      const rata = Math.round(resid / n);
      const list=[];
      for (let i=0;i<n;i++){
        let d;
        if (f==='M') d = addMonths(fst,i);
        else if (f==='Q') d = addQuarters(fst,i);
        else if (f==='W') d = addWeeks(fst,i);
        else d = addYears(fst,i);
        list.push({ dueDate: d.toISOString(), amount: rata, note: 'Rata '+(i+1)+'/'+n, kind:'installment' });
      }
      renderRatePreview(list);
      return list;
    }
    function renderRatePreview(list){
      $('rt_preview').innerHTML = list.map(r =>
        '<div>'+new Date(r.dueDate).toLocaleDateString('it-IT')+' · '+fmtEuro(r.amount)+' <span class="muted">'+esc(r.note||'')+'</span></div>'
      ).join('');
      $('rt_preview')._data = list;
      updateTotals();
    }

    function renderManual(list){
      const host = $('mn_list');
      host.innerHTML = '';
      list.forEach((r,idx)=>{
        const row = document.createElement('div');
        row.className='gi-r';
        row.innerHTML =
          '<input type="date" data-k="dueDate" value="'+esc(ymd(r.dueDate))+'">'+
          '<input type="number" step="1" data-k="amount" value="'+esc(Number(r.amount||0))+'" style="width:120px">'+
          '<input type="text" data-k="note"   value="'+esc(r.note||'')+'" placeholder="nota" style="flex:1">'+
          '<button class="ghost" data-del="'+idx+'">✕</button>';
        host.appendChild(row);
      });
      host.querySelectorAll('[data-del]').forEach(b=>{
        b.onclick = ()=>{
          const i = Number(b.getAttribute('data-del'));
          const arr = host._data || [];
          arr.splice(i,1);
          renderManual(arr);
        };
      });
      host.oninput = ()=>{
        const arr = host._data || [];
        const rows = Array.from(host.children);
        rows.forEach((row,i)=>{
          const o = arr[i]; if(!o) return;
          const due = row.querySelector('[data-k="dueDate"]').value;
          const amt = Number(row.querySelector('[data-k="amount"]').value||0);
          const note= row.querySelector('[data-k="note"]').value;
          o.dueDate = new Date(due).toISOString();
          o.amount  = Math.round(amt);
          o.note    = note;
        });
        updateTotals();
      };
      host._data = list;
      updateTotals();
    }

    $('m_date').value = esc(ymd(it.date||today));
    $('m_vss').value  = esc(Number(it.vssTotal||0));
    $('m_srv').value  = esc(it.services||'');

    $('acc_type').value = dep && dep._fromPerc ? 'perc' : 'abs';
    $('acc_value').value= dep ? (dep._fromPerc ? dep._rawPerc : dep.amount) : 0;
    $('acc_date').value = dep ? esc(ymd(dep.dueDate)) : esc(ymd(it.date||today));
    $('acc_note').value = dep ? esc(dep.note||'Acconto') : 'Acconto';

    if (defaultMode==='rate'){
      const n = rest.length || 12;
      $('rt_n').value = n;
      $('rt_first').value = rest[0] ? esc(ymd(rest[0].dueDate)) : esc(ymd(it.date||today));
      renderRatePreview(rest.length? rest : buildRates());
    } else {
      renderManual(rest);
    }

    $('rt_build').onclick = ()=> renderRatePreview(buildRates());
    $('mn_add').onclick = ()=>{
      const host=$('mn_list');
      const arr = host._data || [];
      arr.push({ dueDate: new Date().toISOString(), amount: 0, note: '' , kind:'manual'});
      renderManual(arr);
    };
    $('m_close').onclick = close;

    function computeDepositAmount(){
      if (!$('acc_enable').checked) return 0;
      const vss = Math.max(0, Number($('m_vss').value||0));
      const kind = $('acc_type').value; // abs|perc
      const raw = Number($('acc_value').value||0);
      return Math.round(kind==='perc' ? (vss * (raw/100)) : raw);
    }

    function collectSchedule(){
      const list=[];
      if ($('acc_enable').checked){
        const amt = computeDepositAmount();
        list.push({
          dueDate: new Date($('acc_date').value||today).toISOString(),
          amount: amt,
          note: $('acc_note').value || 'Acconto',
          kind: 'deposit',
          _fromPerc: $('acc_type').value==='perc',
          _rawPerc: Number($('acc_value').value||0)
        });
      }
      const mode = document.querySelector('input[name="pmode"]:checked').value;
      if (mode==='rate'){
        const arr = ($('rt_preview')._data || []).map(x=>Object.assign({},x));
        return list.concat(arr);
      } else {
        const arr = ($('mn_list')._data || []).map(x=>Object.assign({kind:'manual'},x));
        return list.concat(arr);
      }
    }

    function updateTotals(){
      const vss = Math.max(0, Number($('m_vss').value||0));
      const sched = collectSchedule();
      const tot = Math.round(sched.reduce((a,r)=>a+Number(r.amount||0),0));
      $('tot_prog').textContent = 'Programmato: '+fmtEuro(tot);
      $('tot_chk').textContent  = 'Totale VSS: '+fmtEuro(vss) + (tot===vss ? ' OK' : ' (manca '+fmtEuro(vss-tot)+')');
      $('m_save').disabled = (tot!==vss) || !($('gi_client_select').value);
    }

    ['m_vss','acc_enable','acc_type','acc_value','acc_date','rt_n','rt_freq','rt_first']
      .forEach(id=>{ const el=$(id); if(el) el.addEventListener('input', updateTotals); });
    $('gi_client_select').addEventListener('change', updateTotals);
    updateTotals();

    $('m_save').onclick = ()=>{
      const clientId = $('gi_client_select').value || '';
      const client   = _clients.find(c=>String(c.id)===String(clientId));
      if (!client){ toast('Seleziona un cliente'); return; }

      const payload = {
        id: it.id || undefined,
        date: new Date($('m_date').value||today).toISOString(),
        clientId: client.id,
        clientName: client.name,
        vssTotal: Math.round(Number($('m_vss').value||0)),
        services: $('m_srv').value||'',
        schedule: collectSchedule()
      };
      Promise.resolve(POST('/api/gi', payload)).then(()=>{
        close(); haptic('light'); load();
      }).catch(e=>{ logger.error(e); toast('Errore salvataggio'); });
    };

    if (it.id){
      const del = $('m_del');
      if (del){
        del.onclick = async ()=>{
          if(!confirm('Eliminare definitivamente questa vendita?')) return;
          try{
            await POST('/api/gi/delete', { id: it.id }).catch(()=> POST('/api/gi', { id: it.id, _delete:1 }));
            close(); toast('Vendita eliminata'); load();
          }catch(e){ logger.error(e); toast('Errore eliminazione'); }
        };
      }
    }
  } // end showGiModal


  function bindRowActions(){
    document.querySelectorAll('[data-edit]').forEach(bt=>{
      bt.addEventListener('click', ()=>{
        const id = bt.getAttribute('data-edit');
        openEdit(id);
      });
    });
  }

  // apertura da evento esterno (es. post quick-VSS)
  document.addEventListener('gi:edit', function(ev){
    const id = ev && ev.detail && ev.detail.id;
    if(id) openEdit(id);
  });

  $('gi_add').onclick = ()=>{
    showGiModal({ title:'Nuova vendita' });
  };

  function openEdit(id){
    GET('/api/gi?from=1900-01-01&to=2999-12-31').then(j=>{
      const it = ((j&&j.sales)||[]).find(s => String(s.id)===String(id));
      if(!it){ toast('Vendita non trovata'); return; }
      showGiModal({ title:'Modifica vendita', sale: it });
    });
  }

  bindUnifiedFilters('gi', ()=>{ haptic('light'); load(); });
  ($('gi_cons')||{}).onchange = ()=>{ haptic('light'); load(); };

  loadClients().then(load);
}
window.viewGI = window.viewGI || viewGI;

// ===== REPORT =====
function viewReport(){
  if(!getUser()) return viewLogin();
  document.title = 'Battle Plan – Report';

  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+

      // --- TOGGLES PERIODI ---
      '<div class="card">'+
        '<b>Sezioni da includere</b>'+
        '<div id="rep_toggles" class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap">'+
          '<button class="pill" data-type="mensile" id="tog_mese">Mese</button>'+
          '<button class="pill" data-type="trimestrale" id="tog_trimestre">Trimestre</button>'+
          '<button class="pill" data-type="semestrale" id="tog_semestre">Semestre</button>'+
          '<button class="pill" data-type="annuale" id="tog_anno">Anno</button>'+
        '</div>'+
      '</div>'+

      // --- CORPO REPORT ---
      '<div class="card">'+
        '<b>Report</b>'+
        '<div class="row" style="margin-top:8px">'+
          '<div style="min-width:320px"><label>Oggetto email</label><input id="report_subject" placeholder="Report BP"></div>'+
        '</div>'+
        '<div class="row" style="margin-top:8px; flex-wrap:wrap">'+
          '<div style="flex:1 1 100%; min-width:0"><label>Corpo email</label>'+
            '<textarea id="report_body" rows="12" placeholder="Testo del report…"' +
              ' style="width:100%; box-sizing:border-box; overflow:auto; resize:vertical; max-height:70vh; white-space:pre-wrap; word-break:break-word"></textarea>'+
          '</div>'+
        '</div>'+
        '<div class="row" id="report-actions" style="gap:8px;margin-top:8px;flex-wrap:wrap">'+
          '<button class="ghost" id="rep_copy">Copia report</button>'+
          '<span style="flex:0 0 8px"></span>'+
          '<button class="ghost" id="rep_gmail_web">Gmail Web</button>'+
          '<button class="ghost" id="rep_gmail_app">Gmail App</button>'+
        '</div>'+
      '</div>'+

    '</div>';

  renderTopbar();

  // =========================
  // STATO E COSTANTI
  // =========================
  var ALL=[]; // /api/periods
  var SECTIONS = { mensile:false, trimestrale:false, semestrale:false, annuale:false };

  var INDICATORS = [
    {k:'VSS', money:true,  label:'VSS'},
    {k:'VSDPersonale', money:true,  label:'VSDPersonale'},
    {k:'VSDIndiretto', money:true,  label:'VSDIndiretto'},
    {k:'GI',  money:true,  label:'GI'},
    {k:'Telefonate', money:false, label:'Telefonate'},
    {k:'AppFissati', money:false, label:'AppFissati'},
    {k:'AppFatti', money:false, label:'AppFatti'},
    {k:'CorsiLeadership', money:false, label:'CorsiLeadership'},
    {k:'iProfile', money:false, label:'iProfile'},
    {k:'MBS', money:false, label:'MBS'},
    {k:'NNCF', money:false, label:'NNCF'}
  ];

  function $(id){ return document.getElementById(id); }
  var bodyEl = $('report_body');

  // =========================
  // HELPERS DATA/TIME
  // =========================
  function addDays(d,n){ var x=new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
  function addMonths(d,n){ var x=new Date(d.getTime()); x.setMonth(x.getMonth()+n); return x; }
  function weekBounds(d){ return weekBoundsOf(d.getFullYear(), isoWeekNum(d)); }
  function nextWeekBoundsFrom(d){ var wb=weekBounds(d); return weekBounds(addDays(wb.start,7)); }
  function itMonthName(d){ var a=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']; return a[d.getMonth()]; }
  function quarterOf(d){ return Math.floor(d.getMonth()/3)+1; }
  function semesterOf(d){ return (d.getMonth()<6)?1:2; }

  // finestra ven→dom per la parte settimanale
  function isWeekendWindow(now){ var wd = now.getDay(); return (wd===5 || wd===6 || wd===0); }

  // ===== bounds per tipo periodo
  function boundsOf(type, ref){
    if(type==='mensile')     return {start:startOfMonth(ref),     end:endOfMonth(ref)};
    if(type==='trimestrale') return {start:startOfQuarter(ref),   end:endOfQuarter(ref)};
    if(type==='semestrale')  return {start:startOfSemester(ref),  end:endOfSemester(ref)};
    return                     {start:startOfYear(ref),           end:endOfYear(ref)};
  }
  function monthsDelta(type){ return (type==='mensile')?1 : (type==='trimestrale')?3 : (type==='semestrale')?6 : 12; }

  // ===== finestra proposta: [-7, +5] giorni intorno alla fine del periodo
  function inProposalWindow(endDate, now){
    return ( now >= addDays(endDate,-7) && now <= addDays(endDate,5) );
  }

// Decide quale periodo è "in chiusura" e qual è il "successivo"
function pickClosingAndNext(type, now){
  // Periodo corrente ancorato ai confini
  var cur  = boundsOf(type, now);
  // Precedente = periodo che termina il giorno prima dell’inizio corrente
  var prev = boundsOf(type, addDays(cur.start, -1));
  // Successivo = periodo che inizia il giorno dopo la fine corrente
  var next = boundsOf(type, addDays(cur.end, +1));

  var nearPrev = inProposalWindow(prev.end, now);
  var nearCur  = inProposalWindow(cur.end,  now);

  // Nei 5 giorni dopo la fine del precedente → Cons=prev, Prev=cur
  // Altrimenti (nei 7 giorni prima / fine del corrente) → Cons=cur, Prev=next
  if(nearPrev && !nearCur) return {closing:prev, next:cur};
  return {closing:cur, next:next};
}


  // =========================
  // LETTURA DATI / API CACHED
  // =========================
  function findPeriod(type, start, end){
    for(var i=0;i<ALL.length;i++){
      var p=ALL[i];
      if(p.type!==type) continue;
      if(ymd(p.startDate)===ymd(start) && ymd(p.endDate)===ymd(end)) return p;
    }
    return null;
  }
  function vals(obj, key){ var v=(obj&&obj[key]); return Number(v||0); }

  // =========================
  // FORMATTERS
  // =========================
  function fmtMoney(n){ return fmtInt(n)+'€'; }
  function fmtVal(key, n){ var money = INDICATORS.some(function(i){ return i.k===key && i.money; }); return money ? fmtMoney(n) : fmtInt(n); }
  function arrow(cons, prev){ if(cons>prev) return '↑'; if(cons<prev) return '↓'; return '='; }

  // =========================
  // COSTRUZIONE BLOCCHI TESTO
  // =========================
  function buildConsuntivoBlock(title, type, start, end){
    var rec = findPeriod(type, start, end) || {};
    var prev = rec.indicatorsPrev || {};
    var cons = rec.indicatorsCons || {};
    var lines = [title, ''];
    INDICATORS.forEach(function(it){
      var pv = vals(prev, it.k), cs = vals(cons, it.k);
      lines.push(it.label+' '+fmtVal(it.k, cs)+' vs '+fmtVal(it.k, pv)+' di previsionali ('+arrow(cs,pv)+')');
    });
    lines.push('Note:');
    return lines.join('\n');
  }
  function buildPrevisionaleBlock(title, type, start, end){
    var rec = findPeriod(type, start, end) || {};
    var pv = rec.indicatorsPrev || {};
    var lines = [title, ''];
    INDICATORS.forEach(function(it){
      lines.push(it.label+' '+fmtVal(it.k, vals(pv,it.k)));
    });
    lines.push('Possibili note:');
    return lines.join('\n');
  }

  // titoli
  function titleConsSett(d){ return 'BP CONSUNTIVO SETT. '+isoWeekNum(d)+' '+d.getFullYear(); }
  function titlePrevSett(d){ return 'BP PREVISIONALE SETT. '+isoWeekNum(d)+' '+d.getFullYear(); }
  function titleConsMese(d){ return 'BP CONSUNTIVO '+itMonthName(d)+' '+d.getFullYear(); }
  function titlePrevMese(d){ var m=itMonthName(d); return 'BP PREVISIONALE '+m+' '+d.getFullYear(); }
  function titleConsTrim(d){ return 'BP CONSUNTIVO T'+quarterOf(d)+' '+d.getFullYear(); }
  function titlePrevTrim(d){ return 'BP PREVISIONALE T'+quarterOf(d)+' '+d.getFullYear(); }
  function titleConsSem(d){ return 'BP CONSUNTIVO S'+semesterOf(d)+' '+d.getFullYear(); }
  function titlePrevSem(d){ return 'BP PREVISIONALE S'+semesterOf(d)+' '+d.getFullYear(); }
  function titleConsAnno(d){ return 'BP CONSUNTIVO '+d.getFullYear(); }
  function titlePrevAnno(d){ return 'BP PREVISIONALE '+d.getFullYear(); }

  // ricostruisce tutto il corpo in base ai toggle + finestra weekend
  function rebuildBody(){
    var now = new Date();
    var blocks = [];

    // 1) SETTIMANA (solo ven→dom)
    if(isWeekendWindow(now)){
      var wb = weekBounds(now);
      var wbNext = nextWeekBoundsFrom(now);
      blocks.push( buildConsuntivoBlock(titleConsSett(wb.start), 'settimanale', wb.start, wb.end) );
      blocks.push( buildPrevisionaleBlock(titlePrevSett(wbNext.start), 'settimanale', wbNext.start, wbNext.end) );
    }

    // 2) PERIODI LUNGHI (in base ai toggle) con finestra [-7, +5] dal termine
    function addLong(type, titleCons, titlePrev){
      var pair = pickClosingAndNext(type, now); // {closing, next}
      blocks.push( buildConsuntivoBlock(titleCons(pair.closing.start), type, pair.closing.start, pair.closing.end) );
      blocks.push( buildPrevisionaleBlock(titlePrev(pair.next.start), type, pair.next.start, pair.next.end) );
    }

    if(SECTIONS.mensile)     addLong('mensile',     titleConsMese, titlePrevMese);
    if(SECTIONS.trimestrale) addLong('trimestrale', titleConsTrim, titlePrevTrim);
    if(SECTIONS.semestrale)  addLong('semestrale',  titleConsSem,  titlePrevSem);
    if(SECTIONS.annuale)     addLong('annuale',     titleConsAnno, titlePrevAnno);

    bodyEl.value = blocks.join('\n\n') + (blocks.length? '\n' : '');
  }

  // =========================
  // TOGGLES
  // =========================
  function setBtnActive(btn, on){ btn.classList.toggle('active', !!on); btn.style.opacity = on ? '1' : '0.65'; }
  function syncToggleButtons(){
    setBtnActive($('tog_mese'), SECTIONS.mensile);
    setBtnActive($('tog_trimestre'), SECTIONS.trimestrale);
    setBtnActive($('tog_semestre'), SECTIONS.semestrale);
    setBtnActive($('tog_anno'), SECTIONS.annuale);
  }
  function autoselectSectionsByDate(){
    var now=new Date();

    function autoOn(type){
  var cur  = boundsOf(type, now);
  var prev = boundsOf(type, addDays(cur.start, -1));
  return inProposalWindow(cur.end, now) || inProposalWindow(prev.end, now);
}


    SECTIONS.mensile     = autoOn('mensile');
    SECTIONS.trimestrale = autoOn('trimestrale');
    SECTIONS.semestrale  = autoOn('semestrale');
    SECTIONS.annuale     = autoOn('annuale');

    syncToggleButtons();
  }
  function bindToggles(){
    function onToggle(ev){
      var tp = ev.currentTarget.getAttribute('data-type');
      SECTIONS[tp] = !SECTIONS[tp]; // se deselezioni, rimuove il blocco
      syncToggleButtons();
      rebuildBody();
    }
    $('tog_mese').onclick = onToggle;
    $('tog_trimestre').onclick = onToggle;
    $('tog_semestre').onclick = onToggle;
    $('tog_anno').onclick = onToggle;
  }

  // =========================
  // GMAIL & COPIA
  // =========================
  function enc(s){ return encodeURIComponent(String(s||'')); }
  function bindActions(){
    var btnW=$('rep_gmail_web');
    var btnA=$('rep_gmail_app');
    var btnC=$('rep_copy');

    if(btnC){
      btnC.onclick=function(){
        try{
          navigator.clipboard.writeText(bodyEl.value||'');
          var old=btnC.textContent; btnC.textContent='Copiato!';
          setTimeout(function(){ btnC.textContent=old; }, 1200);
        }catch(e){}
      };
    }

    if(!btnW || !btnA) return;

    GET('/api/users_emails').then(function(r){
      var cc=((r&&r.emails)||((r&&r.users)||[]).map(function(u){return u.email;})).filter(Boolean).join(',');
      function subject(){ return $('report_subject').value || 'Report BP'; }
      function body(){ return bodyEl.value || ''; }

      btnW.onclick=function(){
        try{ navigator.clipboard.writeText(body()); }catch(e){}
        var url='https://mail.google.com/mail/?view=cm&fs=1&tf=1'
          +'&su='+enc(subject())+'&cc='+enc(cc)+'&body='+enc(body());
        window.open(url,'_blank');
document.dispatchEvent(new Event('report:composed'));
      };
      btnA.onclick=function(){
        try{ navigator.clipboard.writeText(body()); }catch(e){}
        var url='googlegmail:///co?subject='+enc(subject())+'&cc='+enc(cc)+'&body='+enc(body());
        location.href=url;
document.dispatchEvent(new Event('report:composed'));
        setTimeout(function(){
          if(!document.hidden){
            location.href='mailto:?subject='+enc(subject())+'&cc='+enc(cc)+'&body='+enc(body());
  document.dispatchEvent(new Event('report:composed'));
          }
        },1200);
      };
    });
  }

  // =========================
  // INIT
  // =========================
  function init(){
    GET('/api/periods').then(function(r){
      ALL = (r && r.periods) || [];
      autoselectSectionsByDate();  // auto ON quando siamo in finestra [-7,+5] dal termine del periodo
      bindToggles();
      rebuildBody();               // genera il corpo (settimana solo nel weekend)
      bindActions();
    });
  }

  init();
}
// ===== UTENTI (Admin e Profilo) =====
function viewUsers(){
  var me=getUser(); if(!me) return viewLogin();
  document.title = 'Battle Plan – Utenti';

  // Se non admin: mostra form "Profilo" solo per modificare i propri dati
  if(me.role !== 'admin'){
    appEl.innerHTML = topbarHTML()+
      '<div class="wrap">'+
        '<div class="card">'+
          '<b>Il mio profilo</b>'+
          '<div class="row" style="margin-top:8px">'+
            '<div><label>Nome</label><input id="p_name" type="text" value="'+htmlEscape(me.name||'')+'"></div>'+
            '<div><label>Email</label><input id="p_email" type="email" value="'+htmlEscape(me.email||'')+'"></div>'+
          '</div>'+
          '<div class="row">'+
            '<div><label>Nuova password</label><input id="p_pwd" type="password" placeholder="Lascia vuoto per non cambiare"></div>'+
            '<div class="right" style="align-self:flex-end"><button id="p_save">Aggiorna</button></div>'+
          '</div>'+
          '<div class="row">'+
            '<div><label>Ruolo</label><input value="'+htmlEscape(me.role||'consultant')+'" disabled></div>'+
            '<div><label>Grade</label><input value="'+htmlEscape(me.grade||'junior')+'" disabled></div>'+
          '</div>'+
        '</div>'+
      '</div>';
    renderTopbar();
    $1('#p_save').onclick=function(){
      var name = $1('#p_name').value.trim();
      var email= $1('#p_email').value.trim();
      var pwd  = $1('#p_pwd').value;
      var payload={ id: me.id, name:name, email:email };
      if(pwd) payload.password=pwd;
      POST('/api/users', payload).then(function(){
        toast('Profilo aggiornato'); window.addXP(3);
        var u=getUser(); if(u){ u.name=name; u.email=email; localStorage.setItem('user', JSON.stringify(u)); }
        try{ document.dispatchEvent(new Event('user:profile-updated')); }catch(_){ }
      }).catch(function(err){ logger.error(err); toast('Errore aggiornamento'); });
    };
    return;
  }

  // === Vista ADMIN ===
  appEl.innerHTML = topbarHTML()+
    '<div class="wrap">'+
      '<div class="card">'+
        '<b>Gestione utenti</b>'+
        '<div id="users_list" class="row" style="margin-top:8px"></div>'+
      '</div>'+
    '</div>';
  renderTopbar();

  function row(u){
    var name = htmlEscape(u.name || u.email || ('user_'+u.id));
    var grade = (u.grade==='senior'?'senior':'junior');
    var role = (u.role==='admin'?'admin':'consultant');
    return ''+
      '<div class="card" style="flex:1 1 380px">'+
        '<div><b>'+name+'</b> <span class="small muted">('+htmlEscape(role)+')</span></div>'+
        '<div class="row" style="margin-top:6px">'+
          '<div><label>Nome</label><input data-nfor="'+u.id+'" type="text" value="'+htmlEscape(u.name||'')+'"></div>'+
          '<div><label>Email</label><input data-efor="'+u.id+'" type="email" value="'+htmlEscape(u.email||'')+'"></div>'+
        '</div>'+
        '<div class="row">'+
          '<div><label>Nuova password</label><input data-pfor="'+u.id+'" type="password" placeholder="(opzionale)"></div>'+
          '<div><label>Grade</label>'+
            '<select data-gfor="'+u.id+'">'+
              '<option value="junior"'+(grade==='junior'?' selected':'')+'>Junior</option>'+
              '<option value="senior"'+(grade==='senior'?' selected':'')+'>Senior</option>'+
            '</select>'+
          '</div>'+
          '<div><label>Ruolo</label>'+
            '<select data-rfor="'+u.id+'">'+
              '<option value="consultant"'+(role==='consultant'?' selected':'')+'>Consulente</option>'+
              '<option value="admin"'+(role==='admin'?' selected':'')+'>Admin</option>'+
            '</select>'+
          '</div>'+
          '<div class="right" style="align-self:flex-end">'+
            '<button class="ghost" data-save="'+u.id+'">Aggiorna</button> '+
            '<button class="danger" data-del="'+u.id+'" title="Elimina utente">Elimina</button>'+
          '</div>'+
        '</div>'+
      '</div>';
  }

  function loadUsers(){
    GET('/api/users').then(function(r){
      var list=(r&&r.users)||[];
      var host=$1('#users_list'); if(!host) return;
      host.innerHTML = list.map(row).join('');
      $all('[data-save]').forEach(function(bt){
        bt.addEventListener('click', function(){
          var id = bt.getAttribute('data-save');
          var name = ($1('input[data-nfor="'+id+'"]')||{}).value||'';
          var email= ($1('input[data-efor="'+id+'"]')||{}).value||'';
          var grade= ($1('select[data-gfor="'+id+'"]')||{}).value||'junior';
          var role = ($1('select[data-rfor="'+id+'"]')||{}).value||'consultant';
          var pwdEl =  $1('input[data-pfor="'+id+'"]'); var pwd = pwdEl?pwdEl.value:'';
          var payload={ id:id, name:name, email:email, grade:grade, role:role };
          if(pwd) payload.password=pwd;
          POST('/api/users', payload).then(function(){
            toast('Aggiornato'); window.addXP(5);
            if(pwdEl) pwdEl.value='';
          }).catch(function(err){ logger.error(err); toast('Errore aggiornamento'); });
        });
      });
      $all('[data-del]').forEach(function(bt){
        bt.addEventListener('click', function(){
          var id = bt.getAttribute('data-del');
          if(!confirm('Eliminare definitivamente questo utente?')) return;
          fetch('/api/users?id='+encodeURIComponent(id), { method:'DELETE', headers:{ 'Authorization':'Bearer '+getToken() } })
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(){ toast('Utente eliminato'); loadUsers(); })
            .catch(function(err){ logger.error(err); toast('Errore eliminazione'); });
        });
      });
    });
  }
  loadUsers();
}


// ====== EXPORT UI FUNZIONI GLOBALI + BOOT ======
window.viewHome         = viewHome;
window.viewCalendar     = viewCalendar;
window.viewPeriods      = viewPeriods;
window.viewAppointments = viewAppointments;
window.viewLeaderboard  = viewLeaderboard;
window.viewClients      = viewClients;
window.viewTeam         = viewTeam;
window.viewCommissions  = viewCommissions;
window.viewReport       = viewReport;
window.viewUsers        = viewUsers;
window.toggleDrawer     = toggleDrawer;
window.logout           = logout;
window.rerenderTopbarSoon = rerenderTopbarSoon;

// boot
document.addEventListener('DOMContentLoaded', function () {
  if (getUser()) {
    renderTopbar();
    viewHome();
  } else {
    viewLogin();
  }
});

// === fine IIFE (chiusura unica) ===
})();

