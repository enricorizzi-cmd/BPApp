"use strict";

const fs = require("fs");
const path = require("path");

async function main(){
  const args = process.argv.slice(2);
  const mergeMode = args.includes('--merge');

  if(!process.env.PG_URL && !process.env.DATABASE_URL){
    console.error('Missing PG_URL (or DATABASE_URL). Example:');
    console.error('  PowerShell:  $env:PG_URL = "postgres://user:pass@host:5432/db"');
    console.error('  Bash:        export PG_URL="postgres://user:pass@host:5432/db"');
    process.exit(1);
  }

  const storage = require("../lib/storage-pg");
  await storage.init();

  const localPath = path.join(__dirname, "..", "data", "periods.json");
  if(!fs.existsSync(localPath)){
    console.error('Local file not found:', localPath);
    process.exit(1);
  }
  const localDb = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if(!localDb || !Array.isArray(localDb.periods)){
    console.error('Invalid local periods.json structure. Expecting { periods: [] }');
    process.exit(1);
  }

  let pgDb = { periods: [] };
  try { pgDb = await storage.readJSON('periods.json'); }
  catch(_){ pgDb = { periods: [] }; }
  pgDb.periods = pgDb.periods || [];

  // backup current PG value to file
  try{
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14);
    const backupPath = path.join(__dirname, "..", "data", `periods.pg.backup-${ts}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(pgDb, null, 2));
    console.log('Backup written:', backupPath);
  }catch(e){ console.warn('Backup failed:', e.message); }

  function _periodKey(p){
    return [
      p.userId,
      p.type,
      (new Date(p.startDate)).toISOString().slice(0,10),
      (new Date(p.endDate)).toISOString().slice(0,10)
    ].join('|');
  }

  let resultDb = null;
  if(mergeMode){
    const map = new Map();
    for(const x of (pgDb.periods||[])) map.set(_periodKey(x), x);
    let replaced = 0, added = 0;
    for(const y of (localDb.periods||[])){
      const key = _periodKey(y);
      if(map.has(key)){ map.set(key, y); replaced++; }
      else { map.set(key, y); added++; }
    }
    resultDb = { periods: Array.from(map.values()) };
    console.log(`Merge mode: ${replaced} replaced, ${added} added. Total: ${resultDb.periods.length}`);
  } else {
    resultDb = localDb;
    console.log(`Replace mode: writing ${resultDb.periods.length} periods`);
  }

  await storage.writeJSON('periods.json', resultDb);
  console.log('Postgres updated successfully.');
}

main().catch(e=>{ console.error(e); process.exit(1); });

