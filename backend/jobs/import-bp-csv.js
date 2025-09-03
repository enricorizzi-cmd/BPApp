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

rows.forEach(r=>{
  const kpi = mapKpi(r.kpi);
  const valCombined = Number(r.VALORE || r.valore || 0);
  const prevVal = Number(r.indicatorsprev || r.IndicatorsPrev || r.prev || 0);
  const consVal = Number(r.indicatorscons || r.IndicatorsCons || r.cons || 0);
  const aggVal = prevVal || consVal || valCombined || 0;

  const week = Number(r.settimana || r.week || 0);
  const month = Number(r.mese || r.month || 0);
  const year = Number(r.anno || r.year || 0);
  const quarter = Number(r.trimestre || r.quarter || 0) || (month ? Math.floor((month-1)/3)+1 : 0);
  const semester = Number(r.semestre || r.semester || 0) || (month ? (month<=6?1:2) : 0);

  // Resolve user by id first, then by name
  const userIdRaw = r.userid || r.userId || r.USERID || '';
  const userNameRaw = r.CONSULENTE || r.consulente || r.name || '';
  let user = findUserById(userIdRaw) || findUserByName(userNameRaw) || (userIdRaw ? { id: userIdRaw, name: userNameRaw || userIdRaw } : null);
  if(!user){ console.error('No user', userNameRaw || userIdRaw || 'undefined'); return; }

  // Always fill settimanale if week present (as prima importazione)
  if(week && year){
    const { start, end } = weekBounds(year, week);
    addValue(user.id, user.name, 'settimanale', start, end, kpi, aggVal);
  }
  // Monthly aggregation
  if(month && year){
    const { start, end } = monthBounds(year, month);
    addValue(user.id, user.name, 'mensile', start, end, kpi, aggVal);
  }
  // Quarterly aggregation
  if(quarter && year){
    const startM = (quarter-1)*3 + 1;
    const start = new Date(year, startM-1, 1);
    const end   = new Date(year, startM+2, 0);
    addValue(user.id, user.name, 'trimestrale', start, end, kpi, aggVal);
  }
  // Semestral aggregation
  if(semester && year){
    const startM = (semester===1) ? 1 : 7;
    const endM   = (semester===1) ? 6 : 12;
    const start = new Date(year, startM-1, 1);
    const end   = new Date(year, endM, 0);
    addValue(user.id, user.name, 'semestrale', start, end, kpi, aggVal);
  }
  // Annual aggregation
  if(year){
    const start = new Date(year, 0, 1);
    const end   = new Date(year, 12, 0);
    addValue(user.id, user.name, 'annuale', start, end, kpi, aggVal);
  }
});

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

async function main(){
  const baseUrl = process.env.API_URL || 'http://localhost:3000';

  if(writeFileMode && !dryRun){
    // offline: write directly to backend/data/periods.json with server-like upsert + provvigioni
    const dbPath = path.join(__dirname, '..', 'data', 'periods.json');
    let db = { periods: [] };
    try{ db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(_){ /* initialize empty */ }
    db.periods = db.periods || [];

    const { customAlphabet } = require('nanoid');
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

    function _gradeOf(userId){
      const u = findUserById(userId);
      return (u && u.grade==='senior') ? 'senior' : 'junior';
    }
    function _computeProvvigioniForBag(bag, grade){
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
    function _periodKey(p){
      return [ p.userId, p.type, new Date(p.startDate).toISOString().slice(0,10), new Date(p.endDate).toISOString().slice(0,10) ].join('|');
    }
    function _mergeIndicators(target, incoming){
      const out = { ...(target||{}) };
      for(const [k,v] of Object.entries(incoming||{})) out[k] = Number(v||0);
      return out;
    }

    let created = 0, updated = 0;
    for(const [userId, rec] of Object.entries(periodsByUser)){
      const grade = _gradeOf(userId);
      for(const p of Object.values(rec.periods)){
        const probe = { userId, type: p.type, startDate: new Date(p.startDate).toISOString(), endDate: new Date(p.endDate).toISOString() };
        let existing = db.periods.find(x => _periodKey(x) === _periodKey(probe));
        if(existing){
          if(p.indicatorsPrev) existing.indicatorsPrev = _mergeIndicators(existing.indicatorsPrev, p.indicatorsPrev);
          if(p.indicatorsCons) existing.indicatorsCons = _mergeIndicators(existing.indicatorsCons, p.indicatorsCons);
          _computeProvvigioniForBag(existing.indicatorsPrev, grade);
          _computeProvvigioniForBag(existing.indicatorsCons, grade);
          updated++;
        } else {
          const row = { id: nanoid(), ...probe, indicatorsPrev: p.indicatorsPrev || {}, indicatorsCons: p.indicatorsCons || {} };
          _computeProvvigioniForBag(row.indicatorsPrev, grade);
          _computeProvvigioniForBag(row.indicatorsCons, grade);
          db.periods.push(row);
          created++;
        }
      }
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log(`File updated: ${created} created, ${updated} updated`);
    return;
  }

  if(writePgMode && !dryRun){
    // Write directly to Postgres KV using backend's storage-pg
    const storage = require('../lib/storage-pg');
    await storage.init();

    // Refresh usersDb from PG for accurate grades
    try { usersDb = await storage.readJSON('users.json'); } catch(_){ usersDb = { users: [] }; }

    function _gradeOf(userId){
      const u = (usersDb.users||[]).find(x => String(x.id) === String(userId));
      return (u && u.grade==='senior') ? 'senior' : 'junior';
    }
    function _computeProvvigioniForBag(bag, grade){
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
    function _periodKey(p){
      return [ p.userId, p.type, new Date(p.startDate).toISOString().slice(0,10), new Date(p.endDate).toISOString().slice(0,10) ].join('|');
    }
    function _mergeIndicators(target, incoming){
      const out = { ...(target||{}) };
      for(const [k,v] of Object.entries(incoming||{})) out[k] = Number(v||0);
      return out;
    }

    let db = { periods: [] };
    try { db = await storage.readJSON('periods.json'); } catch(_){ db = { periods: [] }; }
    db.periods = db.periods || [];

    const { customAlphabet } = require('nanoid');
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

    let created = 0, updated = 0;
    for(const [userId, rec] of Object.entries(periodsByUser)){
      const grade = _gradeOf(userId);
      for(const p of Object.values(rec.periods)){
        const probe = { userId, type: p.type, startDate: new Date(p.startDate).toISOString(), endDate: new Date(p.endDate).toISOString() };
        let existing = db.periods.find(x => _periodKey(x) === _periodKey(probe));
        if(existing){
          if(p.indicatorsPrev) existing.indicatorsPrev = _mergeIndicators(existing.indicatorsPrev, p.indicatorsPrev);
          if(p.indicatorsCons) existing.indicatorsCons = _mergeIndicators(existing.indicatorsCons, p.indicatorsCons);
          _computeProvvigioniForBag(existing.indicatorsPrev, grade);
          _computeProvvigioniForBag(existing.indicatorsCons, grade);
          updated++;
        } else {
          const row = { id: nanoid(), ...probe, indicatorsPrev: p.indicatorsPrev || {}, indicatorsCons: p.indicatorsCons || {} };
          _computeProvvigioniForBag(row.indicatorsPrev, grade);
          _computeProvvigioniForBag(row.indicatorsCons, grade);
          db.periods.push(row);
          created++;
        }
      }
    }

    await storage.writeJSON('periods.json', db);
    console.log(`Postgres updated: ${created} created, ${updated} updated`);
    return;
  }

  for(const [userId, rec] of Object.entries(periodsByUser)){
    const user = findUserById(userId);
    const label = `${rec.name} (${userId})`;
    if(!user){ console.error('No user for id', userId); continue; }
    if(String(user.pass||'').startsWith('$2')){ console.error('Cannot login for', label, '- hashed password'); continue; }
    const token = dryRun ? null : await login(user.email, user.pass, baseUrl).catch(e=>{ console.error('Login failed for', label, e.message); return null; });
    for(const p of Object.values(rec.periods)){
      if(dryRun){
        console.log(label, p);
      }else if(token){
        const r = await postPeriod(token, baseUrl, p);
        console.log(label, p.startDate, r.status, r.body && (r.body.error||r.body.ok));
      }
    }
  }
}
main().catch(e=>{ console.error(e); process.exit(1); });
