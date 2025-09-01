const fs = require('fs');
const path = require('path');
const { sendPush, setup, configured } = require('../lib/push');
const { pickActivePeriodType, findCurrentPeriod, findLastClosedPeriod } = require('../lib/periods');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');
const PERIODS_FILE = path.join(DATA_DIR, 'periods.json');
const STATE_FILE = path.join(DATA_DIR, 'reminder_state.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function readJSONSafe(p){
  try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ return {}; }
}
function writeJSONSafe(p, data){
  fs.mkdirSync(path.dirname(p), { recursive:true });
  fs.writeFileSync(p + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(p + '.tmp', p);
}

function romeNow(){
  // Assume TZ=Europe/Rome set at process level. Fallback: system time.
  return new Date();
}
function ymd(d){
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const da = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function computeNextRun(){
  const now = romeNow();
  const day = now.getDay(); // 0 Sun ... 6 Sat
  const targetHour = 12, targetMin = 0;
  const addDaysToSat = (6 - day + 7) % 7;
  const addDaysToSun = (7 - day + 7) % 7;
  const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDaysToSat, targetHour, targetMin, 0);
  const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDaysToSun, targetHour, targetMin, 0);
  let next = sat;
  if (now > sat) next = sun;
  if (now > sun) next = new Date(sat.getTime() + 7*24*3600*1000);
  return next;
}

function userNeedsReminders(userId){
  const periodsDb = readJSONSafe(PERIODS_FILE);
  const subsDb = readJSONSafe(SUBS_FILE);
  const stateDb = readJSONSafe(STATE_FILE);
  const today = ymd(romeNow());
  const nowTs = Date.now();

  // pick type based on recent usage (or mensile)
  const type = pickActivePeriodType(periodsDb.periods||[], userId);

  const cur = findCurrentPeriod(periodsDb.periods||[], userId, type, nowTs);
  let needPrev = false;
  if(!cur){
    needPrev = true; // nessun BP attivo → chiedi previsionale
  }else{
    const hasPrev = !!(cur.indicatorsPrev && Object.keys(cur.indicatorsPrev).length);
    needPrev = !hasPrev;
  }

  const prevClosed = findLastClosedPeriod(periodsDb.periods||[], userId, type, nowTs);
  let needCons = false;
  if(prevClosed){
    const hasCons = !!(prevClosed.indicatorsCons && Object.keys(prevClosed.indicatorsCons).length);
    needCons = !hasCons;
  }

  const keyPrev = `${userId}|prev|${today}`;
  const keyCons = `${userId}|cons|${today}`;
  if(stateDb[keyPrev]) needPrev = false;
  if(stateDb[keyCons]) needCons = false;

  return { needPrev, needCons, type };
}

async function runOnce(){
  if(!configured()){ setup(); }
  const subsDb = readJSONSafe(SUBS_FILE);
  const usersDb = readJSONSafe(USERS_FILE);
  const stateDb = readJSONSafe(STATE_FILE);
  const today = ymd(romeNow());

  const byUser = {};
  (subsDb.subscriptions||[]).forEach(s=>{
    if(!s || !s.userId || !s.subscription) return;
    if(!byUser[s.userId]) byUser[s.userId] = [];
    byUser[s.userId].push(s.subscription);
  });

  for(const u of (usersDb.users||[])){
    const userId = u.id;
    if(!byUser[userId] || !byUser[userId].length) continue;

    const { needPrev, needCons, type } = userNeedsReminders(userId);
    const sends = [];
    if(needPrev) sends.push({ kind:'prev', title:'Promemoria BP', body:`Compila il Previsionale (${type})`, tag:'bp-prev' });
    if(needCons) sends.push({ kind:'cons', title:'Promemoria BP', body:`Chiudi il Consuntivo (${type})`, tag:'bp-cons' });

    for(const s of sends){
      for(const sub of byUser[userId]){
        const r = await sendPush(sub, { title:s.title, body:s.body, tag:s.tag });
        if(r && r.ok){ stateDb[`${userId}|${s.kind}|${today}`] = true; }
      }
    }
  }

  writeJSONSafe(STATE_FILE, stateDb);
}

let _timer = null;

function scheduleNext(){
  const next = computeNextRun();
  const delay = Math.max(1000, next.getTime() - Date.now());
  clearTimeout(_timer);
  _timer = setTimeout(async ()=>{
    try{ await runOnce(); }catch(e){}
    scheduleNext();
  }, delay);
}

function startReminders(){
  try{
    if(global.__bpRemindersStarted) return;
    global.__bpRemindersStarted = true;
    setup();
    scheduleNext();
    // quick-fire booster if we are exactly on Sat/Sun 12:00 +/- 2min
    const now = romeNow();
    if([0,6].includes(now.getDay()) && now.getHours()===12 && now.getMinutes()<=2){
      runOnce().catch(()=>{});
    }
  }catch(e){ /* ignore */ }
}

module.exports = { startReminders, runOnce };