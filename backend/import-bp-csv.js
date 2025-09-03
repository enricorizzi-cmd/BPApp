const fs = require('node:fs');
const path = require('node:path');

function parseCsv(csv){
  const lines = csv.trim().split(/\r?\n/);
  if(!lines.length) return [];
  const headers = lines[0].split(',').map(h=>h.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cols[i] || '').trim();
    });
    return obj;
  });
}

function monthToDates(period){
  // period expected format YYYY-MM or YYYY-MM-DD
  const [y, m] = period.split('-');
  const year = Number(y);
  const month = Number(m); // 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildRequests(rows){
  const map = new Map();
  for(const r of rows){
    const userId = r.consultantId || r.userId || r.consultant || r.userid;
    let period = r.period;
    if(!period && r.anno && r.mese){
      const m = String(r.mese).padStart(2, '0');
      period = `${r.anno}-${m}`;
    }
    if(!userId || !period) continue;
    const key = `${userId}|${period}`;
    let entry = map.get(key);
    if(!entry){
      const { start, end } = monthToDates(period);
      entry = { userId, type: 'mensile', startDate: start, endDate: end, indicatorsPrev: {}, indicatorsCons: {} };
      map.set(key, entry);
    }
    const kpi = r.kpi;
    const val = Number(r.value || r.val || 0);
    const kind = String(r.kind || '').toLowerCase();
    if(kind === 'cons'){
      entry.indicatorsCons[kpi] = (entry.indicatorsCons[kpi] || 0) + val;
    } else if(kind){
      entry.indicatorsPrev[kpi] = (entry.indicatorsPrev[kpi] || 0) + val;
    }
    const prev = Number(r.indicatorsprev || r.indicatorsPrev || 0);
    const cons = Number(r.indicatorscons || r.indicatorsCons || 0);
    if(prev){
      entry.indicatorsPrev[kpi] = (entry.indicatorsPrev[kpi] || 0) + prev;
    }
    if(cons){
      entry.indicatorsCons[kpi] = (entry.indicatorsCons[kpi] || 0) + cons;
    }
  }
  const requests = [];
  for(const entry of map.values()){
    if(!Object.keys(entry.indicatorsPrev).length) delete entry.indicatorsPrev;
    if(!Object.keys(entry.indicatorsCons).length) delete entry.indicatorsCons;
    requests.push(entry);
  }
  return requests;
}

async function run({ csvPath, dryRun }){
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csv);
  const requests = buildRequests(rows);
  if(!dryRun){
    // Here we would send HTTP requests, omitted in dry-run
  }
  return requests;
}

if(require.main === module){
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const fileArg = argv.find(a => !a.startsWith('-'));
  if(!fileArg){
    console.error('Usage: node import-bp-csv.js [--dry-run] <file.csv>');
    process.exit(1);
  }
  run({ csvPath: path.resolve(fileArg), dryRun }).then(reqs => {
    if(dryRun){
      console.log(JSON.stringify(reqs, null, 2));
    }
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseCsv, buildRequests, run };
