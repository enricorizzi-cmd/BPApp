/* Battle Plan – backend server.js (v13.7 final)
   - Auth JWT + bcryptjs
   - Users: list/create/update(role,grade)/delete (+safety: non elimina ultimo admin)
   - Users: credentials update (email/password) con regole (self vs admin)
   - Appointments CRUD (+durate automatiche) + ritorno clientId risolto
   - Clients CRUD (+status; regola auto-stato da appuntamenti; consultantId/Name)
   - Periods (BP) CRUD
   - Availability (slot >= 4h, Lun–Ven, 08:30–13:00 / 14:00–19:30)
   - Settings (GET/POST)
   - Leaderboard per indicatore & overall (pesi) [mode: previsionale|consuntivo]
   - Provvigioni (prev/cons; individuale o squadra con ?global=1) [FIX settimanale: overlapsAny]
   - Users emails (per CC nei report)
   - Web Push: expose publicKey + subscribe (salvataggio) + mini-cron WE 12:00
   - Team/global: usare ?global=1 dove previsto
   - Static SPA serve ../frontend (index.html + fallback)
   - Migrazione legacy db.json in /server/data/*
*/
"use strict";

const express = require("express");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");
<<<<<<< ours
const { init: initStore, readJSON, writeJSON } = require("./lib/storage");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { customAlphabet } = require("nanoid");
const dotenv = require("dotenv");
<<<<<<< ours
let nodemailer = null; try { nodemailer = require("nodemailer"); } catch(_) { /* opzionale */ }
=======
const { saveSubscription, deleteSubscription, getSubscriptions } = require("./lib/subscriptions-db");
>>>>>>> theirs
=======
const bcrypt = require("bcryptjs");
const { customAlphabet } = require("nanoid");
const dotenv = require("dotenv");
const { signToken, auth, requireAdmin } = require("./services/auth");
>>>>>>> theirs
// middleware opzionale (se non presente, commenta la riga)
let timing = null; try { timing = require("./mw/timing"); } catch(_) { timing = () => (_req,_res,next)=>next(); }
dotenv.config(); // .env: BP_JWT_SECRET, VAPID_*, TZ, etc.

// web-push (opzionale)
let webpush = null;
try { webpush = require("web-push"); } catch(_){ /* opzionale */ }

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

// ---------- Config ----------
const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || process.argv[3] || "3001", 10);

const DATA_DIR = path.join(__dirname, "data");

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------- App ----------
const app = express();
app.use(timing(500));
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------- Storage ----------
initStore(DATA_DIR);
function genId(){ return nanoid(); }
function todayISO(){ return new Date().toISOString(); }
function pad2(n){ return n<10 ? "0"+n : ""+n; }
function ymd(d){
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`;
}
function toLocalInputValue(d){
  const x = new Date(d);
  const pad = n => (n<10?'0':'')+n;
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
function fromLocalInputValue(s){ // "YYYY-MM-DDTHH:MM" -> Date (locale)
  const [date,time='00:00'] = String(s).split('T');
  const [Y,M,D] = date.split('-').map(Number);
  const [h,m]   = time.split(':').map(Number);
  return new Date(Y, M-1, D, h, m, 0, 0);
}

async function sendEmail(to, subject, text){
  try{
    if(nodemailer && process.env.SMTP_URL){
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      await transport.sendMail({
        to,
        from: process.env.SMTP_FROM || "no-reply@example.com",
        subject,
        text
      });
    }else{
      console.log(`[email] to:${to} subject:${subject} text:${text}`);
    }
  }catch(e){
    console.error("sendEmail error", e);
  }
}
function computeEndLocal(startLocalStr, type, minutes){
  const start = fromLocalInputValue(startLocalStr);
  let dur = Number(minutes||0);
  if(!dur){
    if(type==="vendita") dur = 90;
    else if(type==="mezza-giornata") dur = 240;
    else if(type==="giornata") dur = 570;
    else dur = 60;
  }
  const end = new Date(start.getTime()+dur*60000);
  return toLocalInputValue(end);
}
function overlapsAny(pStart, pEnd, rStart, rEnd){
  return new Date(pStart) <= new Date(rEnd) && new Date(pEnd) >= new Date(rStart);
}

// helpers settimana (Lun–Dom) per push WE
function startOfWeek(d){
  const x = new Date(d); const dow = x.getDay(); // 0=Dom..6=Sab
  const move = (dow===0?6:(dow-1));
  x.setHours(0,0,0,0);
  x.setDate(x.getDate()-move);
  return x;
}
function endOfWeek(d){
  const s = startOfWeek(d);
  const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999);
  return e;
}

// ---------- Ensure Data Files ----------
async function ensureFiles(){
  await fs.ensureDir(DATA_DIR);

<<<<<<< ours
  const ensure = async (name, def) => {
    try{ await readJSON(name); }
    catch{ await writeJSON(name, def); }
  };
=======
  if(!(await fs.pathExists(file("users.json"))))
    await writeJSON("users.json", { users: [] });

  if(!(await fs.pathExists(file("appointments.json"))))
    await writeJSON("appointments.json", { appointments: [] });

  if(!(await fs.pathExists(file("clients.json"))))
    await writeJSON("clients.json", { clients: [] });

  if(!(await fs.pathExists(file("periods.json"))))
    await writeJSON("periods.json", { periods: [] });

  // NUOVO: archivio per GI & Scadenzario
  if(!(await fs.pathExists(file("gi.json"))))
    await writeJSON("gi.json", { sales: [] });
>>>>>>> theirs

  await ensure("users.json", { users: [] });
  await ensure("appointments.json", { appointments: [] });
  await ensure("clients.json", { clients: [] });
  await ensure("periods.json", { periods: [] });
  await ensure("push_subscriptions.json", { subs: [] });
  await ensure("gi.json", { sales: [] });
  await ensure("settings.json", {
    indicators: ["VSS","VSDPersonale","VSDIndiretto","GI","Telefonate","AppFissati","AppFatti","CorsiLeadership","iProfile","MBS","NNCF"],
    weights: { VSS:0.25, VSDPersonale:0.25, GI:0.30, NNCF:0.20 },
    commissions: { gi:0.15, vsdJunior:0.20, vsdSenior:0.25 },
    version: 13
  });

  // ---- Legacy migration db.json -> split files (only if targets are empty) ----
  const legacyPaths = [
    path.join(DATA_DIR, "db.json"),
    path.join(__dirname, "db.json"),
    path.join(process.cwd(), "db.json"),
  ];
  let legacy = null;
  for(const p of legacyPaths){
    if(await fs.pathExists(p)){ try{ legacy = await fs.readJSON(p); }catch(e){} if(legacy) break; }
  }
  if(!legacy || typeof legacy!=="object") return;

  const usersDb  = await readJSON("users.json");
  const appsDb   = await readJSON("appointments.json");
  const clientsDb= await readJSON("clients.json");
  const periodsDb= await readJSON("periods.json");
  const settings = await readJSON("settings.json");

  const emptyUsers   = (usersDb.users||[]).length === 0;
  const emptyApps    = (appsDb.appointments||[]).length === 0;
  const emptyClients = (clientsDb.clients||[]).length === 0;
  const emptyPeriods = (periodsDb.periods||[]).length === 0;

  if(emptyUsers && Array.isArray(legacy.users)){
    usersDb.users = legacy.users.map(u => ({
      id: u.id || genId(),
      name: u.name || "User",
      email: (u.email||"").toLowerCase(),
      pass: u.pass || (u.passwordHash||""),
      role: (u.role==="admin" ? "admin" : "consultant"),
      grade: (u.grade==="senior" ? "senior" : "junior"),
      createdAt: u.createdAt || todayISO()
    }));
    await writeJSON("users.json", usersDb);
    console.log("[MIGRATE] users imported from db.json");
  }
  if(emptyApps && Array.isArray(legacy.appointments)){
    appsDb.appointments = legacy.appointments.map(a => ({
      id: a.id || genId(),
      userId: a.userId,
      client: a.client,
      clientId: a.clientId || null,
      type: a.type || "manuale",
      start: a.start ? toLocalInputValue(a.start) : toLocalInputValue(new Date()),
      end: a.end ? toLocalInputValue(a.end)
                 : computeEndLocal(toLocalInputValue(a.start||new Date()), a.type, a.durationMinutes),
      durationMinutes: Number(a.durationMinutes||0),
      vss: Number(a.vss||0),
      vsdPersonal: Number(a.vsdPersonal||0),
      nncf: !!a.nncf,
      notes: a.notes || ""
    }));
    await writeJSON("appointments.json", appsDb);
    console.log("[MIGRATE] appointments imported from db.json");
  }
  if(emptyClients && Array.isArray(legacy.clients)){
    clientsDb.clients = legacy.clients.map(c => ({
      id: c.id || genId(),
      name: c.name || "Cliente",
      status: c.status || "attivo",
      consultantId: c.consultantId || null,
      consultantName: c.consultantName || null,
      createdAt: c.createdAt || todayISO()
    }));
    await writeJSON("clients.json", clientsDb);
    console.log("[MIGRATE] clients imported from db.json");
  }
  if(emptyPeriods && Array.isArray(legacy.periods)){
    periodsDb.periods = legacy.periods.map(p => ({
      id: p.id || genId(),
      userId: p.userId,
      type: p.type,
      startDate: new Date(p.startDate).toISOString(),
      endDate: new Date(p.endDate).toISOString(),
      indicatorsPrev: p.indicatorsPrev || {},
      indicatorsCons: p.indicatorsCons || {}
    }));
    await writeJSON("periods.json", periodsDb);
    console.log("[MIGRATE] periods imported from db.json");
  }
  if(legacy.settings && typeof legacy.settings==="object"){
    await writeJSON("settings.json", { ...settings, ...legacy.settings, version: 13 });
    console.log("[MIGRATE] settings merged from db.json");
  }
}

<<<<<<< ours
// ---------- Auth ----------
function signToken(u){
  return jwt.sign({ id:u.id, role:u.role, name:u.name, permissions:u.permissions||[] }, JWT_SECRET, { expiresIn:"30d" });
}
function auth(req,res,next){
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
  if(!tok) return res.status(401).json({ error:"missing token" });
  try{ req.user = jwt.verify(tok, JWT_SECRET); return next(); }
  catch(e){ return res.status(401).json({ error:"invalid token" }); }
}
function requirePermission(perm){
  return (req,res,next)=>{
    if(req.user && req.user.role==="admin") return next();
    const perms = (req.user&&req.user.permissions)||[];
    if(perms.includes(perm)) return next();
    return res.status(403).json({ error:"forbidden" });
  };
}
const requireAdmin = requirePermission("admin");
=======
>>>>>>> theirs

// ---------- Health ----------
app.get("/api/health", (req,res)=> res.json({ ok:true, v:"13.7" }));

<<<<<<< ours
// ---------- Register / Login ----------
app.post("/api/register", async (req,res)=>{
  const { name, email, password } = req.body || {};
  if(!name || !email || !password) return res.status(400).json({ error:"missing fields" });
  const db = await readJSON("users.json");
  if((db.users||[]).some(u => u.email.toLowerCase() === String(email).toLowerCase()))
    return res.status(409).json({ error:"email exists" });
  const hash = await bcrypt.hash(password, 10);
  const first = (db.users||[]).length === 0;
  const user = {
    id: genId(),
    name: String(name),
    email: String(email).toLowerCase(),
    pass: hash,
    role: first ? "admin" : "consultant",
    grade: "junior",
    permissions: [],
    createdAt: todayISO()
  };
  db.users.push(user);
  await writeJSON("users.json", db);
  res.json({ ok:true });
});

app.post("/api/login", async (req,res)=>{
  const { email, password } = req.body || {};
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.email.toLowerCase() === String(email||"").toLowerCase());
  if(!u) return res.status(401).json({ error:"no user" });
  const ok = await bcrypt.compare(password||"", u.pass||"");
  if(!ok) return res.status(401).json({ error:"bad creds" });
  const token = signToken(u);
  const user  = { id:u.id, name:u.name, email:u.email, role:u.role, grade:u.grade, permissions:u.permissions||[] };
  res.json({ token, user });
});

app.post("/api/reset-password", async (req,res)=>{
  const { email } = req.body || {};
  if(!email) return res.status(400).json({ error:"missing email" });
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.email.toLowerCase() === String(email).toLowerCase());
  if(!u) return res.status(404).json({ error:"user not found" });
  const token = genId();
  u.resetToken = await bcrypt.hash(token, 10);
  u.resetTokenExp = Date.now() + 1000*60*60; // 1h
  await writeJSON("users.json", db);
  await sendEmail(u.email, "Reset Password", `Your reset token is ${token}`);
  res.json({ ok:true });
});

=======
>>>>>>> theirs
// ---------- Users ----------
app.get("/api/users", auth, requirePermission("users:read"), async (req,res)=>{
  const db = await readJSON("users.json");
  const users = (db.users||[]).map(u => ({
    id:u.id, name:u.name, email:u.email, role:u.role, grade:u.grade, permissions:u.permissions||[], createdAt:u.createdAt
  }));
  res.json({ users });
});

// elenco email (per CC nei report). Accessibile a utente loggato.
app.get("/api/users_emails", auth, async (req,res)=>{
  const db = await readJSON("users.json");
  const emails = (db.users||[]).map(u => u.email).filter(Boolean);
  // per retro-compatibilità includo anche { users:[{email}] }
  const users = emails.map(e => ({ email:e }));
  res.json({ emails, users });
});

// admin create user
app.post("/api/users/create", auth, requirePermission("users:write"), async (req,res)=>{
  const { name, email, password, role, grade, permissions } = req.body || {};
  if(!name || !email || !password) return res.status(400).json({ error:"missing fields" });
  const db = await readJSON("users.json");
  if((db.users||[]).some(u => u.email.toLowerCase() === String(email).toLowerCase()))
    return res.status(409).json({ error:"email exists" });
  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: genId(),
    name: String(name),
    email: String(email).toLowerCase(),
    pass: hash,
    role: (role==="admin"?"admin":"consultant"),
    grade: (grade==="senior"?"senior":"junior"),
    permissions: Array.isArray(permissions)?permissions:[],
    createdAt: todayISO()
  };
  db.users.push(user);
  await writeJSON("users.json", db);
  res.json({ ok:true, id:user.id });
});

// update role/grade/name/permissions
app.post("/api/users", auth, requirePermission("users:write"), async (req,res)=>{
  const { id, role, grade, name, email, password, permissions } = req.body || {};
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.id === id);
  if(!u) return res.status(404).json({ error:"user not found" });
  if(name) u.name = String(name);
  if(role) u.role = (role==="admin" ? "admin" : "consultant");
  if(grade) u.grade = (grade==="senior" ? "senior" : "junior");
  if(Array.isArray(permissions)) u.permissions = permissions;
  if(email){
    const exists = (db.users||[]).some(x => x.email.toLowerCase() === String(email).toLowerCase() && x.id !== u.id);
    if(exists) return res.status(409).json({ error:"email exists" });
    u.email = String(email).toLowerCase();
  }
  if(password){
    u.pass = await bcrypt.hash(String(password), 10);
  }
  await writeJSON("users.json", db);
  res.json({ ok:true });
});

// update credentials (email/password) self/admin
app.post("/api/users/credentials", auth, async (req,res)=>{
  const { userId, email, oldPassword, newPassword } = req.body || {};
  const db = await readJSON("users.json");
  const targetId = userId || req.user.id;
  const u = (db.users||[]).find(x => x.id === targetId);
  if(!u) return res.status(404).json({ error:"user not found" });

  const isSelf = (req.user.id === targetId);
  const isAdmin = (req.user.role === "admin");

  // Cambio email
  if (email){
    const exists = (db.users||[]).some(x => x.email.toLowerCase() === String(email).toLowerCase() && x.id !== u.id);
    if(exists) return res.status(409).json({ error:"email exists" });
    if(!isSelf && !isAdmin) return res.status(403).json({ error:"forbidden" });
    u.email = String(email).toLowerCase();
  }

  // Cambio password
  if (newPassword){
    if(isSelf && !isAdmin){
      const ok = await bcrypt.compare(String(oldPassword||""), u.pass||"");
      if(!ok) return res.status(401).json({ error:"bad current password" });
    }else if(!isAdmin && !isSelf){
      return res.status(403).json({ error:"forbidden" });
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    u.pass = hash;
  }

  await writeJSON("users.json", db);
  res.json({ ok:true });
});

// helper nomi (id->name + grade)
app.get("/api/usernames", auth, async (req,res)=>{
  const db = await readJSON("users.json");
  const users = (db.users||[]).map(u => ({ id:u.id, name:u.name, grade:u.grade }));
  res.json({ users });
});

// ---------- Settings ----------
app.get("/api/settings", auth, async (req,res)=>{
  const s = await readJSON("settings.json");
  res.json(s);
});
app.post("/api/settings", auth, requireAdmin, async (req,res)=>{
  const cur = await readJSON("settings.json");
  await writeJSON("settings.json", { ...cur, ...(req.body||{}), version: 13 });
  res.json({ ok:true });
});

// ---------- Clients ----------
app.get("/api/clients", auth, async (req,res)=>{
  const db = await readJSON("clients.json");
  res.json({ clients: db.clients||[] });
});

app.post("/api/clients", auth, async (req,res)=>{
  const { id, name, status, consultantId, consultantName } = req.body || {};
  const db = await readJSON("clients.json");
  db.clients = db.clients || [];

  if(id){
    const c = db.clients.find(x => x.id === id);
    if(!c) return res.status(404).json({ error:"not found" });

    // Status: admin-only, eccezione "attivo" da conversione (permessa anche a non-admin)
    const isAdmin = (req.user.role === "admin");
    if (status && status !== c.status){
      if (status === "attivo" || isAdmin){
        c.status = String(status);
      } else {
        return res.status(403).json({ error:"admin only for status change" });
      }
    }

    if(name) c.name = String(name);
    if(consultantId!=null) c.consultantId = String(consultantId||"");
    if(consultantName!=null) c.consultantName = String(consultantName||"");

    await writeJSON("clients.json", db);
    return res.json({ ok:true, id:c.id });
  }else{
    if(!name || !String(name).trim()) return res.status(400).json({ error:"missing name" });
    const exists = db.clients.find(x => (x.name||"").toLowerCase() === String(name).toLowerCase());
    if(!exists){
      db.clients.push({
        id: genId(),
        name: String(name),
        status: "attivo",
        consultantId: req.user.id,
        consultantName: req.user.name || "unknown",
        createdAt: todayISO()
      });
      await writeJSON("clients.json", db);
    }
    return res.json({ ok:true });
  }
});

app.delete("/api/clients", auth, async (req,res)=>{
  const id = req.query.id;
  const db = await readJSON("clients.json");
  const i = (db.clients||[]).findIndex(x => x.id === id);
  if(i===-1) return res.status(404).json({ error:"not found" });
  db.clients.splice(i,1);
  await writeJSON("clients.json", db);
  res.json({ ok:true });
});

// helpers client
async function findOrCreateClientByName(name, nncf, user){
  const cdb = await readJSON("clients.json");
  cdb.clients = cdb.clients || [];
  const key = String(name||"").trim().toLowerCase();
  let c = cdb.clients.find(x => (x.name||"").toLowerCase() === key);
  if(!c){
    // regola auto-stato: nncf TRUE -> "potenziale", altrimenti "attivo"
    c = {
      id: genId(),
      name: String(name||"Cliente"),
      status: nncf ? "potenziale" : "attivo",
      consultantId: user.id,
      consultantName: user.name || "unknown",
      createdAt: todayISO()
    };
    cdb.clients.push(c);
    await writeJSON("clients.json", cdb);
  } else {
    // assicura campi consulente
    if(!c.consultantId)   c.consultantId   = user.id;
    if(!c.consultantName) c.consultantName = user.name || "unknown";
    await writeJSON("clients.json", cdb);
  }
  return c;
}

const authRoutes = require("./routes/auth")({ readJSON, writeJSON, bcrypt, genId, todayISO, signToken });
const appointmentRoutes = require("./routes/appointments")({ auth, readJSON, writeJSON, computeEndLocal, findOrCreateClientByName, genId });
const pushRoutes = require("./routes/push")({ auth, readJSON, writeJSON, todayISO, VAPID_PUBLIC_KEY });
app.use('/api', authRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', pushRoutes);

// ---------- Periods (BP) ----------
app.get("/api/periods", auth, async (req,res)=>{
  const global = req.query.global === "1";
  const db = await readJSON("periods.json");
  if (global && req.user.role === "admin") {
    return res.json({ periods: db.periods || [] });
  }
  const mine = (db.periods || []).filter(p => p.userId === req.user.id);
  res.json({ periods: mine });
});

// --- helpers provvigioni (GI 15% tutti; VSDPersonale 20% junior / 25% senior) ---
function _gradeOf(userId, usersDb){
  const u = (usersDb.users||[]).find(x => String(x.id) === String(userId));
  return (u && u.grade==='senior') ? 'senior' : 'junior';
}
function _computeProvvigioniForBag(bag, grade){
  if (!bag) return;
  const gi  = Number(bag.GI || 0);
  const vsdP= Number(bag.VSDPersonale || 0);
  const rateGi   = 0.15;
  const rateVsdP = (grade==='senior') ? 0.25 : 0.20;
  // se già presenti lascio prevalere i valori inviati (ma ricostruisco Tot se mancante)
  const provvGi  = (bag.ProvvGI!=null)  ? Number(bag.ProvvGI)  : gi  * rateGi;
  const provvVsd = (bag.ProvvVSD!=null) ? Number(bag.ProvvVSD) : vsdP* rateVsdP;
  const tot      = (bag.TotProvvigioni!=null) ? Number(bag.TotProvvigioni) : (provvGi + provvVsd);
  bag.ProvvGI = provvGi;
  bag.ProvvVSD = provvVsd;
  bag.TotProvvigioni = tot;
}
async function _applyProvvigioni(row){
  const usersDb = await readJSON("users.json");
  const grade   = _gradeOf(row.userId, usersDb);
  _computeProvvigioniForBag(row.indicatorsPrev, grade);
  _computeProvvigioniForBag(row.indicatorsCons, grade);
}

app.post("/api/periods", auth, async (req,res)=>{
  const { id, type, startDate, endDate, indicatorsPrev, indicatorsCons } = req.body || {};
  if(!type || !startDate || !endDate) {
    return res.status(400).json({ error:"missing fields" });
  }

  const db = await readJSON("periods.json");
  db.periods = db.periods || [];

  const normStart = new Date(startDate).toISOString();
  const normEnd   = new Date(endDate).toISOString();

  const rowProbe = {
    userId: req.user.id,
    type: String(type),
    startDate: normStart,
    endDate: normEnd
  };
  const key = (p)=> [
    p.userId, p.type,
    (new Date(p.startDate)).toISOString().slice(0,10),
    (new Date(p.endDate)).toISOString().slice(0,10)
  ].join("|");

  // UPDATE by id
  if (id){
    const it = db.periods.find(p => p.id === id && (req.user.role==="admin" || p.userId === req.user.id));
    if(!it) return res.status(404).json({ error:"not found" });

    it.type = rowProbe.type; it.startDate = rowProbe.startDate; it.endDate = rowProbe.endDate;
    // sovrascrivo i bag solo se inviati, altrimenti mantengo i precedenti
    if (indicatorsPrev) it.indicatorsPrev = { ...(it.indicatorsPrev||{}), ...(indicatorsPrev||{}) };
    if (indicatorsCons) it.indicatorsCons = { ...(it.indicatorsCons||{}), ...(indicatorsCons||{}) };
    await _applyProvvigioni(it);

    await writeJSON("periods.json", db);
    return res.json({ ok:true, id: it.id, updated:true });
  }

  // UPSERT by composite key
  const existing = db.periods.find(p => key(p) === key({ ...rowProbe }));
  if(existing){
    if (indicatorsPrev) existing.indicatorsPrev = { ...(existing.indicatorsPrev||{}), ...(indicatorsPrev||{}) };
    if (indicatorsCons) existing.indicatorsCons = { ...(existing.indicatorsCons||{}), ...(indicatorsCons||{}) };
    await _applyProvvigioni(existing);
    await writeJSON("periods.json", db);
    return res.json({ ok:true, id: existing.id, updated:true });
  }

  // INSERT
  const row = {
    id: genId(),
    ...rowProbe,
    indicatorsPrev: indicatorsPrev || {},
    indicatorsCons: indicatorsCons || {}
  };
  await _applyProvvigioni(row);
  db.periods.push(row);
  await writeJSON("periods.json", db);
  res.json({ ok:true, id: row.id, created:true });
});

app.delete("/api/periods", auth, async (req,res)=>{
  const id = req.query.id;
  if(!id) return res.status(400).json({ error:"missing id" });
  const db = await readJSON("periods.json");
  const i = (db.periods || []).findIndex(p => p.id === id && (req.user.role==="admin" || p.userId === req.user.id));
  if(i === -1) return res.status(404).json({ error:"not found" });
  db.periods.splice(i,1);
  await writeJSON("periods.json", db);
  res.json({ ok:true });
});
// ---------- end Periods (BP) ----------
// ---------- Availability (>=4h) ----------
app.get("/api/availability", auth, async (req,res)=>{
  const { from, to } = req.query || {};
  if(!from || !to) return res.status(400).json({ error:"missing from/to" });

  const db = await readJSON("appointments.json");
  const my = (db.appointments||[]).filter(a => a.userId === req.user.id);

  const blocks = [
    { startH:8,  startM:30, endH:13, endM:0,  part:"morning"   },
    { startH:14, startM:0,  endH:19, endM:30, part:"afternoon" }
  ];
  function freeMinutesForBlock(date, b){
    const s = new Date(date); s.setHours(b.startH,b.startM,0,0);
    const e = new Date(date); e.setHours(b.endH,b.endM,0,0);
    const total = Math.max(0, (e - s)/60000);
    let busy = 0;
    for(const a of my){
      const aS = fromLocalInputValue(a.start);
      const aE = fromLocalInputValue(a.end);
      if(aS.toDateString() !== s.toDateString()) continue;
      const overlap = Math.max(0, Math.min(aE, e) - Math.max(aS, s));
      busy += overlap/60000;
    }
    return Math.max(0, total - busy);
  }

  const out = [];
  const d0 = new Date(from), d1 = new Date(to);
  for(let d = new Date(d0); d <= d1; d.setDate(d.getDate()+1)){
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    if(dow===0 || dow===6) continue;
    for(const b of blocks){
      const free = freeMinutesForBlock(d,b);
      if(free >= 240){
        const s = new Date(d); s.setHours(b.startH,b.startM,0,0);
        const e = new Date(d); e.setHours(b.endH,b.endM,0,0);
        out.push({ date: ymd(d), start: toLocalInputValue(s), end: toLocalInputValue(e), part: b.part });
      }
    }
  }
  const summary = {
    total: out.length,
    mondays: out.filter(x => new Date(x.date).getDay()===1).length,
    others: out.filter(x => ![0,1,6].includes(new Date(x.date).getDay())).length
  };
  res.json({ slots: out, summary });
});

// ---------- Leaderboard (per indicatore) ----------
app.get("/api/leaderboard", auth, async (req,res)=>{
  const mode = (req.query.mode==="previsionale") ? "previsionale" : "consuntivo";
  const indicator = req.query.indicator;
  const fromISO = req.query.from, toISO = req.query.to;
  const typeQ = req.query.type; // filtro per tipo periodo (settimanale/mensile/…)
  if(!indicator || !fromISO || !toISO) return res.status(400).json({ error:"missing params" });

  const effType = (t)=> (t==="ytd"||t==="ltm") ? "mensile" : t;
  const type = typeQ ? effType(String(typeQ)) : null;

  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");

  const acc = {};
  for (const u of (usersDb.users||[])) acc[u.id] = { id:u.id, name:u.name, total:0 };

  const fs = new Date(fromISO).getTime();
  const te = new Date(toISO).getTime();

  for(const p of (periodsDb.periods||[])){
    if (type && p.type !== type) continue;
    const ps = new Date(p.startDate).getTime();
    const pe = new Date(p.endDate).getTime();
    if (pe < fs || ps > te) continue;

    const bag = (mode==="previsionale" ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
    let val = 0;
    if (indicator === 'VSDTotale'){
      val = Number(bag.VSDPersonale||0) + Number(bag.VSDIndiretto||0);
    }else{
      val = Number(bag[indicator] || 0);
    }
    if (acc[p.userId]) acc[p.userId].total += (isFinite(val)?val:0);
  }

  const ranking = Object.values(acc).sort((a,b)=> b.total - a.total);
  res.json({ ranking });
});

// ---------- Leaderboard (OVERALL, con pesi robusti) ----------
app.get("/api/leaderboard_overall", auth, async (req,res)=>{
  const mode = (req.query.mode==="previsionale") ? "previsionale" : "consuntivo";
  const fromISO = req.query.from, toISO = req.query.to;
  const typeQ = req.query.type;
  if(!fromISO || !toISO) return res.status(400).json({ error:"missing params" });

  const effType = (t)=> (t==="ytd"||t==="ltm") ? "mensile" : t;
  const type = typeQ ? effType(String(typeQ)) : null;

  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");
  const settings  = await readJSON("settings.json");

  const DEFAULT_WEI = { VSS:0.25, VSDPersonale:0.25, GI:0.30, NNCF:0.20 };
  const wnum = (v)=>{
    if(v==null) return 0;
    if(typeof v==="number") return isFinite(v)?v:0;
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n)?n:0;
  };
  const raw = (settings.weights || {});
  const WEI = { ...DEFAULT_WEI };
  Object.keys(raw).forEach(k=>{
    if(k==="VSD" && raw.VSDPersonale==null) WEI.VSDPersonale = wnum(raw[k]);
    else if(WEI.hasOwnProperty(k)) WEI[k] = wnum(raw[k]);
  });
  const KEYS = Object.keys(WEI).filter(k => wnum(WEI[k]) > 0);

  const fs = new Date(fromISO).getTime();
  const te = new Date(toISO).getTime();

  const acc = {};
  for(const u of (usersDb.users||[])) {
    acc[u.id] = { id:u.id, name:u.name };
    for(const k of KEYS) acc[u.id][k] = 0;
  }

  for(const p of (periodsDb.periods||[])){
    if (type && p.type !== type) continue;
    const ps = new Date(p.startDate).getTime();
    const pe = new Date(p.endDate).getTime();
    if (pe < fs || ps > te) continue;

    const bag = (mode==="previsionale" ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
    const row = acc[p.userId]; if(!row) continue;
    for(const k of KEYS){
      row[k] += Number(bag[k]||0);
    }
  }

  const best = {};
  for(const k of KEYS){
    best[k] = Math.max(1, ...Object.values(acc).map(r => Number(r[k]||0)));
  }

  const ranking = Object.values(acc).map(r=>{
    let score = 0;
    for(const k of KEYS){
      const pct = Math.min(100, (Number(r[k]||0) / best[k]) * 100);
      score += pct * wnum(WEI[k]);
    }
    return { id:r.id, name:r.name, score: Math.round(score) };
  }).sort((a,b)=> b.score - a.score);

  res.json({ ranking });
});

// ---------- Commissions ----------
app.get("/api/commissions/summary", auth, async (req,res)=>{
  // comodo per tabelle provvigioni: restituisce ProvvGI/ProvvVSD/Tot per utente
  const mode = (req.query.mode==="previsionale") ? "previsionale" : "consuntivo";
  const fromISO = req.query.from, toISO = req.query.to;
  const typeQ   = req.query.type;
  if(!fromISO || !toISO) return res.status(400).json({ error:"missing params" });

  const effType = (t)=> (t==="ytd"||t==="ltm") ? "mensile" : t;
  const type = typeQ ? effType(String(typeQ)) : null;

  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");

  const fs = new Date(fromISO).getTime();
  const te = new Date(toISO).getTime();

  const acc = {};
  for(const u of (usersDb.users||[])) {
    acc[u.id] = { id:u.id, name:u.name, provvGi:0, provvVsd:0, provvTot:0 };
  }

  for(const p of (periodsDb.periods||[])){
    if (type && p.type !== type) continue;
    const ps = new Date(p.startDate).getTime();
    const pe = new Date(p.endDate).getTime();
    if (pe < fs || ps > te) continue;

    const bag = (mode==="previsionale" ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}));
    const x = acc[p.userId]; if(!x) continue;
    const gi   = Number(bag.ProvvGI||0);
    const vsd  = Number(bag.ProvvVSD||0);
    const tot  = (bag.TotProvvigioni!=null) ? Number(bag.TotProvvigioni) : (gi+vsd);
    x.provvGi  += gi;
    x.provvVsd += vsd;
    x.provvTot += tot;
  }

  res.json({ rows: Object.values(acc) });
});

// ---------- GI & Scadenzario ----------
app.get("/api/gi", auth, async (req,res)=>{
  const { from, to, userId } = req.query || {};
  const isAdmin = (req.user.role === "admin");

  const db = await readJSON("gi.json");
  let rows = (db.sales||[]);

  // visibilità
  if(!isAdmin){
    rows = rows.filter(r => String(r.consultantId||'') === String(req.user.id));
  } else if (userId){
    rows = rows.filter(r => String(r.consultantId||'') === String(userId));
  }

  // filtro data (se passato)
  if(from || to){
    const fs = from ? new Date(from).getTime() : -Infinity;
    const te = to   ? new Date(to).getTime()   : +Infinity;
    rows = rows.filter(r => {
      const t = new Date(r.date || r.createdAt || Date.now()).getTime();
      return t >= fs && t <= te;
    });
  }

  res.json({ sales: rows });
});

app.post("/api/gi", auth, async (req,res)=>{
  const body = req.body || {};
  const db = await readJSON("gi.json");
  db.sales = db.sales || [];

  // update
  if(body.id){
    const it = db.sales.find(s => s.id === body.id);
    if(!it) return res.status(404).json({ error:"not found" });
    if(req.user.role!=="admin" && String(it.consultantId||'')!==String(req.user.id))
      return res.status(403).json({ error:"forbidden" });

    // campi aggiornabili
    if(body.clientId!=null)    it.clientId = String(body.clientId||"");
    if(body.clientName!=null)  it.clientName = String(body.clientName||"");
    if(body.date)              it.date = String(body.date);
    if(body.services!=null)    it.services = String(body.services||"");
    if(body.vssTotal!=null)    it.vssTotal = Number(body.vssTotal||0);
    if(Array.isArray(body.schedule)) it.schedule = body.schedule.map(x => ({
      dueDate: String(x.dueDate||""), amount: Number(x.amount||0), note: String(x.note||"")
    }));

    await writeJSON("gi.json", db);
    return res.json({ ok:true, id: it.id });
  }

  // insert
  const row = {
    id: genId(),
    appointmentId: body.appointmentId || null,
    clientId: String(body.clientId||""),
    clientName: String(body.clientName||"Cliente"),
    date: String(body.date || new Date().toISOString()),
    consultantId: String(body.consultantId || req.user.id),
    consultantName: String(body.consultantName || req.user.name || "unknown"),
    services: String(body.services || ""),
    vssTotal: Number(body.vssTotal || 0),
    schedule: Array.isArray(body.schedule) ? body.schedule.map(x => ({
      dueDate: String(x.dueDate||""), amount: Number(x.amount||0), note: String(x.note||"")
    })) : [],
    createdAt: todayISO()
  };
  db.sales.push(row);
  await writeJSON("gi.json", db);
  res.json({ ok:true, id: row.id });
});

app.delete("/api/gi", auth, async (req,res)=>{
  const id = String(req.query.id||"");
  const db = await readJSON("gi.json");
  const i = (db.sales||[]).findIndex(s => s.id===id && (req.user.role==="admin" || String(s.consultantId||'')===String(req.user.id)));
  if(i===-1) return res.status(404).json({ error:"not found" });
  db.sales.splice(i,1);
  await writeJSON("gi.json", db);
  res.json({ ok:true });
});
// ---------- end GI & Scadenzario ----------


<<<<<<< ours
// ---------- Web Push: publicKey + subscribe (compat + versione nuova) ----------
app.get("/api/push/publicKey", (req,res)=>{
  res.json({ publicKey: VAPID_PUBLIC_KEY || "" });
});

app.post("/api/push/subscribe", auth, async (req,res)=>{
  try{
    await saveSubscription(req.user.id, req.body && (req.body.subscription || req.body));
    res.json({ ok:true });
  }catch(e){
    res.status(400).json({ error:"invalid_subscription" });
  }
});

// compat vecchie route push_subscribe/unsubscribe
app.post("/api/push_subscribe", auth, async (req,res)=>{
  try{
<<<<<<< ours
    const sub = req.body && req.body.subscription;
    if(!sub) return res.status(400).json({ error:"missing subscription" });
    await saveSubscription(req.user.id, sub);
=======
    const fsN = require('fs').promises, pN = require('path');
    const f = pN.join(__dirname, "data", "push_subscriptions.json");
    let db;
    try {
      await fsN.access(f);
      db = JSON.parse(await fsN.readFile(f,'utf8'));
    } catch(_) {
      db = { subscriptions: [] };
    }
    const entry = { userId: req.user.id, subscription: req.body && req.body.subscription };
    if(!entry.subscription) return res.status(400).json({ error:"missing subscription" });
    const ep = entry.subscription && entry.subscription.endpoint;
    const filtered = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
    filtered.push(entry);
    db.subscriptions = filtered;
    await fsN.writeFile(f + ".tmp", JSON.stringify(db,null,2));
    await fsN.rename(f+".tmp", f);
>>>>>>> theirs
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:"fail" }); }
});
app.post("/api/push_unsubscribe", auth, async (req,res)=>{
  try{
<<<<<<< ours
    const ep = req.body && req.body.endpoint;
    if(!ep) return res.status(400).json({ error:"missing endpoint" });
    await deleteSubscription(ep);
=======
    const fsN = require('fs').promises, pN = require('path');
    const f = pN.join(__dirname, "data", "push_subscriptions.json");
    let db;
    try {
      await fsN.access(f);
      db = JSON.parse(await fsN.readFile(f,'utf8'));
    } catch(_) {
      db = { subscriptions: [] };
    }
    const ep = req.body && req.body.endpoint;
    if(!ep) return res.status(400).json({ error:"missing endpoint" });
    db.subscriptions = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
    await fsN.writeFile(f + ".tmp", JSON.stringify(db,null,2));
    await fsN.rename(f+".tmp", f);
>>>>>>> theirs
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error:"fail" }); }
});
=======
>>>>>>> theirs

// test push notification to current user
app.post("/api/push/test", auth, async (req,res)=>{
  try{
    if(!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error:"not_configured" });
    const subs = await getSubscriptions(req.user.id);
    const payload = (req.body && req.body.payload) || { title:"BP Test", body:"Notifica di prova", url:"/" };
    await Promise.all(subs.map(s=> webpush.sendNotification(s, JSON.stringify(payload)).catch(()=>{})));
    res.json({ ok:true, sent: subs.length });
  }catch(e){ res.status(500).json({ error:"fail" }); }
});

// ---------- Audit client error (opzionale) ----------
app.post("/api/client_error", async (req,res)=>{
  try{
    let audit = null; try { audit = require("./lib/audit").audit; } catch(_){}
    if(audit){
      const { message, stack, url, info } = (req.body||{});
      await audit("client_error", { message, stack, url, info }, req);
    }
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});

<<<<<<< ours
// ---------- Static + SPA ----------
const FRONT_ROOT = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, "..", "frontend", "dist")
  : path.join(__dirname, "..", "frontend");

app.use(express.static(FRONT_ROOT));
app.get("/", (_req,res)=> res.sendFile(path.join(FRONT_ROOT, "index.html")));
app.get(/^\/(?!api\/).*/, (_req,res)=> res.sendFile(path.join(FRONT_ROOT, "index.html")));
=======
// ---------- Static + SPA (serve dist se esiste) ----------
async function setupStatic(){
  const dist = path.join(__dirname, "..", "frontend", "dist");
  const root = path.join(__dirname, "..", "frontend");
  let frontRoot = root;
  try {
    if(await fs.pathExists(path.join(dist, "index.html"))) frontRoot = dist;
  } catch(_){}
  app.use(express.static(frontRoot));
  app.get("/", (_req,res)=> res.sendFile(path.join(frontRoot, "index.html")));
  app.get(/^\/(?!api\/).*/, (_req,res)=> res.sendFile(path.join(frontRoot, "index.html")));
}
>>>>>>> theirs


// ---------- Start ----------
ensureFiles().then(async ()=>{
  await setupStatic();
  app.listen(PORT, HOST, ()=> console.log(`BP backend listening on http://${HOST}:${PORT}`));

  // mini-cron: ogni minuto prova (le condizioni interne filtrano sab/dom 12:00 e 1 volta al giorno)
  let LAST_PUSH_MARK = ""; // "YYYY-MM-DD"
  async function runWeekendNoonPushOncePerDay(){
    const now = new Date();
    const day = now.getDay(); // 0 dom, 6 sab
    const hr  = now.getHours();
    if(![0,6].includes(day)) return;
    if(hr !== 12) return;
    const mark = ymd(now);
    if(LAST_PUSH_MARK === mark) return;

    const usersDb = await readJSON("users.json");
    const periodsDb= await readJSON("periods.json");

    const s = startOfWeek(now), e = endOfWeek(now);
    const sISO = s.toISOString(), eISO = e.toISOString();

    function hasWeekPrevCons(userId){
      const week = (periodsDb.periods||[]).find(p =>
        p.userId===userId && p.type==='settimanale' &&
        ymd(p.startDate)===ymd(sISO) && ymd(p.endDate)===ymd(eISO)
      );
      const prevOk = !!(week && week.indicatorsPrev && Object.keys(week.indicatorsPrev).some(k=>Number(week.indicatorsPrev[k]||0)>0));
      const consOk = !!(week && week.indicatorsCons && Object.keys(week.indicatorsCons).some(k=>Number(week.indicatorsCons[k]||0)>0));
      return { prevOk, consOk };
    }

    async function sendPushToUser(userId, payload){
      if(!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
      const subs = await getSubscriptions(userId);
      await Promise.all(subs.map(async s=>{
        try{
          await webpush.sendNotification(s, JSON.stringify(payload));
        }catch(e){ /* ignora endpoint morti */ }
      }));
    }

    for(const u of (usersDb.users||[])){
      const { prevOk, consOk } = hasWeekPrevCons(u.id);
      if(prevOk && consOk) continue;
      await sendPushToUser(u.id, {
        t: "bp_reminder",
        title: "Battle Plan",
        body: !prevOk && !consOk ? "Completa Previsionale e Consuntivo della settimana."
             : !prevOk ? "Completa il BP Previsionale della settimana."
             : "Completa il BP Consuntivo della settimana.",
        url: "/"
      });
    }
    LAST_PUSH_MARK = mark;
  }

  setInterval(()=>{ runWeekendNoonPushOncePerDay().catch(()=>{}); }, 60*1000);
});
