const DAY = 86400000;

function effectivePeriodType(gran){
  return (gran === 'ytd' || gran === 'ltm') ? 'mensile' : gran;
}

function overlapsAny(aStart, aEnd, bStart, bEnd){
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  if([as,ae,bs,be].some(isNaN)) return false;
  return as <= be && bs <= ae;
}

function filterByTypeAndRange(periods, type, from, to){
  const t = effectivePeriodType(type);
  return (periods||[]).filter(p => (!t || p.type === t) && overlapsAny(p.startDate, p.endDate, from, to));
}

// Heuristica: periodo "attivo" per utente in base a ultimi 60 giorni
function pickActivePeriodType(periods, userId){
  const order = ['mensile','settimanale','trimestrale','semestrale','annuale'];
  const now = Date.now(), cutoff = now - 60*DAY;
  const got = new Set();
  (periods||[]).forEach(p=>{
    if(String(p.userId)!==String(userId)) return;
    const ps = new Date(p.startDate).getTime();
    const pe = new Date(p.endDate).getTime();
    if(isNaN(ps)||isNaN(pe)) return;
    if(pe >= cutoff) got.add(p.type);
  });
  for(const t of order){ if(got.has(t)) return t; }
  return 'mensile';
}

function periodContains(period, whenTs){
  const ps = new Date(period.startDate).getTime();
  const pe = new Date(period.endDate).getTime();
  return ![ps,pe].some(isNaN) && ps <= whenTs && whenTs <= pe;
}

function findCurrentPeriod(periods, userId, type, whenTs){
  const t = effectivePeriodType(type);
  return (periods||[]).find(p => String(p.userId)===String(userId) && p.type===t && periodContains(p, whenTs));
}

function findLastClosedPeriod(periods, userId, type, whenTs){
  const t = effectivePeriodType(type);
  let best=null, bestEnd=-Infinity;
  (periods||[]).forEach(p=>{
    if(String(p.userId)!==String(userId)) return;
    if(p.type!==t) return;
    const pe = new Date(p.endDate).getTime();
    if(isNaN(pe) || pe > whenTs) return;
    if(pe > bestEnd){ best=p; bestEnd=pe; }
  });
  return best;
}

module.exports = {
  effectivePeriodType,
  overlapsAny,
  filterByTypeAndRange,
  pickActivePeriodType,
  findCurrentPeriod,
  findLastClosedPeriod,
};