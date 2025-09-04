#!/usr/bin/env node
// Quick smoke test for bucket labels across granularities

function effectivePeriodType(gran){
  const g = String(gran||'mensile').toLowerCase();
  return (g==='ytd' || g==='ltm') ? 'mensile' : g;
}

function toUTC(y,m,d){ return new Date(Date.UTC(y,m,d)); }
function eodUTC(dt){ return new Date(dt.getTime() + 24*3600*1000 - 1); }
function lastOfMonth(y,m){ return new Date(Date.UTC(y,m+1,0)); }

function isoWeekNum(date){
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7, Mon..Sun
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function buildBuckets(type, ref){
  const raw = String(type||'mensile').toLowerCase();
  const t = effectivePeriodType(raw);
  const now = ref ? new Date(ref) : new Date();
  const y = now.getUTCFullYear();
  const buckets = [];
  const push = (s,e) => buckets.push({ s:s.getTime(), e:e.getTime() });

  if (raw==='ytd'){
    for (let m=0; m<=now.getUTCMonth(); m++){
      const s = toUTC(now.getUTCFullYear(), m, 1);
      const e = eodUTC(lastOfMonth(s.getUTCFullYear(), s.getUTCMonth()));
      push(s,e);
    }
    return buckets;
  }
  if (raw==='ltm'){
    const mRef = toUTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    for (let k=11; k>=0; k--){
      const m0 = toUTC(mRef.getUTCFullYear(), mRef.getUTCMonth()-k, 1);
      const e0 = eodUTC(lastOfMonth(m0.getUTCFullYear(), m0.getUTCMonth()));
      push(m0, e0);
    }
    return buckets;
  }

  if (t==='settimanale'){
    const cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = (cur.getUTCDay()+6)%7; cur.setUTCDate(cur.getUTCDate()-day);
    for (let i=52;i>=0;i--){
      const start = new Date(cur); start.setUTCDate(cur.getUTCDate()-i*7);
      const end   = new Date(start); end.setUTCDate(start.getUTCDate()+6); end.setUTCHours(23,59,59,999);
      push(start,end);
    }
    return buckets;
  }
  if (t==='mensile'){
    const mRef = toUTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    for (let k=23;k>=0;k--){
      const m = toUTC(mRef.getUTCFullYear(), mRef.getUTCMonth()-k, 1);
      push(m, eodUTC(lastOfMonth(m.getUTCFullYear(), m.getUTCMonth())));
    }
    return buckets;
  }
  if (t==='trimestrale'){
    const baseQ = Math.floor(now.getUTCMonth()/3);
    for (let q=11;q>=0;q--){
      const qM = (baseQ - q);
      const yq = y + Math.floor(qM/4);
      const mq = ((qM%4)+4)%4;
      const start = toUTC(yq, mq*3, 1);
      const end   = eodUTC(new Date(Date.UTC(yq, mq*3+3, 0)));
      push(start,end);
    }
    return buckets;
  }
  if (t==='semestrale'){
    const baseS = (now.getUTCMonth()<6)?0:1;
    for (let sIdx=5;sIdx>=0;sIdx--){
      const si  = baseS - sIdx;
      const ys  = y + Math.floor(si/2);
      const hs  = ((si%2)+2)%2;
      const sm  = (hs===0)?0:6;
      const startS = toUTC(ys, sm, 1);
      const endS   = eodUTC(new Date(Date.UTC(ys, sm+6, 0)));
      push(startS, endS);
    }
    return buckets;
  }
  // annuale: ultimi 3 anni
  for (let yy=2; yy>=0; yy--){
    const ya = y - yy;
    push(toUTC(ya,0,1), eodUTC(new Date(Date.UTC(ya,12,0))));
  }
  return buckets;
}

function labelsForBuckets(type, buckets){
  const t = effectivePeriodType(type||'mensile');
  return (buckets||[]).map(B => {
    const d = new Date(B.s);
    if (t==='settimanale')  return 'W'+String(isoWeekNum(d)).padStart(2,'0')+' '+d.getUTCFullYear();
    if (t==='mensile')      return String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
    if (t==='trimestrale')  return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear();
    if (t==='semestrale')   return (d.getUTCMonth()<6?'S1 ':'S2 ')+d.getUTCFullYear();
    return String(d.getUTCFullYear());
  });
}

function printSample(type){
  const B = buildBuckets(type, new Date());
  const L = labelsForBuckets(type, B);
  const show = (arr) => arr.length<=10 ? arr : [...arr.slice(0,3), '…', ...arr.slice(-3)];
  console.log(`${type} => count=${L.length}`);
  console.log('  ', show(L).join(' | '));
}

['settimanale','mensile','ytd','ltm','trimestrale','semestrale','annuale'].forEach(printSample);

