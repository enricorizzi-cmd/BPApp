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
  (async function preloadUsers(){
    try{
      if (window.GET) {
        const j = await window.GET('/api/usernames');
        if (j && Array.isArray(j.users)) window.users = j.users;
        return;
      }
      const t = coreAuthToken();
      const r = await fetch('/api/usernames', {
        headers: { 'Accept': 'application/json', ...(t?{ 'Authorization':'Bearer '+t }: {}) }
      });
      if (r.status === 401) { setTimeout(preloadUsers, 800); return; }
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.users)) window.users = j.users;
      }
    }catch(_){ setTimeout(preloadUsers, 1200); }
  })();

  // ----------------------------- Period type helpers
  if (typeof window.effectivePeriodType !== 'function'){
    window.effectivePeriodType = function(gran){
      var g = String(gran||'mensile').toLowerCase();
      if (g==='ytd' || g==='ltm') return 'mensile';
      if (g.startsWith('sett')) return 'settimanale';
      if (g.startsWith('mes'))  return 'mensile';
      if (g.startsWith('tri'))  return 'trimestrale';
      if (g.startsWith('sem'))  return 'semestrale';
      if (g.startsWith('ann'))  return 'annuale';
      return 'mensile';
    };
  }
  if (typeof window.isoWeekNum !== 'function'){
    window.isoWeekNum = function(d){
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(date.getUTCFullYear(),0,4));
      const diff = date - firstThursday;
      return 1 + Math.round(diff / (7*24*3600*1000));
    };
  }

  // ----------------------------- Buckets (rolling windows, coerenti con Dashboard & Squadra)
  function toUTC(y,m,d){ return new Date(Date.UTC(y,m,d)); }
  function eodUTC(dt){ return new Date(dt.getTime() + 24*3600*1000 - 1); }
  function lastOfMonth(y,m){ return new Date(Date.UTC(y,m+1,0)); }

  if (typeof window.buildBuckets !== 'function'){
    window.buildBuckets = function(type, ref){
      var raw = String(type||'mensile').toLowerCase();
      var t   = window.effectivePeriodType(raw);
      var now = ref ? new Date(ref) : new Date();
      var y   = now.getUTCFullYear();
      var buckets = [];
      function push(s,e){ buckets.push({s:s.getTime(), e:e.getTime()}); }

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
      var t = window.effectivePeriodType(type||'mensile');
      return (buckets||[]).map(function(B){
        var d = new Date(B.s);
        if (t==='settimanale')  return 'W'+window.isoWeekNum(d);
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

})();
