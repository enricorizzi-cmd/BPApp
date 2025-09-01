const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, "..", "data");
const LOG = path.join(DATA_DIR, "audit.log");

function line(event, payload, req){
  const now = new Date();
  const base = {
    ts: now.toISOString(),
    event,
    ip: (req && (req.headers['x-forwarded-for']||req.connection?.remoteAddress||'')).toString(),
    userId: req && req.user && req.user.id || null,
  };
  return JSON.stringify({ ...base, ...(payload||{}) }) + "\n";
}

async function audit(event, payload, req){
  try{
    await fs.promises.mkdir(DATA_DIR, { recursive:true });
    await fs.promises.appendFile(LOG, line(event, payload, req), 'utf8');
  }catch(e){ /* ignore */ }
}

module.exports = { audit };