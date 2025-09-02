"use strict";

const { Pool } = require("pg");

let pool = null;

function init(){
  const connectionString = process.env.PG_URL || process.env.DATABASE_URL;
  if(!connectionString) throw new Error("Missing PG_URL for Postgres storage");
  pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000 });
  return pool.query(`CREATE TABLE IF NOT EXISTS kv (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`);
}

function requirePool(){
  if(!pool) throw new Error("DB not initialised");
  return pool;
}

async function readJSON(name){
  const res = await requirePool().query('SELECT data FROM kv WHERE name=$1', [name]);
  if(res.rowCount === 0) throw new Error('not found');
  return JSON.parse(res.rows[0].data);
}

async function writeJSON(name, data){
  const json = JSON.stringify(data);
  await requirePool().query(
    `INSERT INTO kv(name, data) VALUES($1,$2)
     ON CONFLICT(name) DO UPDATE SET data=EXCLUDED.data`,
    [name, json]
  );
}

module.exports = { init, readJSON, writeJSON };

