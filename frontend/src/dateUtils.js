export function pad2(n){ return (n<10?'0':'')+n; }
export function dmy(d){ const x=new Date(d); return pad2(x.getDate())+'/'+pad2(x.getMonth()+1)+'/'+x.getFullYear(); }
export function ymd(d){ const x=new Date(d); return x.getFullYear()+'-'+pad2(x.getMonth()+1)+'-'+pad2(x.getDate()); }
export function timeHM(d){ const x=new Date(d); return pad2(x.getHours())+':'+pad2(x.getMinutes()); }

export function startOfWeek(d){
  const x=new Date(d); x.setHours(0,0,0,0);
  const diff=(x.getDay()+6)%7;
  x.setDate(x.getDate()-diff);
  return x;
}
export function endOfWeek(d){ const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }

export function startOfMonth(d){ const x=new Date(d); return new Date(x.getFullYear(), x.getMonth(), 1); }
export function endOfMonth(d){ const x=new Date(d); return new Date(x.getFullYear(), x.getMonth()+1, 0, 23,59,59,999); }

export function isoWeekNum(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart)/86400000)+1)/7);
}

export function startOfQuarter(d){ const x=new Date(d), q=Math.floor(x.getMonth()/3); return new Date(x.getFullYear(), q*3, 1); }
export function endOfQuarter(d){ const s=startOfQuarter(d); return new Date(s.getFullYear(), s.getMonth()+3, 0, 23,59,59,999); }
export function startOfSemester(d){ const x=new Date(d), s=(x.getMonth()<6?0:6); return new Date(x.getFullYear(), s, 1); }
export function endOfSemester(d){ const s=startOfSemester(d); return new Date(s.getFullYear(), s.getMonth()+6, 0, 23,59,59,999); }
export function startOfYear(d){ const x=new Date(d); return new Date(x.getFullYear(),0,1); }
export function endOfYear(d){ const x=new Date(d); return new Date(x.getFullYear(),11,31, 23,59,59,999); }

export function startOfIsoWeek(y, w){
  const simple = new Date(y,0,1 + (w-1)*7);
  const dow = simple.getDay() || 7;
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - (dow-1));
  monday.setHours(0,0,0,0);
  return monday;
}
export function weekBoundsOf(y, w){ const s=startOfIsoWeek(y,w); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return {start:s,end:e}; }

export function nextWeekBounds(from){ const s=startOfWeek(from); s.setDate(s.getDate()+7); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return {start:s,end:e}; }
export function prevWeekBounds(from){ const s=startOfWeek(from); s.setDate(s.getDate()-7); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return {start:s,end:e}; }
export function nextMonthBounds(from){ const x=new Date(from.getFullYear(), from.getMonth()+1, 1); return {start:x, end:new Date(x.getFullYear(), x.getMonth()+1, 0, 23,59,59,999)}; }
export function prevMonthBounds(from){ const x=new Date(from.getFullYear(), from.getMonth(), 0, 23,59,59,999); return {start:new Date(x.getFullYear(), x.getMonth(), 1), end:x}; }
export function nextQuarterBounds(from){ const s=startOfQuarter(new Date(from.getFullYear(), from.getMonth()+3, 1)); return {start:s, end:new Date(s.getFullYear(), s.getMonth()+3, 0, 23,59,59,999)}; }
export function prevQuarterBounds(from){ const s=startOfQuarter(new Date(from.getFullYear(), from.getMonth()-3, 1)); return {start:s, end:new Date(s.getFullYear(), s.getMonth()+3, 0, 23,59,59,999)}; }
export function nextSemesterBounds(from){ const s=startOfSemester(new Date(from.getFullYear(), from.getMonth()+6, 1)); return {start:s, end:new Date(s.getFullYear(), s.getMonth()+6, 0, 23,59,59,999)}; }
export function prevSemesterBounds(from){ const s=startOfSemester(new Date(from.getFullYear(), from.getMonth()-6, 1)); return {start:s, end:new Date(s.getFullYear(), s.getMonth()+6, 0, 23,59,59,999)}; }
export function nextYearBounds(from){ const s=startOfYear(new Date(from.getFullYear()+1,0,1)); return {start:s, end:endOfYear(s)}; }
export function prevYearBounds(from){ const s=startOfYear(new Date(from.getFullYear()-1,0,1)); return {start:s, end:endOfYear(s)}; }

export function formatPeriodLabel(type, s){
  const d=new Date(s);
  if(type==='settimanale') return 'Sett. '+isoWeekNum(new Date(s))+' '+d.getFullYear();
  if(type==='mensile')     return d.toLocaleString('it-IT',{month:'long', year:'numeric'});
  if(type==='trimestrale'){ const q=Math.floor(d.getMonth()/3)+1; return 'Trimestre '+q+' '+d.getFullYear(); }
  if(type==='semestrale')  return (d.getMonth()<6?'1°':'2°')+' semestre '+d.getFullYear();
  if(type==='annuale')     return 'Anno '+d.getFullYear();
  if(type==='ytd')         return 'YTD '+d.getFullYear();
  if(type==='ltm')         return 'Ultimi 12 mesi';
  return type;
}
