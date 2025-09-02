"use strict";

const fs = require("fs-extra");
const path = require("path");
const usePgStorage = process.env.BP_STORAGE === 'pg' || !!process.env.PG_URL;
const storage = usePgStorage ? require("./lib/storage-pg") : require("./lib/storage");
const { init, writeJSON } = storage;
const logger = require("./lib/logger");

const DATA_DIR = path.join(__dirname, "data");
init(DATA_DIR);

async function migrate(){
  const files = [
    "users.json",
    "appointments.json",
    "clients.json",
    "periods.json",
    "push_subscriptions.json",
    "gi.json",
    "settings.json"
  ];

  for(const name of files){
    const p = path.join(DATA_DIR, name);
    if(await fs.pathExists(p)){
      const data = await fs.readJSON(p);
      writeJSON(name, data);
    }
  }
  logger.info("Migration completed");
}

migrate().catch(e=>{ logger.error(e); process.exit(1); });

