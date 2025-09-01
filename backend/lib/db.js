const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'bp.sqlite');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

function init(){
  fs.ensureDirSync(DATA_DIR);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);

  // migrate from JSON if tables are empty
  const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if(usersCount === 0){
    const p = path.join(DATA_DIR, 'users.json');
    if(fs.pathExistsSync(p)){
      const json = fs.readJSONSync(p);
      const insert = db.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
      const tx = db.transaction((arr)=>{ for(const u of arr) insert.run(u.id, JSON.stringify(u)); });
      tx(json.users || []);
    }
  }
  const appsCount = db.prepare('SELECT COUNT(*) as c FROM appointments').get().c;
  if(appsCount === 0){
    const p = path.join(DATA_DIR, 'appointments.json');
    if(fs.pathExistsSync(p)){
      const json = fs.readJSONSync(p);
      const insert = db.prepare('INSERT INTO appointments (id, data) VALUES (?, ?)');
      const tx = db.transaction((arr)=>{ for(const a of arr) insert.run(a.id, JSON.stringify(a)); });
      tx(json.appointments || []);
    }
  }
}

function loadUsers(){
  return db.prepare('SELECT data FROM users').all().map(r => JSON.parse(r.data));
}

function saveUsers(users){
  const insert = db.prepare('INSERT OR REPLACE INTO users (id, data) VALUES (@id, @data)');
  const tx = db.transaction(us => {
    db.prepare('DELETE FROM users').run();
    for(const u of us){ insert.run({id: u.id, data: JSON.stringify(u)}); }
  });
  tx(users);
}

function loadAppointments(){
  return db.prepare('SELECT data FROM appointments').all().map(r => JSON.parse(r.data));
}

function saveAppointments(apps){
  const insert = db.prepare('INSERT OR REPLACE INTO appointments (id, data) VALUES (@id, @data)');
  const tx = db.transaction(ap => {
    db.prepare('DELETE FROM appointments').run();
    for(const a of ap){ insert.run({id: a.id, data: JSON.stringify(a)}); }
  });
  tx(apps);
}

module.exports = { init, loadUsers, saveUsers, loadAppointments, saveAppointments };
