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
const helmet = require("helmet");
const compression = require("compression");
const fs = require("fs-extra");
const path = require("path");
// Validazione variabili ambiente critiche
function validateEnvironment() {
  const errors = [];
  const warnings = [];
  
  // Variabili obbligatorie
  if (!process.env.BP_JWT_SECRET) {
    errors.push('BP_JWT_SECRET mancante - CRITICO per autenticazione');
  }
  
  if (!process.env.SUPABASE_URL) {
    errors.push('SUPABASE_URL mancante - CRITICO per database');
  }
  
  if (!process.env.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY mancante - CRITICO per database');
  }
  
  // Variabili raccomandate
  if (!process.env.CORS_ORIGIN) {
    warnings.push('CORS_ORIGIN mancante - Potrebbero esserci problemi CORS');
  }
  
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    warnings.push('VAPID keys mancanti - Push notifications non funzioneranno');
  }
  
  if (!process.env.SMTP_URL) {
    warnings.push('SMTP_URL mancante - Email non funzioneranno');
  }
  
  // Log risultati
  if (errors.length > 0) {
    console.error('🚨 ERRORI VARIABILI AMBIENTE CRITICI:');
    errors.forEach(error => console.error(`   ❌ ${error}`));
    console.error('💥 L\'applicazione potrebbe non funzionare correttamente!');
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  AVVISI VARIABILI AMBIENTE:');
    warnings.forEach(warning => console.warn(`   ⚠️  ${warning}`));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Tutte le variabili ambiente configurate correttamente');
  }
  
  return errors.length === 0;
}

// Esegui validazione all'avvio
const envValid = validateEnvironment();

// Endpoint per validazione ambiente (solo in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/env-check', (req, res) => {
    const errors = [];
    const warnings = [];
    
    // Controlla variabili critiche
    if (!process.env.BP_JWT_SECRET) errors.push('BP_JWT_SECRET');
    if (!process.env.SUPABASE_URL) errors.push('SUPABASE_URL');
    if (!process.env.SUPABASE_ANON_KEY) errors.push('SUPABASE_ANON_KEY');
    
    // Controlla variabili raccomandate
    if (!process.env.CORS_ORIGIN) warnings.push('CORS_ORIGIN');
    if (!process.env.VAPID_PUBLIC_KEY) warnings.push('VAPID_PUBLIC_KEY');
    if (!process.env.VAPID_PRIVATE_KEY) warnings.push('VAPID_PRIVATE_KEY');
    if (!process.env.SMTP_URL) warnings.push('SMTP_URL');
    
    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString()
    });
  });
}

const useSupabaseStorage = process.env.BP_STORAGE === 'supabase' || !!process.env.SUPABASE_URL;
const usePgStorage = process.env.BP_STORAGE === 'pg' || !!process.env.PG_URL;
let storage;
if (useSupabaseStorage) {
  storage = require("./lib/storage-supabase");
} else if (usePgStorage) {
  storage = require("./lib/storage-pg");
} else {
  // Fallback rimosso: ora usiamo solo Supabase per consistenza cross-device
  console.error("ERROR: Supabase storage is required for cross-device consistency");
  console.error("Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables");
  process.exit(1);
}
const { init, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord } = storage;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { parseDateTime, toUTCString, ymdUTC, timeHMUTC, minutesBetween, addMinutes, timeRangesOverlap } = require('./lib/timezone');
const { customAlphabet } = require("nanoid");
const dotenv = require("dotenv");
const logger = require("./lib/logger");
let nodemailer = null; try { nodemailer = require("nodemailer"); } catch(_) { /* opzionale */ }
// middleware opzionale (se non presente, commenta la riga)
let timing = null; try { timing = require("./mw/timing"); } catch(_) { timing = () => (_req,_res,next)=>next(); }
const rateLimit = require("./mw/rateLimit");
if (process.env.NODE_ENV !== 'production') {
  dotenv.config(); // .env: BP_JWT_SECRET, VAPID_*, TZ, etc.
}
const DEFAULT_JWT_SECRET = "bp_v13_demo_secret";
const JWT_SECRET = process.env.BP_JWT_SECRET || DEFAULT_JWT_SECRET;

// fail-fast in produzione se secret non configurato
if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
  logger.error("BP_JWT_SECRET mancante o di default in produzione. Impostare una variabile d'ambiente sicura.");
  process.exit(1);
}

// web-push (opzionale)
let webpush = null;
try { webpush = require("web-push"); } catch(_){ /* opzionale */ }

// Log configurazione VAPID per debug
if (webpush) {
  console.log('[BP] Web-push module loaded successfully');
} else {
  console.warn('[BP] Web-push module not available - push notifications disabled');
}

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
  console.log('[BP] VAPID keys configured successfully');
  console.log('[BP] VAPID Subject:', VAPID_SUBJECT);
  console.log('[BP] VAPID Public Key:', VAPID_PUBLIC_KEY.substring(0, 20) + '...');
} else {
  console.warn('[BP] VAPID keys not configured - push notifications disabled');
  console.warn('[BP] Missing:', {
    webpush: !!webpush,
    VAPID_PUBLIC_KEY: !!VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!VAPID_PRIVATE_KEY
  });
}

// ---------- App ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(timing(500));
// Helmet with relaxed CSP suitable for this SPA (allows inline + jsDelivr)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      // Allow inline scripts (Vite runtime snippets) and jsDelivr CDN assets used by the app
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      // Permit inline event handlers if present
      "script-src-attr": ["'unsafe-inline'"],
      // Inline <style> blocks and styles are used in the HTML and injected dynamically
      "style-src": ["'self'", "'unsafe-inline'"],
      // Allow images and icons embedded as data URIs
      "img-src": ["'self'", "data:", "blob:"],
      // Allow same-origin API calls and CDN fetches (e.g., Chart.js via SW)
      "connect-src": ["'self'", "https://cdn.jsdelivr.net"],
      // Fonts from self (and allow data: for inlined fonts if any)
      "font-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'self'"],
      // Service worker / workers
      "worker-src": ["'self'", "blob:"],
    },
  },
  // Disable COEP to avoid issues loading CDN assets without cross-origin isolation
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
// CORS: consentire origine configurabile, default aperto (dev)
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
if (CORS_ORIGIN && CORS_ORIGIN !== '*') {
  app.use(cors({ origin: CORS_ORIGIN }));
} else {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

// ---------- Storage ----------
let _initStorePromise = Promise.resolve();

// Inizializza Supabase se disponibile
let supabase = null;
if (useSupabaseStorage) {
  console.log('[BP] useSupabaseStorage is true, checking environment variables...');
  console.log('[BP] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
  console.log('[BP] SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
  
  _initStorePromise = _initStorePromise.then(() => {
    console.log('[BP] Initializing Supabase connection...');
    return init().then(() => {
      supabase = storage.supabase;
      console.log('[BP] Supabase client assigned to routes');
    });
  });
} else {
  console.log('[BP] useSupabaseStorage is false, skipping Supabase initialization');
}
function genId(){ return nanoid(); }
function todayISO(){ return new Date().toISOString(); }
function pad2(n){ return n<10 ? "0"+n : ""+n; }
function ymd(d){
  return ymdUTC(d);
}
function toLocalInputValue(d){
  const x = new Date(d);
  const pad = n => (n<10?'0':'')+n;
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
function fromLocalInputValue(s){ // "YYYY-MM-DDTHH:MM" -> Date (locale)
  return parseDateTime(s);
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
      logger.info(`[email] to:${to} subject:${subject} text:${text}`);
    }
  }catch(e){
    logger.error("sendEmail error", e);
  }
}
function computeEndLocal(startLocalStr, type, minutes){
  const start = fromLocalInputValue(startLocalStr);
  let dur = Number(minutes||0);
  if(!dur){
    if(type==="vendita") dur = 90;
    else if(type==="mezza-giornata") dur = 240;
    else if(type==="giornata") dur = 570;
    else if(type==="riunione") dur = 60;
    else if(type==="impegni personali") dur = 60;
    else dur = 60;
  }
  const end = addMinutes(start, dur);
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

  const ensure = async (name, def) => {
    try{ await readJSON(name); }
    catch{ await writeJSON(name, def); }
  };

  async function ensureDefaults(){
    await ensure("users.json", { users: [] });
    await ensure("appointments.json", { appointments: [] });
    await ensure("clients.json", { clients: [] });
    await ensure("periods.json", { periods: [] });
    await ensure("push_subscriptions.json", { subs: [] });
    await ensure("gi.json", { sales: [] });
    await ensure("open_cycles.json", { cycles: [] });
    await ensure("settings.json", {
      indicators: ["VSS","VSDPersonale","VSDIndiretto","GI","Telefonate","AppFissati","AppFatti","CorsiLeadership","iProfile","MBS","NNCF"],
      weights: { VSS:0.25, VSDPersonale:0.25, GI:0.30, NNCF:0.20 },
      commissions: { gi:0.15, vsdJunior:0.20, vsdSenior:0.25 },
      version: 13
    });
  }

  async function loadLegacyDb(){
    const legacyPaths = [
      path.join(DATA_DIR, "db.json"),
      path.join(__dirname, "db.json"),
      path.join(process.cwd(), "db.json"),
    ];
    for(const p of legacyPaths){
      if(await fs.pathExists(p)){
        try{ return await fs.readJSON(p); }catch(e){}
      }
    }
    return null;
  }

  function _legacyStartStr(a){
    return a.start ? toLocalInputValue(a.start) : toLocalInputValue(new Date());
  }
  function _legacyEndStr(a){
    if (a.end) return toLocalInputValue(a.end);
    const base = toLocalInputValue(a.start||new Date());
    return computeEndLocal(base, a.type, a.durationMinutes);
  }
  function mapLegacyAppointment(a){
    const nowIso = new Date().toISOString();
    return {
      id: a.id || genId(),
      userId: a.userId,
      client: a.client,
      clientId: a.clientId || null,
      type: a.type || "manuale",
      start: _legacyStartStr(a),
      end: _legacyEndStr(a),
      durationMinutes: Number(a.durationMinutes||0),
      vss: Number(a.vss||0),
      vsdPersonal: Number(a.vsdPersonal||0),
      nncf: !!a.nncf,
      notes: a.notes || "",
      createdAt: a.createdAt || nowIso,
      updatedAt: a.updatedAt || nowIso
    };
  }

  async function migrateFromLegacyIfEmpty(legacy){
    if(!legacy || typeof legacy!=="object") return;
    const usersDb   = await readJSON("users.json");
    const appsDb    = await readJSON("appointments.json");
    const clientsDb = await readJSON("clients.json");
    const periodsDb = await readJSON("periods.json");
    const settings  = await readJSON("settings.json");

    const emptyUsers   = (usersDb.users||[]).length === 0;
    const emptyApps    = (appsDb.appointments||[]).length === 0;
    const emptyClients = (clientsDb.clients||[]).length === 0;
    const emptyPeriods = (periodsDb.periods||[]).length === 0;

    async function migrateUsersIfEmpty(){
      if(!(emptyUsers && Array.isArray(legacy.users))) return;
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
      logger.info("[MIGRATE] users imported from db.json");
    }

    async function migrateAppointmentsIfEmpty(){
      if(!(emptyApps && Array.isArray(legacy.appointments))) return;
      appsDb.appointments = legacy.appointments.map(mapLegacyAppointment);
      await writeJSON("appointments.json", appsDb);
      logger.info("[MIGRATE] appointments imported from db.json");
    }

    async function migrateClientsIfEmpty(){
      if(!(emptyClients && Array.isArray(legacy.clients))) return;
      clientsDb.clients = legacy.clients.map(c => ({
        id: c.id || genId(),
        name: c.name || "Cliente",
        status: c.status || "attivo",
        consultantId: c.consultantId || null,
        consultantName: c.consultantName || null,
        createdAt: c.createdAt || todayISO()
      }));
      await writeJSON("clients.json", clientsDb);
      logger.info("[MIGRATE] clients imported from db.json");
    }

    async function migratePeriodsIfEmpty(){
      if(!(emptyPeriods && Array.isArray(legacy.periods))) return;
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
      logger.info("[MIGRATE] periods imported from db.json");
    }

    async function mergeSettingsIfPresent(){
      if(!(legacy.settings && typeof legacy.settings==="object")) return;
      await writeJSON("settings.json", { ...settings, ...legacy.settings, version: 13 });
      logger.info("[MIGRATE] settings merged from db.json");
    }

    await migrateUsersIfEmpty();
    await migrateAppointmentsIfEmpty();
    await migrateClientsIfEmpty();
    await migratePeriodsIfEmpty();
    await mergeSettingsIfPresent();
  }

  await ensureDefaults();
  const legacy = await loadLegacyDb();
  await migrateFromLegacyIfEmpty(legacy);
}

// ---------- Auth ----------
function signToken(u){
  return jwt.sign({ id:u.id, role:u.role, name:u.name, permissions:u.permissions||[] }, JWT_SECRET, { expiresIn:"365d" }); // 1 anno
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

// ---------- Health ----------
app.get("/api/health", (req,res)=> res.json({ ok:true, v:"13.7" }));
// ---------- Readiness ----------
app.get("/api/ready", async (_req,res)=>{
  try {
    // touch a known key to ensure storage is available
    await readJSON("settings.json");
    return res.json({ ok:true });
  } catch(e){
    return res.status(503).json({ ok:false });
  }
});

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
  
  // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof insertRecord === 'function') {
    try {
      const mappedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        pass: user.pass,
        role: user.role,
        grade: user.grade,
        permissions: user.permissions,
        resettoken: user.resetToken,
        resettokenexp: user.resetTokenExp,
        createdat: user.createdAt
      };
      await insertRecord('app_users', mappedUser);
    } catch (error) {
      console.error('Error inserting user:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  res.json({ ok:true });
});

app.post("/api/login", rateLimit({ windowMs: 2*60*1000, max: 5 }), async (req,res)=>{
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

app.post("/api/reset-password", rateLimit({ windowMs: 2*60*1000, max: 5 }), async (req,res)=>{
  const { email } = req.body || {};
  if(!email) return res.status(400).json({ error:"missing email" });
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.email.toLowerCase() === String(email).toLowerCase());
  if(!u) return res.status(404).json({ error:"user not found" });
  const token = genId();
  u.resetToken = await bcrypt.hash(token, 10);
  u.resetTokenExp = Date.now() + 1000*60*60; // 1h
  
  // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof updateRecord === 'function') {
    try {
      const mappedUpdates = {
        resettoken: u.resetToken,
        resettokenexp: u.resetTokenExp
      };
      await updateRecord('app_users', u.id, mappedUpdates);
    } catch (error) {
      console.error('Error updating user reset token:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  await sendEmail(u.email, "Reset Password", `Your reset token is ${token}`);
  res.json({ ok:true });
});
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
  
  // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof insertRecord === 'function') {
    try {
      const mappedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        pass: user.pass,
        role: user.role,
        grade: user.grade,
        permissions: user.permissions,
        resettoken: user.resetToken,
        resettokenexp: user.resetTokenExp,
        createdat: user.createdAt
      };
      await insertRecord('app_users', mappedUser);
    } catch (error) {
      console.error('Error inserting user:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  res.json({ ok:true, id:user.id });
});

// update role/grade/name/permissions
function _applyUserUpdates(db, user, body){
  if(body.name) user.name = String(body.name);
  if(body.role) user.role = (body.role==="admin" ? "admin" : "consultant");
  if(body.grade) user.grade = (body.grade==="senior" ? "senior" : "junior");
  if(Array.isArray(body.permissions)) user.permissions = body.permissions;
  if(body.email){
    const exists = (db.users||[]).some(x => x.email.toLowerCase() === String(body.email).toLowerCase() && x.id !== user.id);
    if(exists) return { error: { code:409, msg:"email exists" } };
    user.email = String(body.email).toLowerCase();
  }
  return { ok:true };
}

app.post("/api/users", auth, requirePermission("users:write"), async (req,res)=>{
  const body = req.body || {};
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.id === body.id);
  if(!u) return res.status(404).json({ error:"user not found" });
  const r = _applyUserUpdates(db, u, body);
  if(r.error) return res.status(r.error.code).json({ error:r.error.msg });
  if(body.password){
    u.pass = await bcrypt.hash(String(body.password), 10);
  }
  
  // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof updateRecord === 'function') {
    try {
      const mappedUpdates = {
        name: u.name,
        email: u.email,
        pass: u.pass,
        role: u.role,
        grade: u.grade,
        permissions: u.permissions,
        resettoken: u.resetToken,
        resettokenexp: u.resetTokenExp
      };
      await updateRecord('app_users', u.id, mappedUpdates);
    } catch (error) {
      console.error('Error updating user:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  res.json({ ok:true });
});
app.post("/api/users/profile", auth, async (req,res)=>{
  const { id, name, email, password } = req.body || {};
  if(req.user.id !== id) return res.status(403).json({ error:"forbidden" });
  const db = await readJSON("users.json");
  const u = (db.users||[]).find(x => x.id === id);
  if(!u) return res.status(404).json({ error:"user not found" });
  const r = _applyUserUpdates(db, u, { name, email });
  if(r.error) return res.status(r.error.code).json({ error:r.error.msg });
  if(password){
    u.pass = await bcrypt.hash(String(password), 10);
  }
  
  // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof updateRecord === 'function') {
    try {
      const mappedUpdates = {
        name: u.name,
        email: u.email,
        pass: u.pass
      };
      await updateRecord('app_users', u.id, mappedUpdates);
    } catch (error) {
      console.error('Error updating user profile:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  res.json({ ok:true });
});


// update credentials (email/password) self/admin
function _tryUpdateEmail(db, user, email, isSelf, isAdmin){
  if(!email) return { ok:true };
  const exists = (db.users||[]).some(x => x.email.toLowerCase() === String(email).toLowerCase() && x.id !== user.id);
  if(exists) return { error:{ code:409, msg:"email exists" } };
  if(!isSelf && !isAdmin) return { error:{ code:403, msg:"forbidden" } };
  user.email = String(email).toLowerCase();
  return { ok:true };
}
async function _tryUpdatePassword(user, isSelf, isAdmin, oldPassword, newPassword){
  if(!newPassword) return { ok:true };
  if(!(isAdmin || isSelf)) return { error:{ code:403, msg:"forbidden" } };
  if(isSelf && !isAdmin){
    const ok = await bcrypt.compare(String(oldPassword||""), user.pass||"");
    if(!ok) return { error:{ code:401, msg:"bad current password" } };
  }
  user.pass = await bcrypt.hash(String(newPassword), 10);
  return { ok:true };
}

app.post("/api/users/credentials", auth, async (req,res)=>{
  const { userId, email, oldPassword, newPassword } = req.body || {};
  const db = await readJSON("users.json");
  const targetId = userId || req.user.id;
  const u = (db.users||[]).find(x => x.id === targetId);
  if(!u) return res.status(404).json({ error:"user not found" });

  const isSelf = (req.user.id === targetId);
  const isAdmin = (req.user.role === "admin");

  const r1 = _tryUpdateEmail(db, u, email, isSelf, isAdmin);
  if(r1.error) return res.status(r1.error.code).json({ error:r1.error.msg });
  const r2 = await _tryUpdatePassword(u, isSelf, isAdmin, oldPassword, newPassword);
  if(r2.error) return res.status(r2.error.code).json({ error:r2.error.msg });

  // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof updateRecord === 'function') {
    try {
      const mappedUpdates = {
        email: u.email,
        pass: u.pass
      };
      await updateRecord('app_users', u.id, mappedUpdates);
    } catch (error) {
      console.error('Error updating user password:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
  res.json({ ok:true });
});

// delete user (admin), with safety: do not delete the last admin
app.delete("/api/users", auth, requirePermission("users:write"), async (req,res)=>{
  const id = String(req.query.id||"");
  if(!id) return res.status(400).json({ error:"missing id" });
  const db = await readJSON("users.json");
  const users = db.users || [];
  const idx = users.findIndex(u => u.id === id);
  if(idx === -1) return res.status(404).json({ error:"user not found" });

  // safety: prevent deleting the last admin
  const admins = users.filter(u => u.role === 'admin');
  const target = users[idx];
  if(target.role === 'admin' && admins.length <= 1){
    return res.status(409).json({ error:"cannot delete last admin" });
  }

  users.splice(idx, 1);
  db.users = users;
  
  // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof deleteRecord === 'function') {
    try {
      await deleteRecord('app_users', id);
    } catch (error) {
      console.error('Error deleting user:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("users.json", db);
    }
  }
  
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
  const newSettings = { ...cur, ...(req.body||{}), version: 13 };
  
  // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof updateRecord === 'function') {
    try {
      // Settings è una tabella singleton, aggiorna sempre il record con id=1
      const mappedSettings = {
        id: 1, // ID fisso per settings singleton
        data: {
          indicators: newSettings.indicators,
          weights: newSettings.weights,
          commissions: newSettings.commissions
        },
        version: newSettings.version
      };
      await updateRecord('settings', 1, mappedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("settings.json", newSettings);
    }
  }
  
  res.json({ ok:true });
});

// ---------- Clients ----------
app.get("/api/clients", auth, async (req,res)=>{
  const db = await readJSON("clients.json");
  res.json({ clients: db.clients||[] });
});

function _applyClientUpdate(c, body, isAdmin){
  const { name, status, consultantId, consultantName } = body || {};
  if (status && status !== c.status){
    if (status === "attivo" || isAdmin){
      c.status = String(status);
    } else {
      return { error:{ code:403, msg:"admin only for status change" } };
    }
  }
  if(name) c.name = String(name);
  if(consultantId!=null) c.consultantId = String(consultantId||"");
  if(consultantName!=null) c.consultantName = String(consultantName||"");
  return { ok:true };
}

app.post("/api/clients", auth, async (req,res)=>{
  const body = req.body || {};
  const db = await readJSON("clients.json");
  db.clients = db.clients || [];

  if(body.id){
    const c = db.clients.find(x => x.id === body.id);
    if(!c) return res.status(404).json({ error:"not found" });
    const isAdmin = (req.user.role === "admin");
    const r = _applyClientUpdate(c, body, isAdmin);
    if(r.error) return res.status(r.error.code).json({ error:r.error.msg });
    
    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        const mappedUpdates = {
          name: c.name,
          status: c.status,
          consultantid: c.consultantId,
          consultantname: c.consultantName,
          updatedat: new Date().toISOString()
        };
        await updateRecord('clients', c.id, mappedUpdates);
      } catch (error) {
        console.error('Error updating client:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("clients.json", db);
      }
    }
    return res.json({ ok:true, id:c.id });
  }

  const { name } = body;
  if(!name || !String(name).trim()) return res.status(400).json({ error:"missing name" });
  const exists = db.clients.find(x => (x.name||"").toLowerCase() === String(name).toLowerCase());
  if(!exists){
    const newClient = {
      id: genId(),
      name: String(name),
      status: "attivo",
      consultantId: req.user.id,
      consultantName: req.user.name || "unknown",
      createdAt: todayISO()
    };
    db.clients.push(newClient);
    
    // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof insertRecord === 'function') {
      try {
        const mappedClient = {
          id: newClient.id,
          name: newClient.name,
          status: newClient.status,
          consultantid: newClient.consultantId,
          consultantname: newClient.consultantName,
          createdat: newClient.createdAt,
          updatedat: newClient.createdAt
        };
        await insertRecord('clients', mappedClient);
      } catch (error) {
        console.error('Error inserting client:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("clients.json", db);
      }
    }
  }
  return res.json({ ok:true });
});

app.delete("/api/clients", auth, async (req,res)=>{
  const id = req.query.id;
  const db = await readJSON("clients.json");
  const i = (db.clients||[]).findIndex(x => x.id === id);
  if(i===-1) return res.status(404).json({ error:"not found" });
  db.clients.splice(i,1);
  
  // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof deleteRecord === 'function') {
    try {
      await deleteRecord('clients', id);
    } catch (error) {
      console.error('Error deleting client:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("clients.json", db);
    }
  }
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
    
    // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof insertRecord === 'function') {
      try {
        const mappedClient = {
          id: c.id,
          name: c.name,
          status: c.status,
          consultantid: c.consultantId,
          consultantname: c.consultantName,
          createdat: c.createdAt,
          updatedat: c.createdAt
        };
        await insertRecord('clients', mappedClient);
      } catch (error) {
        console.error('Error inserting client:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("clients.json", cdb);
      }
    } else {
      // SQLite locale: usa il metodo tradizionale
      await writeJSON("clients.json", cdb);
    }
  } else {
    // assicura campi consulente
    if(!c.consultantId)   c.consultantId   = user.id;
    if(!c.consultantName) c.consultantName = user.name || "unknown";
    
    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        const mappedUpdates = {
          consultantid: c.consultantId,
          consultantname: c.consultantName,
          updatedat: new Date().toISOString()
        };
        await updateRecord('clients', c.id, mappedUpdates);
      } catch (error) {
        console.error('Error updating client:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("clients.json", cdb);
      }
    } else {
      // SQLite locale: usa il metodo tradizionale
      await writeJSON("clients.json", cdb);
    }
  }
  return c;
}

// Route che non dipendono da Supabase
const appointmentRoutes = require("./routes/appointments")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, computeEndLocal, findOrCreateClientByName, genId, supabase });
const pushRoutes = require("./routes/push")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, VAPID_PUBLIC_KEY });
const notificationsRoutes = require("./routes/notifications")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY });

app.use('/api', appointmentRoutes);
app.use('/api', pushRoutes);
app.use('/api/notifications', notificationsRoutes);

// ---------- Periods (BP) ----------
app.get("/api/periods", auth, async (req,res)=>{
  const { global, type: typeQ, from: fromISO, to: toISO, userId: userQ } = req.query || {};
  const db = await readJSON("periods.json");

  // Base set: admin+global=1 => tutti; altrimenti solo i propri
  const isAdmin = req.user.role === "admin";
  let rows = (db.periods || []);
  if (!(global === "1" && isAdmin)) {
    rows = rows.filter(p => String(p.userId) === String(req.user.id));
  }

  // Filtro opzionale: utente specifico (solo admin)
  if (userQ && isAdmin) {
    rows = rows.filter(p => String(p.userId) === String(userQ));
  }

  // Filtro opzionale: tipo periodo (settimanale|mensile|trimestrale|semestrale|annuale)
  const { effectivePeriodType } = require('./lib/periods');
  const t = typeQ ? effectivePeriodType(String(typeQ).toLowerCase()) : null;
  if (t) rows = rows.filter(p => String(p.type) === t);

  // Filtro opzionale: finestra temporale (inclusiva). Manteniamo la stessa
  // semantica usata lato frontend per dashboard/provvigioni: il periodo deve
  // essere completamente contenuto tra "from" e "to".
  if (fromISO && toISO) {
    const fs = new Date(fromISO).getTime();
    const te = new Date(toISO).getTime();
    if (isFinite(fs) && isFinite(te)) {
      rows = rows.filter(p => {
        const ps = new Date(p.startDate).getTime();
        const pe = new Date(p.endDate).getTime();
        return isFinite(ps) && isFinite(pe) && ps >= fs && pe <= te;
      });
    }
  }

  res.json({ periods: rows });
});

// --- helpers provvigioni (GI 15% tutti; VSDPersonale 20% junior / 25% senior) ---
function _gradeOf(userId, usersDb){
  const u = (usersDb.users||[]).find(x => String(x.id) === String(userId));
  return (u && u.grade==='senior') ? 'senior' : 'junior';
}
async function _computeProvvigioniForBag(bag, grade){
  if (!bag) return;
  const gi  = Number(bag.GI || 0);
  const vsdP= Number(bag.VSDPersonale || 0);
  
  // Carica settings da Supabase
  let settings = {};
  try {
    const { data, error } = await supabase.from('settings').select('data').eq('id', 'main').single();
    if (!error && data) settings = data.data || {};
  } catch (e) {
    console.warn('[BP] Error loading settings for commissions, using defaults');
  }
  
  const commissions = settings.commissions || {};
  const rateGi   = Number(commissions.gi || 0.15);
  const rateVsdP = (grade==='senior') ? Number(commissions.vsdSenior || 0.25) : Number(commissions.vsdJunior || 0.20);
  
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
  await _computeProvvigioniForBag(row.indicatorsPrev, grade);
  await _computeProvvigioniForBag(row.indicatorsCons, grade);
}

function _periodKey(p){
  return [
    p.userId, p.type,
    (new Date(p.startDate)).toISOString().slice(0,10),
    (new Date(p.endDate)).toISOString().slice(0,10)
  ].join("|");
}
function _mergeIndicators(target, incoming){
  return { ...(target||{}), ...(incoming||{}) };
}

app.post("/api/periods", auth, async (req,res)=>{
  const { id, type, startDate, endDate, indicatorsPrev, indicatorsCons } = req.body || {};
  if(!type || !startDate || !endDate) {
    return res.status(400).json({ error:"missing fields" });
  }

  const db = await readJSON("periods.json");
  db.periods = db.periods || [];

  const rowProbe = {
    userId: req.user.id,
    type: String(type),
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString()
  };

  async function updateById(){
    const it = db.periods.find(p => p.id === id && (req.user.role==="admin" || p.userId === req.user.id));
    if(!it) return res.status(404).json({ error:"not found" });
    it.type = rowProbe.type; it.startDate = rowProbe.startDate; it.endDate = rowProbe.endDate;
    if (indicatorsPrev) it.indicatorsPrev = _mergeIndicators(it.indicatorsPrev, indicatorsPrev);
    if (indicatorsCons) it.indicatorsCons = _mergeIndicators(it.indicatorsCons, indicatorsCons);
    await _applyProvvigioni(it);
    
    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        const mappedUpdates = {
          userid: it.userId,
          type: it.type,
          startdate: it.startDate,
          enddate: it.endDate,
          indicatorsprev: it.indicatorsPrev,
          indicatorscons: it.indicatorsCons
        };
        await updateRecord('periods', it.id, mappedUpdates);
      } catch (error) {
        console.error('Error updating period:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("periods.json", db);
      }
    }
    
    return res.json({ ok:true, id: it.id, updated:true });
  }

  async function upsertByKey(){
    const existing = db.periods.find(p => _periodKey(p) === _periodKey({ ...rowProbe }));
    if(!existing) return null;
    if (indicatorsPrev) existing.indicatorsPrev = _mergeIndicators(existing.indicatorsPrev, indicatorsPrev);
    if (indicatorsCons) existing.indicatorsCons = _mergeIndicators(existing.indicatorsCons, indicatorsCons);
    await _applyProvvigioni(existing);
    
    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        const mappedUpdates = {
          userid: existing.userId,
          type: existing.type,
          startdate: existing.startDate,
          enddate: existing.endDate,
          indicatorsprev: existing.indicatorsPrev,
          indicatorscons: existing.indicatorsCons
        };
        await updateRecord('periods', existing.id, mappedUpdates);
      } catch (error) {
        console.error('Error updating existing period:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("periods.json", db);
      }
    }
    
    return res.json({ ok:true, id: existing.id, updated:true });
  }

  async function createNew(){
    const row = {
      id: genId(),
      ...rowProbe,
      indicatorsPrev: indicatorsPrev || {},
      indicatorsCons: indicatorsCons || {}
    };
    await _applyProvvigioni(row);
    db.periods.push(row);
    
    // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof insertRecord === 'function') {
      try {
        const mappedPeriod = {
          id: row.id,
          userid: row.userId,
          type: row.type,
          startdate: row.startDate,
          enddate: row.endDate,
          indicatorsprev: row.indicatorsPrev,
          indicatorscons: row.indicatorsCons
        };
        await insertRecord('periods', mappedPeriod);
      } catch (error) {
        console.error('Error inserting period:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("periods.json", db);
      }
    }
    
    return res.json({ ok:true, id: row.id, created:true });
  }

  if (id) return updateById();
  const up = await upsertByKey();
  if (up) return up;
  return createNew();
});

app.delete("/api/periods", auth, async (req,res)=>{
  const id = req.query.id;
  if(!id) return res.status(400).json({ error:"missing id" });
  const db = await readJSON("periods.json");
  const i = (db.periods || []).findIndex(p => p.id === id && (req.user.role==="admin" || p.userId === req.user.id));
  if(i === -1) return res.status(404).json({ error:"not found" });
  db.periods.splice(i,1);
  
  // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof deleteRecord === 'function') {
    try {
      await deleteRecord('periods', id);
    } catch (error) {
      console.error('Error deleting period:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("periods.json", db);
    }
  }
  
  res.json({ ok:true });
});
// ---------- end Periods (BP) ----------
// ---------- Availability (>=4h) ----------
app.get("/api/availability", auth, async (req,res)=>{
  const { from, to } = req.query || {};
  if(!from || !to) return res.status(400).json({ error:"missing from/to" });

  const global = req.query.global === '1' && req.user.role === 'admin';
  const userIdQ = req.query.user;
  const db = await readJSON("appointments.json");
  const usersDb = await readJSON("users.json");
  const allApps = db.appointments||[];

  const blocks = [
    { startH:8,  startM:30, endH:13, endM:0,  part:"morning"   },
    { startH:14, startM:0,  endH:19, endM:30, part:"afternoon" }
  ];
  function computeSlots(apps){
    function freeMinutesForBlock(date, b){
      const dayKey = ymdUTC(date);
      const blockStart = b.startH*60 + b.startM;
      const blockEnd   = b.endH*60 + b.endM;
      for(const a of apps){
        const startStr = String(a.start||'');
        if(startStr.slice(0,10) !== dayKey) continue;
        
        // Qualsiasi appuntamento occupa gli slot se interseca gli orari lavorativi
        // Non importa la tipologia, solo l'orario di sovrapposizione
        
        // Parse appointment times as UTC and convert to local time for comparison
        const appStart = parseDateTime(a.start);
        const appEnd = parseDateTime(a.end || a.start);
        if(isNaN(appStart) || isNaN(appEnd)) continue;
        
        // Convert UTC appointment times to local time for comparison with blocks
        const aStartLocal = appStart.getHours() * 60 + appStart.getMinutes();
        const aEndLocal = appEnd.getHours() * 60 + appEnd.getMinutes();
        
        const overlap = Math.max(0, Math.min(aEndLocal, blockEnd) - Math.max(aStartLocal, blockStart));
        if(overlap > 0) return 0;
      }
      return blockEnd - blockStart;
    }
    const out = [];
    const d0 = new Date(from), d1 = new Date(to);
    for(let d = new Date(d0); d <= d1; d.setDate(d.getDate()+1)){
      const dow = d.getDay();
      if(dow===0 || dow===6) continue;
      for(const b of blocks){
        const free = freeMinutesForBlock(d,b);
        if(free >= 240){
          const dateKey = ymdUTC(d);
          const start = `${dateKey}T${pad2(b.startH)}:${pad2(b.startM)}`;
          const end   = `${dateKey}T${pad2(b.endH)}:${pad2(b.endM)}`;
          out.push({ date: dateKey, start, end, part: b.part });
        }
      }
    }
    const summary = {
      total: out.length,
      mondays: out.filter(x => new Date(x.date).getDay()===1).length,
      others: out.filter(x => ![0,1,6].includes(new Date(x.date).getDay())).length
    };
    return { slots: out, summary };
  }

  if(global){
    let allSlots = [];
    const details = [];
    // Calcola chiave "oggi" per filtrare gli slot da oggi in poi (coerente con la UI)
    const todayKey = ymdUTC(new Date());
    for(const u of (usersDb.users||[])){
      const apps = allApps.filter(a => a.userId === u.id);
      const { slots, summary } = computeSlots(apps);
      allSlots = allSlots.concat(slots);
      // Conta solo gli slot futuri (>= oggi) per i dettagli per-consulente
      const futureTotal = (slots||[]).filter(s => String(s.date||'').slice(0,10) >= todayKey).length;
      // Manteniamo 'total' come conteggio da oggi in poi per corrispondere alla UX
      // Esponiamo anche 'totalAll' per eventuali usi futuri (totale nel range richiesto)
      details.push({ userId:u.id, name:u.name, total: futureTotal, totalAll: summary.total });
    }
    const summary = {
      total: allSlots.length,
      mondays: allSlots.filter(x => new Date(x.date).getDay()===1).length,
      others: allSlots.filter(x => ![0,1,6].includes(new Date(x.date).getDay())).length
    };
    return res.json({ slots: allSlots, summary, details });
  } else {
    const uid = (req.user.role==='admin' && userIdQ) ? userIdQ : req.user.id;
    const apps = allApps.filter(a => a.userId === uid);
    const { slots, summary } = computeSlots(apps);
    return res.json({ slots, summary });
  }
});

// ---- Leaderboard helpers ----
function _effType(t){ return (t==="ytd"||t==="ltm") ? "mensile" : t; }
function _isPeriodInRangeAndType(p, type, fs, te){
  if (type && p.type !== type) return false;
  const ps = new Date(p.startDate).getTime();
  const pe = new Date(p.endDate).getTime();
  return !(pe < fs || ps > te);
}
function _bagForMode(p, mode){ return mode==="previsionale" ? (p.indicatorsPrev||{}) : (p.indicatorsCons||{}); }
function _indicatorValue(indicator, bag){
  if (indicator === 'VSDTotale') return Number(bag.VSDPersonale||0) + Number(bag.VSDIndiretto||0);
  return Number(bag[indicator] || 0);
}

// ---------- Leaderboard (per indicatore) ----------
app.get("/api/leaderboard", auth, async (req,res)=>{
  const mode = (req.query.mode==="previsionale") ? "previsionale" : "consuntivo";
  const indicator = req.query.indicator;
  const fromISO = req.query.from, toISO = req.query.to;
  const typeQ = req.query.type; // filtro per tipo periodo (settimanale/mensile/…)
  if(!indicator || !fromISO || !toISO) return res.status(400).json({ error:"missing params" });

  const type = typeQ ? _effType(String(typeQ)) : null;

  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");

  const acc = {};
  for (const u of (usersDb.users||[])) acc[u.id] = { id:u.id, name:u.name, total:0 };

  const fs = new Date(fromISO).getTime();
  const te = new Date(toISO).getTime();
  const filtered = (periodsDb.periods||[]).filter(p => _isPeriodInRangeAndType(p, type, fs, te));
  for(const p of filtered){
    const val = _indicatorValue(indicator, _bagForMode(p, mode));
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

  const type = typeQ ? _effType(String(typeQ)) : null;
  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");
  
  // Carica settings da Supabase
  let settings = {};
  try {
    const { data, error } = await supabase.from('settings').select('data').eq('id', 'main').single();
    if (!error && data) settings = data.data || {};
  } catch (e) {
    console.warn('[BP] Error loading settings for leaderboard, using defaults');
  }

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

  const filtered = (periodsDb.periods||[]).filter(p => _isPeriodInRangeAndType(p, type, fs, te));
  for(const p of filtered){
    const bag = _bagForMode(p, mode);
    const row = acc[p.userId]; if(!row) continue;
    for(const k of KEYS){ row[k] += Number(bag[k]||0); }
  }

  const best = {};
  for(const k of KEYS){ best[k] = Math.max(1, ...Object.values(acc).map(r => Number(r[k]||0))); }

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

  const type = typeQ ? _effType(String(typeQ)) : null;
  const usersDb   = await readJSON("users.json");
  const periodsDb = await readJSON("periods.json");

  const fs = new Date(fromISO).getTime();
  const te = new Date(toISO).getTime();

  const acc = {};
  for(const u of (usersDb.users||[])) {
    acc[u.id] = { id:u.id, name:u.name, provvGi:0, provvVsd:0, provvTot:0 };
  }

  const filtered = (periodsDb.periods||[]).filter(p => _isPeriodInRangeAndType(p, type, fs, te));
  for(const p of filtered){
    const bag = _bagForMode(p, mode);
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

function _mapSchedule(arr){
  return Array.isArray(arr) ? arr.map(x => ({
    dueDate: String(x.dueDate||""), amount: Number(x.amount||0), note: String(x.note||"")
  })) : [];
}

app.post("/api/gi", auth, async (req,res)=>{
  const body = req.body || {};
  const db = await readJSON("gi.json");
  db.sales = db.sales || [];

  async function applyUpdate(it){
    if(req.user.role!=="admin" && String(it.consultantId||'')!==String(req.user.id))
      return res.status(403).json({ error:"forbidden" });
    const patchers = {
      clientId: v => String(v||""),
      clientName: v => String(v||""),
      date: v => String(v),
      services: v => String(v||""),
      vssTotal: v => Number(v||0),
      schedule: v => _mapSchedule(v),
    };
    for(const k of Object.keys(patchers)){
      if(Object.prototype.hasOwnProperty.call(body, k)){
        it[k] = patchers[k](body[k]);
      }
    }
    
    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        const mappedUpdates = {
          appointmentid: it.appointmentId,
          clientid: it.clientId,
          clientname: it.clientName,
          date: it.date,
          consultantid: it.consultantId,
          consultantname: it.consultantName,
          services: it.services,
          vsstotal: it.vssTotal,
          schedule: it.schedule,
          createdat: it.createdAt
        };
        await updateRecord('gi', it.id, mappedUpdates);
      } catch (error) {
        console.error('Error updating GI/sale:', error);
        // Fallback al metodo tradizionale se Supabase fallisce
        await writeJSON("gi.json", db);
      }
    }
    
    return res.json({ ok:true, id: it.id });
  }

  function buildRow(){
    return {
      id: genId(),
      appointmentId: body.appointmentId || null,
      clientId: String(body.clientId||""),
      clientName: String(body.clientName||"Cliente"),
      date: String(body.date || new Date().toISOString()),
      consultantId: String(body.consultantId || req.user.id),
      consultantName: String(body.consultantName || req.user.name || "unknown"),
      services: String(body.services || ""),
      vssTotal: Number(body.vssTotal || 0),
      schedule: _mapSchedule(body.schedule),
      createdAt: todayISO()
    };
  }

  if(body.id){
    const it = db.sales.find(s => s.id === body.id);
    if(!it) return res.status(404).json({ error:"not found" });
    return applyUpdate(it);
  }

  const row = buildRow();
  db.sales.push(row);
  
  // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof insertRecord === 'function') {
    try {
      const mappedSale = {
        id: row.id,
        appointmentid: row.appointmentId,
        clientid: row.clientId,
        clientname: row.clientName,
        date: row.date,
        consultantid: row.consultantId,
        consultantname: row.consultantName,
        services: row.services,
        vsstotal: row.vssTotal,
        schedule: row.schedule,
        createdat: row.createdAt
      };
      await insertRecord('gi', mappedSale);
    } catch (error) {
      console.error('Error inserting GI/sale:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("gi.json", db);
    }
  }
  
  return res.json({ ok:true, id: row.id });
});

app.delete("/api/gi", auth, async (req,res)=>{
  const id = String(req.query.id||"");
  const db = await readJSON("gi.json");
  const i = (db.sales||[]).findIndex(s => s.id===id && (req.user.role==="admin" || String(s.consultantId||'')===String(req.user.id)));
  if(i===-1) return res.status(404).json({ error:"not found" });
  db.sales.splice(i,1);
  
  // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
  if (typeof deleteRecord === 'function') {
    try {
      await deleteRecord('gi', id);
    } catch (error) {
      console.error('Error deleting GI/sale:', error);
      // Fallback al metodo tradizionale se Supabase fallisce
      await writeJSON("gi.json", db);
    }
  }
  
  res.json({ ok:true });
});
// ---------- end GI & Scadenzario ----------


// ---------- Web Push: publicKey + subscribe (compat + versione nuova) ----------
// push publicKey/subscribe gestite nel router /api/push/*

// endpoint di diagnostica push notifications
app.get("/api/push/status", auth, async (req,res)=>{
  try{
    const status = {
      configured: !!(webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      webpush: !!webpush,
      vapid_public: !!VAPID_PUBLIC_KEY,
      vapid_private: !!VAPID_PRIVATE_KEY,
      vapid_subject: VAPID_SUBJECT,
      user_subscriptions: 0
    };
    
    // count user subscriptions
    try{
      const db = await readJSON("push_subscriptions.json");
      const userSubs = (db.subs || db.subscriptions || []).filter(s => String(s.userId||'') === String(req.user.id));
      status.user_subscriptions = userSubs.length;
    }catch(_){}
    
    res.json(status);
  }catch(e){ 
    console.error('[BP] Push status error:', e);
    res.status(500).json({ error:"fail" }); 
  }
});

// test push notification to current user
app.post("/api/push/test", auth, async (req,res)=>{
  try{
    console.log('[BP] Push test requested by user:', req.user.id);
    
    if(!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[BP] Push test failed - not configured');
      return res.status(500).json({ error:"not_configured" });
    }
    
    // read subscriptions from KV storage (supports SQLite/PG adapters)
    let subs = [];
    try{
      const db = await readJSON("push_subscriptions.json");
      const list = (db.subs || db.subscriptions || []).filter(s => String(s.userId||'') === String(req.user.id));
      subs = list.map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys||{}) }).filter(x => x && x.endpoint);
      console.log('[BP] Found subscriptions for user:', subs.length);
    }catch(e){ 
      console.error('[BP] Error reading subscriptions:', e);
      subs = []; 
    }
    
    const payload = (req.body && req.body.payload) || { title:"BP Test", body:"Notifica di prova", url:"/" };
    console.log('[BP] Sending test notification:', payload);
    
    const results = await Promise.all(subs.map(async (s, index) => {
      try {
        const result = await webpush.sendNotification(s, JSON.stringify(payload));
        console.log(`[BP] Notification ${index + 1} sent successfully`);
        return { success: true, index };
      } catch (error) {
        console.error(`[BP] Notification ${index + 1} failed:`, error.message);
        return { success: false, index, error: error.message };
      }
    }));
    
    const successful = results.filter(r => r.success).length;
    console.log('[BP] Test completed:', successful, 'successful,', results.length - successful, 'failed');
    
    res.json({ 
      ok: true, 
      sent: successful, 
      total: subs.length,
      results: results
    });
  }catch(e){ 
    console.error('[BP] Push test error:', e);
    res.status(500).json({ error:"fail" }); 
  }
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

// ---------- Static + SPA (serve dist se esiste) ----------
async function setupStatic(){
  const dist = path.join(__dirname, "..", "frontend", "dist");
  const root = path.join(__dirname, "..", "frontend");
  let frontRoot = root;
  try {
    if(await fs.pathExists(path.join(dist, "index.html"))) frontRoot = dist;
  } catch(_){ }
  // cache lunga per asset fingerprintati se esiste assets/
  try{
    const assetsDir = path.join(frontRoot, 'assets');
    if(await fs.pathExists(assetsDir)){
      app.use('/assets', express.static(assetsDir, { maxAge: '1y', immutable: true }));
    }
  }catch(_){ }
  // Ensure source helper libs and styles are served when using dist/
  try{
    const libDir = path.join(root, 'lib');
    if(await fs.pathExists(libDir)){
      app.use('/lib', express.static(libDir, { maxAge: '1h' }));
    }
  }catch(_){ }
  // Expose selected source modules used directly by the SPA (no bundler)
  try{
    const srcDir = path.join(root, 'src');
    if(await fs.pathExists(srcDir)){
      app.use('/src', express.static(srcDir, { maxAge: '1h' }));
    }
  }catch(_){ }
  try{
    const cssDir = path.join(root, 'css');
    if(await fs.pathExists(cssDir)){
      app.use('/css', express.static(cssDir, { maxAge: '1h' }));
    }
  }catch(_){ }
  // serve esplicitamente il Service Worker dalla root del frontend anche quando si usa dist/
  try{
    const swFromFrontRoot = path.join(frontRoot, 'push-sw.js');
    const swFromSourceRoot = path.join(root, 'push-sw.js');
    const swFromBackend    = path.join(__dirname, 'push-sw.js'); // optional local fallback
    app.get('/push-sw.js', async (_req,res)=>{
      res.set('Cache-Control','no-store');
      res.type('application/javascript');

      // try a few locations in order, then inline fallback
      const candidates = [swFromFrontRoot, swFromSourceRoot, swFromBackend];
      for (const p of candidates){
        try{ if (await fs.pathExists(p)) return res.sendFile(p); }catch(_){ /* ignore */ }
      }

      const inlineFallback = `/* BPApp push-sw fallback (inline) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients && self.clients.claim && clients.claim());
self.addEventListener('push', (event) => {
  try{
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Battle Plan';
    const body = data.body || 'Hai una nuova notifica';
    const tag = data.tag || 'bp-tag';
    const url = data.url || '/';
    event.waitUntil(self.registration.showNotification(title, { body, tag, data: { url }, icon: data.icon || '/favicon.ico', badge: data.badge || '/favicon.ico' }));
  }catch(_){
    event.waitUntil(self.registration.showNotification('Battle Plan', { body: 'Hai una nuova notifica', tag: 'bp-tag-fallback' }));
  }
});
self.addEventListener('notificationclick', (event) => {
  event.notification && event.notification.close && event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients && self.clients.matchAll ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) { if (client.focus) return client.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  }) : Promise.resolve());
});`;
      return res.send(inlineFallback);
    });
  }catch(_){ }
  // PWA: manifest e icone a path radice, anche in modalità non-build
  try{
    const manifestFromFrontRoot = path.join(frontRoot, 'manifest.webmanifest');
    const manifestFromPublic    = path.join(root, 'public', 'manifest.webmanifest');
    app.get('/manifest.webmanifest', async (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.type('application/manifest+json');
      const candidates = [manifestFromFrontRoot, manifestFromPublic];
      for (const p of candidates){
        try{ if (await fs.pathExists(p)) return res.sendFile(p); }catch(_){ /* ignore */ }
      }
      return res.json({ name: 'Battle Plan', short_name: 'BP', display: 'standalone', start_url: '/', scope: '/', background_color: '#0e1116', theme_color: '#0e1116' });
    });

    const iconsFromFrontRoot = path.join(frontRoot, 'icons');
    const iconsFromPublic    = path.join(root, 'public', 'icons');
    app.get(/^\/icons\/(.*)/, async (req, res) => {
      const rel = req.params[0] || '';
      const candidates = [path.join(iconsFromFrontRoot, rel), path.join(iconsFromPublic, rel)];
      for (const p of candidates){
        try{ if (await fs.pathExists(p)) return res.sendFile(p); }catch(_){ /* ignore */ }
      }
      res.status(404).end();
    });

    // iOS fallback: /apple-touch-icon.png richiesto alla radice
    const atiCandidates = [
      path.join(frontRoot, 'apple-touch-icon.png'),
      path.join(root, 'public', 'apple-touch-icon.png'),
      path.join(frontRoot, 'icons', 'apple-touch-icon.png'),
      path.join(root, 'public', 'icons', 'apple-touch-icon.png')
    ];
    app.get('/apple-touch-icon.png', async (_req, res) => {
      for (const p of atiCandidates){
        try{ if (await fs.pathExists(p)) return res.sendFile(p); }catch(_){ /* ignore */ }
      }
      res.status(404).end();
    });
    // Offline fallback page (served from dist/ or public/)
    const offCandidates = [
      path.join(frontRoot, 'offline.html'),
      path.join(root, 'public', 'offline.html')
    ];
    app.get('/offline.html', async (_req, res) => {
      for (const p of offCandidates){
        try{ if (await fs.pathExists(p)) return res.sendFile(p); }catch(_){ /* ignore */ }
      }
      res.status(404).end();
    });
  }catch(_){ }
  // static di base (no speciale caching per index)
  app.use(express.static(frontRoot));
  app.get("/", (_req,res)=> { res.set('Cache-Control','no-store'); res.sendFile(path.join(frontRoot, "index.html")); });
  app.get(/^\/(?!api\/).*/, (_req,res)=> { res.set('Cache-Control','no-store'); res.sendFile(path.join(frontRoot, "index.html")); });
}


// ---------- Start ----------
_initStorePromise.then(()=> ensureFiles()).then(async ()=>{
  // Route che dipendono da Supabase (dopo inizializzazione)
  const settingsRoutes = require("./routes/settings")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase });
  const openCyclesRoutes = require("./routes/open-cycles")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, genId, supabase });
  const pushTrackingRoutes = require("./routes/push-tracking")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase });
  const userPreferencesRoutes = require("./routes/user-preferences")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, supabase });
  
  app.use('/api/settings', settingsRoutes);
  app.use('/api', openCyclesRoutes);
  app.use('/api/push-tracking', pushTrackingRoutes);
  app.use('/api/user-preferences', userPreferencesRoutes);
  
  await setupStatic();
  app.listen(PORT, HOST, ()=> logger.info(`BP backend listening on http://${HOST}:${PORT}`));

  // mini-cron: ogni minuto prova (le condizioni interne filtrano sab/dom 12:00 e 1 volta al giorno)
  let LAST_PUSH_MARK = ""; // "YYYY-MM-DD"
  let LAST_BACKUP_MARK = ""; // "YYYY-MM-DD"
  let SENT_CYCLE_NOTIFICATIONS = new Set(); // Tracking notifiche cicli già inviate

  function _weekBoundariesISO(d){
    const s = startOfWeek(d), e = endOfWeek(d);
    return { sISO: s.toISOString(), eISO: e.toISOString() };
  }
  function _hasWeekPrevCons(periodsDb, userId, sISO, eISO){
    const week = (periodsDb.periods||[]).find(p =>
      p.userId===userId && p.type==='settimanale' &&
      ymd(p.startDate)===ymd(sISO) && ymd(p.endDate)===ymd(eISO)
    );
    const prevOk = !!(week && week.indicatorsPrev && Object.keys(week.indicatorsPrev).some(k=>Number(week.indicatorsPrev[k]||0)>0));
    const consOk = !!(week && week.indicatorsCons && Object.keys(week.indicatorsCons).some(k=>Number(week.indicatorsCons[k]||0)>0));
    return { prevOk, consOk };
  }
  async function _sendPushToUser(userId, payload){
    if(!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
    const subs = await getSubscriptions(userId);  
    await Promise.all(subs.map(async s=>{
      try{ await webpush.sendNotification(s, JSON.stringify(payload)); }
      catch(e){ /* ignora endpoint morti */ }
    }));
  }
  function _reminderBody(prevOk, consOk){
    if(!prevOk && !consOk) return "Ricorda di completare Previsionale e Consuntivo della settimana.";
    return !prevOk ? "Ricorda di completare Previsionale e Consuntivo della settimana." : "Ricorda di completare Previsionale e Consuntivo della settimana.";
  }

  // Retrieve saved push subscriptions for a user from JSON storage (normalizes legacy and new shapes)
  async function getSubscriptions(userId){
    try{
      const db = await readJSON("push_subscriptions.json");
      const list = (db.subs || db.subscriptions || [])
        .filter(s => String(s.userId||'') === String(userId));
      return list
        .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys||{}) })
        .filter(x => x && x.endpoint);
    }catch(_){
      return [];
    }
  }

  async function runWeekendNoonPushOncePerDay(){
    const now = new Date();
    const day = now.getDay(); // 0 dom, 6 sab
    const hr  = now.getHours();
    if(![0,6].includes(day) || hr !== 12) return;
    const mark = ymd(now);
    if(LAST_PUSH_MARK === mark) return;

    const usersDb = await readJSON("users.json");
    const periodsDb= await readJSON("periods.json");
    const { sISO, eISO } = _weekBoundariesISO(now);

    for(const u of (usersDb.users||[])){
      const { prevOk, consOk } = _hasWeekPrevCons(periodsDb, u.id, sISO, eISO);
      if(prevOk && consOk) continue;
      await _sendPushToUser(u.id, { t: "bp_reminder", title: "Battle Plan", body: _reminderBody(prevOk, consOk), url: "/" });
    }
    LAST_PUSH_MARK = mark;
  }

  async function runDailyBackupAt1AM(){
    const now = new Date();
    const hr = now.getHours();
    const mark = ymd(now);
    
    // Run backup at 1 AM (01:00) once per day
    if(hr !== 1 || LAST_BACKUP_MARK === mark) return;
    
    try {
      logger.info('Starting daily Supabase backup...');
      const { createBackup } = require('./backup-supabase');
      const backupFile = await createBackup();
      LAST_BACKUP_MARK = mark;
      logger.info(`Daily backup completed successfully: ${backupFile}`);
    } catch (error) {
      logger.error('Daily backup failed:', error);
    }
  }

  // Funzione per controllare scadenze cicli aperti
  async function checkOpenCyclesDeadlines(){
    try {
      let cycles = [];
      
      // Prova prima Supabase se disponibile
      if (typeof supabase !== 'undefined' && supabase) {
        try {
          const { data, error } = await supabase
            .from('open_cycles')
            .select('*')
            .eq('status', 'open');
          
          if (error) {
            console.error('Supabase error:', error);
            throw error;
          }
          
          // Mappa i dati da Supabase al formato frontend
          cycles = (data || []).map(row => ({
            id: row.id,
            consultantId: row.consultantid,
            consultantName: row.consultantname,
            description: row.description,
            priority: row.priority,
            deadlineType: row.deadlinetype,
            deadlineData: row.deadlinedata || {},
            status: row.status,
            createdAt: row.createdat,
            updatedAt: row.updatedat
          }));
        } catch (error) {
          console.error('Error fetching from Supabase:', error);
          // Fallback al metodo tradizionale
          const db = await readJSON('open_cycles.json');
          cycles = (db.cycles || []).filter(c => c.status === 'open');
        }
      } else {
        // Fallback al metodo tradizionale
        const db = await readJSON('open_cycles.json');
        cycles = (db.cycles || []).filter(c => c.status === 'open');
      }
      
      const now = new Date();
      
      for(const cycle of cycles) {
        const deadlines = getCycleDeadlines(cycle);
        const upcomingDeadlines = deadlines.filter(d => {
          const deadlineDate = new Date(d);
          const diffHours = (deadlineDate - now) / (1000 * 60 * 60);
          return diffHours >= 0 && diffHours <= 24; // Prossime 24 ore
        });
        
        if(upcomingDeadlines.length > 0) {
          await sendCycleDeadlineNotification(cycle, upcomingDeadlines[0]);
        }
      }
    } catch(error) {
      console.error('Error checking open cycles deadlines:', error);
    }
  }
  
  // Ottieni tutte le scadenze di un ciclo
  function getCycleDeadlines(cycle) {
    const deadlines = [];
    
    if(cycle.deadlineType === 'single' && cycle.deadlineData.dates) {
      deadlines.push(...cycle.deadlineData.dates);
    } else if(cycle.deadlineType === 'multiple' && cycle.deadlineData.dates) {
      deadlines.push(...cycle.deadlineData.dates);
    } else if(cycle.deadlineType === 'recurring' && cycle.deadlineData.recurring) {
      const recurring = cycle.deadlineData.recurring;
      if(recurring.start) {
        const startDate = new Date(recurring.start);
        const endDate = recurring.end ? new Date(recurring.end) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 giorni da ora
        
        // Genera scadenze ripetitive
        let currentDate = new Date(startDate);
        while(currentDate <= endDate) {
          deadlines.push(currentDate.toISOString());
          
          // Calcola prossima scadenza
          if(recurring.pattern === 'daily') {
            currentDate.setDate(currentDate.getDate() + (recurring.interval || 1));
          } else if(recurring.pattern === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7 * (recurring.interval || 1));
          } else if(recurring.pattern === 'monthly') {
            currentDate.setMonth(currentDate.getMonth() + (recurring.interval || 1));
          }
        }
      }
    }
    
    return deadlines;
  }
  
  // Invia notifica per scadenza ciclo
  async function sendCycleDeadlineNotification(cycle, deadline) {
    try {
      const deadlineDate = new Date(deadline);
      const now = new Date();
      const diffHours = (deadlineDate - now) / (1000 * 60 * 60);
      
      // Solo notifica 1 ora prima della scadenza
      if(diffHours > 1 || diffHours < 0) {
        return; // Non inviare notifiche se non è il momento giusto
      }
      
      // Genera chiave unica per questa notifica (ciclo + scadenza)
      const notificationKey = `${cycle.id}_${deadline}`;
      
      // Controlla se già inviata
      if(SENT_CYCLE_NOTIFICATIONS.has(notificationKey)) {
        return; // Notifica già inviata
      }
      
      const title = "🚨 Scadenza Imminente";
      const body = `Il ciclo "${cycle.description}" scade tra meno di 1 ora!`;
      
      // Invia push notification
      await _sendPushToUser(cycle.consultantId, {
        t: "cycle_deadline",
        title: title,
        body: body,
        url: "/#cycles"
      });
      
      // Invia anche notifica persistente
      try {
        const notificationsRoutes = require("./routes/notifications")({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY });
        // Simula una richiesta per inviare la notifica
        const mockReq = {
          body: {
            text: body,
            recipients: cycle.consultantId,
            type: 'automatic'
          },
          user: { id: cycle.consultantId }
        };
        const mockRes = {
          json: () => {},
          status: () => ({ json: () => {} })
        };
        await notificationsRoutes.post('/send', mockReq, mockRes);
      } catch (error) {
        console.error('Error sending notification:', error);
      }
      
      // Marca come inviata per evitare duplicati
      SENT_CYCLE_NOTIFICATIONS.add(notificationKey);
      console.log(`[BP] Cycle deadline notification sent: ${notificationKey}`);
      
    } catch(error) {
      console.error('Error sending cycle deadline notification:', error);
    }
  }

  setInterval(()=>{ 
    runWeekendNoonPushOncePerDay().catch(()=>{}); 
    runDailyBackupAt1AM().catch(()=>{}); 
    checkOpenCyclesDeadlines().catch(()=>{}); 
  }, 60*1000);
});
