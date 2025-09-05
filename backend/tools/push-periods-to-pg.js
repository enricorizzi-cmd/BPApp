"use strict";

const fs = require("fs");
const path = require("path");

function ensurePgEnv() {
  if (!process.env.PG_URL && !process.env.DATABASE_URL) {
    const msg = [
      "Missing PG_URL (or DATABASE_URL). Example:",
      '  PowerShell:  $env:PG_URL = "postgres://user:pass@host:5432/db"',
      '  Bash:        export PG_URL="postgres://user:pass@host:5432/db"',
    ].join("\n");
    throw new Error(msg);
  }
}

function readLocalDb() {
  const localPath = path.join(__dirname, "..", "data", "periods.json");
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
  const localDb = JSON.parse(fs.readFileSync(localPath, "utf8"));
  if (!localDb || !Array.isArray(localDb.periods)) {
    throw new Error("Invalid local periods.json structure. Expecting { periods: [] }");
  }
  return localDb;
}

async function readPgDb(storage) {
  try {
    const pgDb = await storage.readJSON("periods.json");
    return { periods: pgDb.periods || [] };
  } catch (_) {
    return { periods: [] };
  }
}

function backupPgDb(pgDb) {
  try {
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const backupPath = path.join(
      __dirname,
      "..",
      "data",
      `periods.pg.backup-${ts}.json`
    );
    fs.writeFileSync(backupPath, JSON.stringify(pgDb, null, 2));
    console.log("Backup written:", backupPath);
  } catch (e) {
    console.warn("Backup failed:", e.message);
  }
}

function periodKey(p) {
  return [
    p.userId,
    p.type,
    new Date(p.startDate).toISOString().slice(0, 10),
    new Date(p.endDate).toISOString().slice(0, 10),
  ].join("|");
}

function mergeDatabases(pgDb, localDb) {
  const map = new Map();
  for (const x of pgDb.periods || []) map.set(periodKey(x), x);
  let replaced = 0,
    added = 0;
  for (const y of localDb.periods || []) {
    const key = periodKey(y);
    if (map.has(key)) {
      map.set(key, y);
      replaced++;
    } else {
      map.set(key, y);
      added++;
    }
  }
  return { db: { periods: Array.from(map.values()) }, replaced, added };
}

async function main() {
  const args = process.argv.slice(2);
  const mergeMode = args.includes("--merge");

  ensurePgEnv();

  const storage = require("../lib/storage-pg");
  await storage.init();

  const localDb = readLocalDb();
  const pgDb = await readPgDb(storage);

  backupPgDb(pgDb);

  let resultDb;
  if (mergeMode) {
    const { db, replaced, added } = mergeDatabases(pgDb, localDb);
    resultDb = db;
    console.log(`Merge mode: ${replaced} replaced, ${added} added. Total: ${resultDb.periods.length}`);
  } else {
    resultDb = localDb;
    console.log(`Replace mode: writing ${resultDb.periods.length} periods`);
  }

  await storage.writeJSON("periods.json", resultDb);
  console.log("Postgres updated successfully.");
}

main().catch(e=>{ console.error(e); process.exit(1); });
