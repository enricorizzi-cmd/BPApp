"use strict";

const path = require("path");
const fs = require("fs-extra");
const Database = require("better-sqlite3");

let db = null;

/**
 * Initialize SQLite database in given data directory.
 * Creates a simple key/value table where each row stores
 * a JSON string representing former data files.
 */
function init(dataDir){
  const dbPath = path.join(dataDir, "data.sqlite");
  // ensure data directory exists
  fs.ensureDirSync(dataDir);
  db = new Database(dbPath);
  // improve concurrency and resilience
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 2000');
  } catch(_) { /* optional on older sqlite */ }
  db.exec("CREATE TABLE IF NOT EXISTS kv (name TEXT PRIMARY KEY, data TEXT)");
  return db;
}

function requireDb(){
  if(!db) throw new Error("DB not initialised");
  return db;
}

function readJSON(name){
  const row = requireDb().prepare("SELECT data FROM kv WHERE name=?").get(name);
  if(!row) throw new Error("not found");
  return JSON.parse(row.data);
}

function writeJSON(name, data){
  const json = JSON.stringify(data);
  requireDb()
    .prepare("INSERT INTO kv(name,data) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data")
    .run(name, json);
}

module.exports = { init, readJSON, writeJSON };

