"use strict";

const fs = require('fs');
const path = require('path');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

function parseCsv(file){
  const txt = fs.readFileSync(file, 'utf8').trim();
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const row = {};
    headers.forEach((h,i) => row[h] = cols[i] || '');
    return row;
  });
}

function weekBounds(year, week){
  const simple = new Date(year,0,1 + (week-1)*7);
  const dow = simple.getDay();
  const start = new Date(simple);
  const diff = (dow<=4 ? dow-1 : dow-8); // Monday start
  start.setDate(simple.getDate() - diff);
  const end = new Date(start);
  end.setDate(start.getDate()+6);
  return { start, end };
}
function monthBounds(year, month){
  const start = new Date(year, month-1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}
function quarterBounds(year, quarter){
  const startM = (quarter-1)*3 + 1;
  return { start: new Date(year, startM-1, 1), end: new Date(year, startM+2, 0) };
}
function semesterBounds(year, semester){
  const startM = (semester===1) ? 1 : 7;
  const endM = (semester===1) ? 6 : 12;
  return { start: new Date(year, startM-1, 1), end: new Date(year, endM, 0) };
}
function yearBounds(year){
  return { start: new Date(year,0,1), end: new Date(year,12,0) };
}

const DEFAULT_INDICATORS = [
  'VSS','VSDPersonale','VSDIndiretto','GI','Telefonate','AppFissati','AppFatti','CorsiLeadership','iProfile','MBS','NNCF'
];
function normalizeBag(bag, baseIndicators){
  const out = { ...(bag||{}) };
  const list = Array.isArray(baseIndicators) && baseIndicators.length ? baseIndicators : DEFAULT_INDICATORS;
  for(const k of list){ out[k] = Number(out[k]||0); }
  if(out.ProvvGI==null) out.ProvvGI = 0;
  if(out.ProvvVSD==null) out.ProvvVSD = 0;
  if(out.TotProvvigioni==null) out.TotProvvigioni = 0;
  return out;
}

function computeProvvigioni(bag, grade){
  const gi  = Number(bag.GI||0);
  const vsd = Number(bag.VSDPersonale||0);
  const rateGi = 0.15;
  const rateVsd = (grade==='senior') ? 0.25 : 0.20;
  const provGi = gi * rateGi;
  const provVsd = vsd * rateVsd;
  bag.ProvvGI = Number.isFinite(provGi) ? provGi : 0;
  bag.ProvvVSD = Number.isFinite(provVsd) ? provVsd : 0;
  bag.TotProvvigioni = bag.ProvvGI + bag.ProvvVSD;
}

function pickUserId(usersDb, providedUserId) {
  if (providedUserId) return providedUserId;
  const firstAdmin = (usersDb.users || []).find((x) => x.role === 'admin');
  const firstAny = (usersDb.users || [])[0];
  if (!firstAdmin && !firstAny) throw new Error('No users found. Provide --user-id=...');
  return (firstAdmin || firstAny).id;
}

function loadUsersDb(usersPath) {
  try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch (_) { return { users: [] }; }
}

function loadBaseIndicators(settingsPath) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (s && Array.isArray(s.indicators) && s.indicators.length) return s.indicators;
  } catch (_) {}
  return DEFAULT_INDICATORS;
}

function makeGranHelpers(year) {
  const keyFor = {
    settimanale: (r) => String(r.settimana || ''),
    mensile: (r) => String(r.mese || ''),
    trimestrale: (r) => String(r.trimestre || ''),
    semestrale: (r) => String(r.semestre || ''),
    annuale: (r) => String(r.anno || year),
  };
  const boundsFor = {
    settimanale: (r) => {
      const w = Number(r.settimana || 0);
      if (!w) return null;
      return weekBounds(Number(year), w);
    },
    mensile: (r) => {
      const m = Number(r.mese || 0);
      if (!m) return null;
      return monthBounds(Number(year), m);
    },
    trimestrale: (r) => {
      const q = Number(r.trimestre || 0);
      if (!q) return null;
      return quarterBounds(Number(year), q);
    },
    semestrale: (r) => {
      const h = Number(r.semestre || 0);
      if (!h) return null;
      return semesterBounds(Number(year), h);
    },
    annuale: (r) => {
      const y = Number(r.anno || year) || Number(year);
      return yearBounds(y);
    },
  };
  return { keyFor, boundsFor };
}

function main(){
  const root = process.argv[2] || path.join(process.cwd(), 'tmp_bp_exports');
  const userIdArg = process.argv.find(a => a.startsWith('--user-id='));
  let userId = userIdArg ? userIdArg.split('=')[1] : null;

  const usersPath = path.join(__dirname, '..', 'data', 'users.json');
  const usersDb = loadUsersDb(usersPath);
  if(!userId) userId = pickUserId(usersDb, userId);
  const grade = ((usersDb.users||[]).find(u => u.id===userId)||{}).grade || 'junior';

  // try to load base indicators from settings.json
  const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
  const baseIndicators = loadBaseIndicators(settingsPath);

  const out = { periods: [] };
  const map = new Map(); // key -> obj
  function keyOf(type, s, e){ return [userId, type, s.toISOString().slice(0,10), e.toISOString().slice(0,10)].join('|'); }
  function ensure(type, s, e){
    const key = keyOf(type, s, e);
    let o = map.get(key);
    if(!o){
      o = { id: nanoid(), userId, type, startDate: s.toISOString(), endDate: e.toISOString(), indicatorsPrev: {}, indicatorsCons: {} };
      map.set(key, o);
    }
    return o;
  }
  function applyRow(o, which, row){
    // map CSV cols to indicators
    const bag = o[which];
    bag.VSS = (bag.VSS||0) + Number(row.vss||0);
    bag.VSDPersonale = (bag.VSDPersonale||0) + Number(row.vsdpersonale||0);
    bag.VSDIndiretto = (bag.VSDIndiretto||0) + Number(row.vsdindiretto||0);
    bag.NNCF = (bag.NNCF||0) + Number(row.nncf||0);
  }

  function processYearDir(gran, year){
    const dir = path.join(root, gran, String(year));
    if(!fs.existsSync(dir)) return;
    const prevFiles = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('_prev.csv'));
    const consFiles = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('_cons.csv'));
    const prev = prevFiles[0] ? parseCsv(path.join(dir, prevFiles[0])) : [];
    const cons = consFiles[0] ? parseCsv(path.join(dir, consFiles[0])) : [];
    const { keyFor, boundsFor } = makeGranHelpers(year);
    const consMap = new Map(cons.map((r) => [keyFor[gran](r), r]));

    for(const r of prev){
      const b = boundsFor[gran](r);
      if (!b) continue;
      const o = ensure(gran, b.start, b.end);
      applyRow(o, 'indicatorsPrev', r);
      const rc = consMap.get(keyFor[gran](r)) || r; // fallback: same as prev
      applyRow(o, 'indicatorsCons', rc);
    }
  }

  function processAllGranularities() {
    const grans = ['settimanale','mensile','trimestrale','semestrale','annuale'];
    for (const g of grans) {
      const gdir = path.join(root, g);
      if (!fs.existsSync(gdir)) continue;
      const years = fs.readdirSync(gdir).filter((x) => /^\d{4}$/.test(x));
      for (const y of years) processYearDir(g, y);
    }
  }

  processAllGranularities();

  // finalize: normalize + compute provvigioni + collect
  for(const p of map.values()){
    computeProvvigioni(p.indicatorsPrev, grade);
    computeProvvigioni(p.indicatorsCons, grade);
    p.indicatorsPrev = normalizeBag(p.indicatorsPrev, baseIndicators);
    p.indicatorsCons = normalizeBag(p.indicatorsCons, baseIndicators);
    out.periods.push(p);
  }

  const outPath = path.join(__dirname, '..', 'data', 'periods.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', out.periods.length, 'periods to', outPath);
}

main();
