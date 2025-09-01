const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'push_subscriptions.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    userId INTEGER,
    p256dh TEXT,
    auth TEXT,
    createdAt TEXT,
    lastSeen TEXT
  )`);
});

function saveSubscription(userId, sub){
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const { endpoint, keys = {} } = sub || {};
    if(!endpoint || !keys.p256dh || !keys.auth){
      return reject(new Error('invalid_subscription'));
    }
    const sql = `INSERT OR REPLACE INTO push_subscriptions
      (endpoint, userId, p256dh, auth, createdAt, lastSeen)
      VALUES (?,?,?,?,?,?)`;
    db.run(sql, [endpoint, userId, keys.p256dh, keys.auth, now, now], err => {
      if(err) reject(err); else resolve();
    });
  });
}

function deleteSubscription(endpoint){
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM push_subscriptions WHERE endpoint=?`, [endpoint], err => {
      if(err) reject(err); else resolve();
    });
  });
}

function getSubscriptions(userId){
  return new Promise((resolve, reject) => {
    db.all(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE userId=?`, [userId], (err, rows) => {
      if(err) return reject(err);
      const subs = rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
      resolve(subs);
    });
  });
}

module.exports = { saveSubscription, deleteSubscription, getSubscriptions };
