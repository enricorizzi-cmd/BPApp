"use strict";

const { Pool } = require("pg");
const dns = require("dns").promises;

let pool = null;

async function init(){
  const urlStr = process.env.PG_URL || process.env.DATABASE_URL;
  if(!urlStr) throw new Error("Missing PG_URL for Postgres storage");

  const u = new URL(urlStr);
  const host = u.hostname;
  const port = Number(u.port || 5432);
  const database = decodeURIComponent(u.pathname.replace(/^\//, '') || 'postgres');
  const user = decodeURIComponent(u.username || '');
  const password = decodeURIComponent(u.password || '');
  const sslReject = process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false';
  const forceIPv4 = process.env.PG_FORCE_IPV4 !== '0';

  // Allow explicit IPv4 override via env (e.g., set PG_HOST_IPV4 to an A record)
  let hostToUse = process.env.PG_HOST_IPV4 || host;
  if(forceIPv4){
    try{
      const addrs = await dns.resolve4(host);
      if(Array.isArray(addrs) && addrs.length) hostToUse = addrs[0];
    }catch(_){
      try{
        const res = await dns.lookup(host, { family: 4 });
        if(res && res.address) hostToUse = res.address;
      }catch(__){ /* fallback */ }
    }
  }

  const cfg = {
    host: hostToUse,
    port,
    database,
    user,
    password,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: sslReject }
  };

  pool = new Pool(cfg);
  await pool.query(`CREATE TABLE IF NOT EXISTS kv (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`);
  return pool;
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
