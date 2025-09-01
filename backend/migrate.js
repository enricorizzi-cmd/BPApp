"use strict";

const fs = require("fs-extra");
const path = require("path");
const { init, writeJSON } = require("./lib/storage");

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
  console.log("Migration completed");
}

migrate().catch(e=>{ console.error(e); process.exit(1); });

