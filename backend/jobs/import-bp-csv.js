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

// Group periods by consultant
const periodsByUser = {};
rows.forEach(r=>{
  const kpi = mapKpi(r.kpi);
  const val = Number(r.VALORE || 0);
  const user = r.CONSULENTE;
  const week = Number(r.settimana);
  const month = Number(r.mese);
  const year = Number(r.anno);
  const type = week ? 'settimanale' : 'mensile';
  const { start, end } = week ? weekBounds(year, week) : monthBounds(year, month);
  const startDate = start.toISOString();
  const endDate = end.toISOString();

  periodsByUser[user] = periodsByUser[user] || {};
  const key = `${type}|${startDate}`;
  if(!periodsByUser[user][key]){
    periodsByUser[user][key] = { type, startDate, endDate, indicatorsPrev:{}, indicatorsCons:{} };
  }
  periodsByUser[user][key].indicatorsPrev[kpi] = val;
  periodsByUser[user][key].indicatorsCons[kpi] = val;
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
  const usersDb = JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','users.json'),'utf8'));

  for(const [name, periods] of Object.entries(periodsByUser)){
    const user = (usersDb.users||[]).find(u => u.name.toLowerCase() === String(name).toLowerCase());
    if(!user){ console.error('No user', name); continue; }
    if(String(user.pass||'').startsWith('$2')){ console.error('Cannot login for', name, '- hashed password'); continue; }
    const token = dryRun ? null : await login(user.email, user.pass, baseUrl).catch(e=>{ console.error('Login failed for', name, e.message); return null; });
    for(const p of Object.values(periods)){
      if(dryRun){
        console.log(name, p);
      }else if(token){
        const r = await postPeriod(token, baseUrl, p);
        console.log(name, p.startDate, r.status, r.body && (r.body.error||r.body.ok));
      }
    }
  }
}
main().catch(e=>{ console.error(e); process.exit(1); });
