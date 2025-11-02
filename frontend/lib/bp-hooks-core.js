// bp-hooks-core.js — core helpers unificati (users preload, period types, buckets, labels)
(function(){
  // ----------------------------- Auth token & preload users
  function coreAuthToken(){
    const strip = v => String(v).replace(/^"+|"+$/g, '');
    const maybeJwt = v => /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(v||'');
    const keys = ['token','authToken','jwt','bp_token','accessToken','id_token'];
    for (const k of keys){
      let v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (!v) continue;
      try { const o = JSON.parse(v); if (o && (o.token||o.jwt||o.accessToken)) return o.token||o.jwt||o.accessToken; } catch(_){}
      v = strip(v);
      if (maybeJwt(v)) return v;
    }
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u && (u.token || u.jwt || u.accessToken)) return u.token || u.jwt || u.accessToken;
    } catch(_){}
    return null;
  }
  if (typeof window.users === 'undefined') window.users = [];
  // Contatore di tentativi per evitare loop infiniti
  let __preloadUsersAttempts = 0;
  const MAX_PRELOAD_ATTEMPTS = 2; // Massimo 2 tentativi
  (async function preloadUsers(){
    // Non fare retry se è stato rilevato un 401 globale
    if (window.__BP_401_DETECTED === true) {
      console.log('[preloadUsers] 401 già rilevato globalmente, skip');
      return;
    }
    
    // Ferma dopo un numero massimo di tentativi
    if (__preloadUsersAttempts >= MAX_PRELOAD_ATTEMPTS) {
      console.log('[preloadUsers] Massimo numero di tentativi raggiunto, skip');
      return;
    }
    
    // Controlla se c'è un token prima di fare la richiesta
    const t = coreAuthToken();
    if (!t) {
      console.log('[preloadUsers] Nessun token trovato, skip');
      return;
    }
    
    __preloadUsersAttempts++;
    try{
      if (window.GET) {
        try {
          const j = await window.GET('/api/usernames');
          if (j && Array.isArray(j.users)) window.users = j.users;
          return;
        } catch (e) {
          // Se window.GET lancia errore per 401, non fare retry
          if (window.__BP_401_DETECTED === true) return;
          throw e;
        }
      }
      const r = await fetch('/api/usernames', {
        headers: { 'Accept': 'application/json', ...(t?{ 'Authorization':'Bearer '+t }: {}) }
      });
      
      // Se riceviamo 401, NON fare retry - l'utente non è autenticato
      if (r.status === 401) {
        console.log('[preloadUsers] 401 ricevuto, non autenticato, stop');
        if (typeof window.__BP_401_DETECTED !== 'undefined') {
          window.__BP_401_DETECTED = true;
        }
        return;
      }
      
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.users)) window.users = j.users;
      }
    }catch(e){
      // Solo se NON è un 401 e abbiamo ancora tentativi disponibili
      if (window.__BP_401_DETECTED === true || __preloadUsersAttempts >= MAX_PRELOAD_ATTEMPTS) {
        return;
      }
      // Attendi un po' prima di riprovare solo se abbiamo ancora tentativi
      setTimeout(preloadUsers, 1200);
    }
  })();

  // ----------------------------- Period type helpers (provided by globals-polyfills.js)

  // ----------------------------- Buckets (rolling windows, coerenti con Dashboard & Squadra)
  function toUTC(y,m,d){ return new Date(Date.UTC(y,m,d)); }
  function eodUTC(dt){ return new Date(dt.getTime() + 24*3600*1000 - 1); }
  function lastOfMonth(y,m){ return new Date(Date.UTC(y,m+1,0)); }

  if (typeof window.buildBuckets !== 'function'){
    window.buildBuckets = function(type, ref){
      var raw = String(type||'mensile').toLowerCase();
      var t   = effectivePeriodType(raw);
      var now = ref ? new Date(ref) : new Date();
      var y   = now.getUTCFullYear();
      var buckets = [];
      function push(s,e){ buckets.push({s:s.getTime(), e:e.getTime()}); }

      // Special cases: YTD and LTM use monthly buckets with custom spans
      if (raw==='ytd'){
        // From January to current month (inclusive) of current year
        for (var m=0; m<=now.getUTCMonth(); m++){
          var s = toUTC(now.getUTCFullYear(), m, 1);
          var e = eodUTC(lastOfMonth(s.getUTCFullYear(), s.getUTCMonth()));
          push(s,e);
        }
        return buckets;
      }
      if (raw==='ltm'){
        // Last 12 months rolling up to current month
        var mRef = toUTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
        for (var k=11; k>=0; k--){
          var m = toUTC(mRef.getUTCFullYear(), mRef.getUTCMonth()-k, 1);
          push(m, eodUTC(lastOfMonth(m.getUTCFullYear(), m.getUTCMonth())));
        }
        return buckets;
      }

      if (t==='settimanale'){
        var cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        var day = (cur.getUTCDay()+6)%7; cur.setUTCDate(cur.getUTCDate()-day);
        for (var w=52; w>=0; w--){
          var start = new Date(cur); start.setUTCDate(cur.getUTCDate()-w*7);
          var end   = new Date(start); end.setUTCDate(start.getUTCDate()+6); end.setUTCHours(23,59,59,999);
          push(start,end);
        }
        return buckets;
      }
      if (t==='mensile'){
        var mRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        for (var k=23;k>=0;k--){
          var m = new Date(Date.UTC(mRef.getUTCFullYear(), mRef.getUTCMonth()-k, 1));
          push(m, eodUTC(lastOfMonth(m.getUTCFullYear(), m.getUTCMonth())));
        }
        return buckets;
      }
      if (t==='trimestrale'){
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
      // annuale: ultimi 3 anni
      for (var yy=2; yy>=0; yy--){
        var ya = y - yy;
        push(toUTC(ya,0,1), eodUTC(new Date(Date.UTC(ya,12,0))));
      }
      return buckets;
    };
  }

  if (typeof window.labelsForBuckets !== 'function'){
      window.labelsForBuckets = function(type, buckets){
        var t = effectivePeriodType(type||'mensile');
        return (buckets||[]).map(function(B){
          var d = new Date(B.s);
          if (t==='settimanale')  return 'W'+isoWeekNum(d)+' '+d.getUTCFullYear();
          if (t==='mensile')      return String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
          if (t==='trimestrale')  return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear();
          if (t==='semestrale')   return (d.getUTCMonth()<6?'S1 ':'S2 ')+d.getUTCFullYear();
          return String(d.getUTCFullYear());
        });
      };
  }

  // ----------------------------- Sum indicator helper (compat main)
  if (typeof window.sumIndicator !== 'function'){
    window.sumIndicator = function(period, mode, key){
      var bag = (String(mode).toLowerCase()==='previsionale')
        ? (period.indicatorsPrev || {})
        : (period.indicatorsCons || {});
      if (key === 'VSDTotale'){
        return Number(bag.VSDPersonale||0) + Number(bag.VSDIndiretto||0);
      }
      var v = Number(bag[key] ?? bag[key.toUpperCase()] ?? 0);
      return Number.isFinite(v) ? v : 0;
    };
  }

  // ----------------------------- Chart.js global defaults + plugin for line charts
  (function ensureChartGlobalTicks(){
    try{
      if (typeof window.Chart === 'undefined') return;

      // Generic label callback: map index/value to the actual category label
      function labelCb(value, index){
        try{ if (this && typeof this.getLabelForValue==='function') return String(this.getLabelForValue(value)); }catch(_){ }
        try{
          var i = (typeof value==='number') ? value : index;
          var arr = (this && this.chart && this.chart.data && this.chart.data.labels) || [];
          var lab = (Array.isArray(arr) ? arr[i] : undefined);
          return String(lab!=null ? lab : value);
        }catch(_){ return String(value); }
      }

      try{
        Chart.defaults = Chart.defaults || {};
        Chart.defaults.scales = Chart.defaults.scales || {};
        Chart.defaults.scales.category = Chart.defaults.scales.category || {};
        Chart.defaults.scales.category.ticks = Object.assign({}, Chart.defaults.scales.category.ticks || {}, { callback: labelCb });
      }catch(_){ }

      // Plugin: auto-apply tick options (rotation/autoskip) to all line charts
      var plugin = {
        id: 'bpAutoTicks',
        beforeUpdate: function(chart){
          try{
            if (!chart || (chart.config && chart.config.type) !== 'line') return;
            var labels = (chart.config && chart.config.data && chart.config.data.labels) || [];
            var w = (chart.canvas && (chart.canvas.clientWidth || chart.canvas.width)) || 320;
            function compute(labelsArr, width){
              try{
                var n = Array.isArray(labelsArr) ? labelsArr.length : 0;
                if(!n) return { autoSkip:true, maxRotation:0, minRotation:0, callback: labelCb };
                var maxLen = 0; for(var i=0;i<labelsArr.length;i++){ var s = ''+(labelsArr[i]==null?'':labelsArr[i]); if (s.length>maxLen) maxLen=s.length; }
                var estPer = Math.max(28, Math.min(90, Math.round(maxLen * 7)));
                var need = n * estPer;
                if(need > (width||320)*1.2){
                  return { autoSkip:true, maxRotation:45, minRotation:45, callback: labelCb };
                }
                return { autoSkip:true, maxRotation:0, minRotation:0, callback: labelCb };
              }catch(_){ return { autoSkip:true, maxRotation:0, minRotation:0, callback: labelCb }; }
            }
            var fn = (typeof window.computeTickOptions==='function') ? window.computeTickOptions : compute;
            var tickOpts = fn(labels, w);
            chart.options = chart.options || {};
            chart.options.scales = chart.options.scales || {};
            var x = chart.options.scales.x || (chart.options.scales.x = { display:true });
            x.ticks = Object.assign({}, x.ticks || {}, tickOpts);
          }catch(_){ }
        }
      };
      try{ if (Chart.register) Chart.register(plugin); else if (Chart.plugins && Chart.plugins.register) Chart.plugins.register(plugin); }catch(_){ }
    }catch(_){ }
  })();

})();
