"use strict";

const { Pool } = require("pg");
const dns = require("dns");

let pool = null;

function init(){
  const connectionString = process.env.PG_URL || process.env.DATABASE_URL;
  if(!connectionString) throw new Error("Missing PG_URL for Postgres storage");

  const forceIPv4 = process.env.PG_FORCE_IPV4 !== '0'; // default: force IPv4 to avoid ENETUNREACH on v6-only
  const lookup = (hostname, options, cb) => dns.lookup(hostname, { family: 4, hints: dns.ADDRCONFIG }, cb);
  const sslReject = process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false';

  const cfg = {
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: sslReject },
  };
  if (forceIPv4) cfg.lookup = lookup;

  pool = new Pool(cfg);
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
