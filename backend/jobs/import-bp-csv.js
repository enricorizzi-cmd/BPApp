#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const [, , file, ...rest] = process.argv;
if(!file){
  console.error('Usage: node jobs/import-bp-csv.js <file.csv> [--dry-run]');
  process.exit(1);
}
const dryRun = rest.includes('--dry-run');
const writeFileMode = rest.includes('--write-file') || process.env.API_URL === 'file';
const writePgMode   = rest.includes('--write-pg') || process.env.BP_STORAGE === 'pg' || !!process.env.PG_URL || !!process.env.DATABASE_URL;

// Load CSV
function parseCsv(content){
  const lines = content.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map(h=>h.trim());
  return lines.filter(l=>l.trim()).map(line=>{
    const cols = line.split(',');
    const row = {};
    headers.forEach((h,i)=> row[h] = (cols[i]||'').trim());
    return row;
  });
}

// KPI mapping
const KPI_MAP = {
  VSS:'VSS',
  VSD_personale:'VSDPersonale',
  VSD_indiretto:'VSDIndiretto',
  VSD_totale:'VSDTotale',
  GI:'GI',
  Telefonate:'Telefonate',
  App_fissati:'AppFissati',
  App_fatti:'AppFatti',
  Corsi_leadership:'CorsiLeadership',
  iProfile:'iProfile',
  MBS:'MBS',
  NNCF:'NNCF'
};
function mapKpi(name){
  if(KPI_MAP[name]) return KPI_MAP[name];
  return name.split('_').map((p,i)=> i===0? p.charAt(0).toUpperCase()+p.slice(1) : p.charAt(0).toUpperCase()+p.slice(1)).join('');
}

function weekBounds(year, week){
  const simple = new Date(year,0,1 + (week-1)*7);
  const dow = simple.getDay();
  const start = new Date(simple);
  const diff = (dow<=4 ? dow-1 : dow-8);
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

// Parse CSV rows
const content = fs.readFileSync(file, 'utf8');
const rows = parseCsv(content);

// Load users to resolve userid or name (fallback to local file; PG loaded later when needed)
let usersDb = { users: [] };
try { usersDb = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','users.json'),'utf8')); }
catch(_) { usersDb = { users: [] }; }

function findUserById(id){
  if(!id) return null;
  return (usersDb.users||[]).find(u => String(u.id) === String(id));
}
function findUserByName(name){
  if(!name) return null;
  const key = String(name).toLowerCase();
  return (usersDb.users||[]).find(u => (u.name||'').toLowerCase() === key);
}

// Group periods by userId
const periodsByUser = {}; // { [userId]: { name, periods: { [key]: data } } }

function ensurePeriod(userId, userName, type, startDate, endDate){
  if(!periodsByUser[userId]) periodsByUser[userId] = { name: userName, periods: {} };
  const key = `${type}|${startDate}`;
  if(!periodsByUser[userId].periods[key]){
    periodsByUser[userId].periods[key] = { type, startDate, endDate, indicatorsPrev:{}, indicatorsCons:{} };
  }
  return periodsByUser[userId].periods[key];
}
function addValue(userId, userName, type, start, end, kpi, val){
  if(!val) return;
  const bag = ensurePeriod(userId, userName, type, start.toISOString(), end.toISOString());
  bag.indicatorsPrev[kpi] = (bag.indicatorsPrev[kpi] || 0) + val;
  bag.indicatorsCons[kpi] = (bag.indicatorsCons[kpi] || 0) + val;
}

function computeAggVal(r){
  const valCombined = coalesceNumber(r.VALORE, r.valore, 0);
  const prevVal = coalesceNumber(r.indicatorsprev, r.IndicatorsPrev, r.prev, 0);
  const consVal = coalesceNumber(r.indicatorscons, r.IndicatorsCons, r.cons, 0);
  const list = [prevVal, consVal, valCombined, 0];
  for (const v of list) { if (v) return v; }
  return 0;
}

function firstNonZeroNumber(...vals){
  for (const x of vals) {
    const n = Number(x || 0);
    if (n) return n;
  }
  return 0;
}
function coalesceNumber(...vals){
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return Number(v);
  }
  return 0;
}
function computeTemporalParts(r){
  const week = firstNonZeroNumber(r.settimana, r.week);
  const month = firstNonZeroNumber(r.mese, r.month);
  const year = firstNonZeroNumber(r.anno, r.year);
  let quarter = firstNonZeroNumber(r.trimestre, r.quarter);
  if (!quarter && month) quarter = Math.floor((month - 1) / 3) + 1;
  let semester = firstNonZeroNumber(r.semestre, r.semester);
  if (!semester && month) semester = month <= 6 ? 1 : 2;
  return { week, month, year, quarter, semester };
}

function firstDefinedString(...vals){
  for (const v of vals) { if (v) return v; }
  return '';
}
function resolveUserFromRow(r){
  const userIdRaw = firstDefinedString(r.userid, r.userId, r.USERID, '');
  const userNameRaw = firstDefinedString(r.CONSULENTE, r.consulente, r.name, '');
  const found = findUserById(userIdRaw) || findUserByName(userNameRaw);
  return found || (userIdRaw ? { id: userIdRaw, name: userNameRaw || userIdRaw } : null);
}

function aggregateIfWeek(user, parts, kpi, val){
  if (!(parts.week && parts.year)) return;
  const { start, end } = weekBounds(parts.year, parts.week);
  addValue(user.id, user.name, 'settimanale', start, end, kpi, val);
}
function aggregateIfMonth(user, parts, kpi, val){
  if (!(parts.month && parts.year)) return;
  const { start, end } = monthBounds(parts.year, parts.month);
  addValue(user.id, user.name, 'mensile', start, end, kpi, val);
}
function aggregateIfQuarter(user, parts, kpi, val){
  if (!(parts.quarter && parts.year)) return;
  const startM = (parts.quarter - 1) * 3 + 1;
  const start = new Date(parts.year, startM - 1, 1);
  const end = new Date(parts.year, startM + 2, 0);
  addValue(user.id, user.name, 'trimestrale', start, end, kpi, val);
}
function aggregateIfSemester(user, parts, kpi, val){
  if (!(parts.semester && parts.year)) return;
  const startM = parts.semester === 1 ? 1 : 7;
  const endM = parts.semester === 1 ? 6 : 12;
  const start = new Date(parts.year, startM - 1, 1);
  const end = new Date(parts.year, endM, 0);
  addValue(user.id, user.name, 'semestrale', start, end, kpi, val);
}
function aggregateIfYear(user, parts, kpi, val){
  if (!parts.year) return;
  const start = new Date(parts.year, 0, 1);
  const end = new Date(parts.year, 12, 0);
  addValue(user.id, user.name, 'annuale', start, end, kpi, val);
}

function processRow(r){
  const kpi = mapKpi(r.kpi);
  const aggVal = computeAggVal(r);
  const parts = computeTemporalParts(r);
  const user = resolveUserFromRow(r);
  if (!user) { console.error('No user', r.consulente || r.name || r.userid || 'undefined'); return; }
  aggregateIfWeek(user, parts, kpi, aggVal);
  aggregateIfMonth(user, parts, kpi, aggVal);
  aggregateIfQuarter(user, parts, kpi, aggVal);
  aggregateIfSemester(user, parts, kpi, aggVal);
  aggregateIfYear(user, parts, kpi, aggVal);
}

rows.forEach(processRow);

// helpers to normalize indicator bags: include zeros for all standard indicators
const DEFAULT_INDICATORS = [
  'VSS','VSDPersonale','VSDIndiretto','GI','Telefonate','AppFissati','AppFatti','CorsiLeadership','iProfile','MBS','NNCF'
];
function normalizeBag(bag, baseIndicators){
  const out = { ...(bag||{}) };
  const list = Array.isArray(baseIndicators) && baseIndicators.length ? baseIndicators : DEFAULT_INDICATORS;
  for(const k of list){ if(out[k]==null) out[k] = 0; else out[k] = Number(out[k]||0); }
  // ensure provvigioni keys exist
  if(out.ProvvGI==null) out.ProvvGI = 0;
  if(out.ProvvVSD==null) out.ProvvVSD = 0;
  if(out.TotProvvigioni==null) out.TotProvvigioni = 0;
  return out;
}

async function login(email, password, base){
  const res = await fetch(base + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
  if(!res.ok) throw new Error('login failed');
  const js = await res.json();
  return js.token;
}

async function postPeriod(token, base, data){
  const res = await fetch(base + '/api/periods', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body: JSON.stringify(data) });
  const js = await res.json().catch(()=>({}));
  return { status: res.status, body: js };
}

function gradeOf(userId){
  const u = findUserById(userId);
  return (u && u.grade === 'senior') ? 'senior' : 'junior';
}
function computeProvvigioniForBag(bag, grade){
  if(!bag) return;
  const gi  = Number(bag.GI || 0);
  const vsdP= Number(bag.VSDPersonale || 0);
  const rateGi   = 0.15;
  const rateVsdP = (grade==='senior') ? 0.25 : 0.20;
  const provvGi  = (bag.ProvvGI!=null)  ? Number(bag.ProvvGI)  : gi  * rateGi;
  const provvVsd = (bag.ProvvVSD!=null) ? Number(bag.ProvvVSD) : vsdP* rateVsdP;
  const tot      = (bag.TotProvvigioni!=null) ? Number(bag.TotProvvigioni) : (provvGi + provvVsd);
  bag.ProvvGI = provvGi; bag.ProvvVSD = provvVsd; bag.TotProvvigioni = tot;
}
function periodKey(p){
  return [ p.userId, p.type, new Date(p.startDate).toISOString().slice(0,10), new Date(p.endDate).toISOString().slice(0,10) ].join('|');
}
function mergeIndicators(target, incoming){
  const out = { ...(target||{}) };
  for(const [k,v] of Object.entries(incoming||{})) out[k] = Number(v||0);
  return out;
}

function loadBaseIndicatorsLocal(){
  let baseIndicators = DEFAULT_INDICATORS;
  try{
    const sPath = path.join(__dirname, '..', 'data', 'settings.json');
    const s = JSON.parse(fs.readFileSync(sPath, 'utf8'));
    if(s && Array.isArray(s.indicators) && s.indicators.length) baseIndicators = s.indicators;
  }catch(_){ /* keep default */ }
  return baseIndicators;
}

async function writeToFileMode(){
  const dbPath = path.join(__dirname, '..', 'data', 'periods.json');
  let db = { periods: [] };
  try{ db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch(_){}
  db.periods = db.periods || [];
  const { customAlphabet } = require('nanoid');
  const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

  const baseIndicators = loadBaseIndicatorsLocal();
  let created = 0, updated = 0;
  for(const [userId, rec] of Object.entries(periodsByUser)){
    const grade = gradeOf(userId);
    for(const p of Object.values(rec.periods)){
      const probe = { userId, type: p.type, startDate: new Date(p.startDate).toISOString(), endDate: new Date(p.endDate).toISOString() };
      let existing = db.periods.find(x => periodKey(x) === periodKey(probe));
      if(existing){
        if(p.indicatorsPrev) existing.indicatorsPrev = mergeIndicators(existing.indicatorsPrev, p.indicatorsPrev);
        if(p.indicatorsCons) existing.indicatorsCons = mergeIndicators(existing.indicatorsCons, p.indicatorsCons);
        computeProvvigioniForBag(existing.indicatorsPrev, grade);
        computeProvvigioniForBag(existing.indicatorsCons, grade);
        existing.indicatorsPrev = normalizeBag(existing.indicatorsPrev, baseIndicators);
        existing.indicatorsCons = normalizeBag(existing.indicatorsCons, baseIndicators);
        updated++;
      } else {
        const row = { id: nanoid(), ...probe, indicatorsPrev: p.indicatorsPrev || {}, indicatorsCons: p.indicatorsCons || {} };
        computeProvvigioniForBag(row.indicatorsPrev, grade);
        computeProvvigioniForBag(row.indicatorsCons, grade);
        row.indicatorsPrev = normalizeBag(row.indicatorsPrev, baseIndicators);
        row.indicatorsCons = normalizeBag(row.indicatorsCons, baseIndicators);
        db.periods.push(row);
        created++;
      }
    }
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`File updated: ${created} created, ${updated} updated`);
}

async function writeToPgMode(){
  const storage = require('../lib/storage-pg');
  await storage.init();

  async function readJsonSafe(key, fallback){
    try { return await storage.readJSON(key); } catch(_) { return fallback; }
  }

  usersDb = await readJsonSafe('users.json', { users: [] });
  const settings = await readJsonSafe('settings.json', {});
  const baseIndicators = (settings && Array.isArray(settings.indicators) && settings.indicators.length)
    ? settings.indicators : DEFAULT_INDICATORS;

  let db = await readJsonSafe('periods.json', { periods: [] });
  db.periods = db.periods || [];

  const { customAlphabet } = require('nanoid');
  const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

  function upsertPeriod(db, userId, p, baseIndicators, grade){
    const probe = { userId, type: p.type, startDate: new Date(p.startDate).toISOString(), endDate: new Date(p.endDate).toISOString() };
    const idx = db.periods.findIndex(x => periodKey(x) === periodKey(probe));
    if (idx >= 0) {
      const existing = db.periods[idx];
      existing.indicatorsPrev = mergeIndicators(existing.indicatorsPrev, p.indicatorsPrev || {});
      existing.indicatorsCons = mergeIndicators(existing.indicatorsCons, p.indicatorsCons || {});
      computeProvvigioniForBag(existing.indicatorsPrev, grade);
      computeProvvigioniForBag(existing.indicatorsCons, grade);
      existing.indicatorsPrev = normalizeBag(existing.indicatorsPrev, baseIndicators);
      existing.indicatorsCons = normalizeBag(existing.indicatorsCons, baseIndicators);
      return 'updated';
    }
    const row = { id: nanoid(), ...probe, indicatorsPrev: p.indicatorsPrev || {}, indicatorsCons: p.indicatorsCons || {} };
    computeProvvigioniForBag(row.indicatorsPrev, grade);
    computeProvvigioniForBag(row.indicatorsCons, grade);
    row.indicatorsPrev = normalizeBag(row.indicatorsPrev, baseIndicators);
    row.indicatorsCons = normalizeBag(row.indicatorsCons, baseIndicators);
    db.periods.push(row);
    return 'created';
  }

  let created = 0, updated = 0;
  for (const [userId, rec] of Object.entries(periodsByUser)){
    const grade = gradeOf(userId);
    for (const p of Object.values(rec.periods)){
      const res = upsertPeriod(db, userId, p, baseIndicators, grade);
      if (res === 'updated') updated++; else created++;
    }
  }

  await storage.writeJSON('periods.json', db);
  console.log(`Postgres updated: ${created} created, ${updated} updated`);
}

async function processApiMode(baseUrl){
  for(const [userId, rec] of Object.entries(periodsByUser)){
    const user = findUserById(userId);
    const label = `${rec.name} (${userId})`;
    if(!user){ console.error('No user for id', userId); continue; }
    const pass = String(user.pass||'');
    if(pass.startsWith('$2')){ console.error('Cannot login for', label, '- hashed password'); continue; }
    async function getToken(){
      if (dryRun) return null;
      try { return await login(user.email, user.pass, baseUrl); }
      catch(e){ console.error('Login failed for', label, e.message); return null; }
    }
    const token = await getToken();
    for(const p of Object.values(rec.periods)){
      if(dryRun){
        console.log(label, p);
      } else if(token){
        const r = await postPeriod(token, baseUrl, p);
        console.log(label, p.startDate, r.status, r.body && (r.body.error||r.body.ok));
      }
    }
  }
}

async function main(){
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  if(writeFileMode && !dryRun) return writeToFileMode();
  if(writePgMode && !dryRun) return writeToPgMode();
  return processApiMode(baseUrl);
}
main().catch(e=>{ console.error(e); process.exit(1); });
