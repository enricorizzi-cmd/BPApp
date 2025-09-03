#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const [, , file, ...rest] = process.argv;
if(!file){
  console.error('Usage: node jobs/import-bp-csv.js <file.csv> [--dry-run]');
  process.exit(1);
}
const dryRun = rest.includes('--dry-run');

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

// Load users to resolve userid or name
const usersDb = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','users.json'),'utf8'));

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
rows.forEach(r=>{
  const kpi = mapKpi(r.kpi);
  const valCombined = Number(r.VALORE || r.valore || 0);
  const prevVal = Number(r.indicatorsprev || r.IndicatorsPrev || r.prev || 0);
  const consVal = Number(r.indicatorscons || r.IndicatorsCons || r.cons || 0);

  const week = Number(r.settimana || r.week || 0);
  const month = Number(r.mese || r.month || 0);
  const year = Number(r.anno || r.year || 0);

  // Resolve user by id first, then by name
  const userIdRaw = r.userid || r.userId || r.USERID || '';
  const userNameRaw = r.CONSULENTE || r.consulente || r.name || '';
  let user = findUserById(userIdRaw) || findUserByName(userNameRaw);
  if(!user){
    console.error('No user', userNameRaw || userIdRaw || 'undefined');
    return;
  }

  const type = week ? 'settimanale' : 'mensile';
  const { start, end } = week ? weekBounds(year, week) : monthBounds(year, month);
  const startDate = start.toISOString();
  const endDate = end.toISOString();

  if(!periodsByUser[user.id]) periodsByUser[user.id] = { name: user.name, periods: {} };
  const key = `${type}|${startDate}`;
  if(!periodsByUser[user.id].periods[key]){
    periodsByUser[user.id].periods[key] = { type, startDate, endDate, indicatorsPrev:{}, indicatorsCons:{} };
  }
  const bag = periodsByUser[user.id].periods[key];
  if(valCombined){
    bag.indicatorsPrev[kpi] = (bag.indicatorsPrev[kpi] || 0) + valCombined;
    bag.indicatorsCons[kpi] = (bag.indicatorsCons[kpi] || 0) + valCombined;
  }
  if(prevVal){
    bag.indicatorsPrev[kpi] = (bag.indicatorsPrev[kpi] || 0) + prevVal;
  }
  if(consVal){
    bag.indicatorsCons[kpi] = (bag.indicatorsCons[kpi] || 0) + consVal;
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
