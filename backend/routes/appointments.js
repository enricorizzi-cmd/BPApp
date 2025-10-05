const express = require('express');
const { parseDateTime, toUTCString, minutesBetween, addMinutes, isValidDateTime } = require('../lib/timezone');

module.exports = function({ auth, readJSON, writeJSON, computeEndLocal, findOrCreateClientByName, genId }){
  const router = express.Router();

  // ---- helpers ----
  function parseDateSmart(s){
    return parseDateTime(s);
  }
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const toStr = (v) => String(v);
  const toType = (v) => String(v || 'manuale');
  const toNum = (v) => Number(v || 0);
  const toBool = (v) => !!v;
  const orEmpty = (v) => v || '';

  function copyIfPresent(target, src, key, transform) {
    if (has(src, key)) target[key] = transform ? transform(src[key]) : src[key];
  }

  function deriveOldDuration(it, startOld, endOld) {
    const raw = Number(it.durationMinutes);
    if (isFinite(raw) && raw > 0) return raw;
    if (isNaN(startOld) || isNaN(endOld)) return 90;
    return minutesBetween(startOld, endOld);
  }

  function computeNewTiming(body, startOld, durOld) {
    const startNew = has(body, 'start') ? parseDateSmart(body.start) : startOld;
    const endProvided = has(body, 'end');
    const endCandidate = endProvided ? parseDateSmart(body.end) : null;
    const durProvided = has(body, 'durationMinutes');
    let minutes = durProvided ? Number(body.durationMinutes) : durOld;
    if (!isFinite(minutes) || minutes <= 0) minutes = durOld;

    let endNew;
    if (endProvided && !isNaN(endCandidate)) {
      endNew = endCandidate;
      minutes = minutesBetween(startNew, endNew);
    } else if (durProvided && isFinite(minutes) && minutes > 0) {
      endNew = addMinutes(startNew, minutes);
    } else {
      // keep same duration relative to new start
      endNew = addMinutes(startNew, durOld > 0 ? durOld : 90);
      minutes = minutesBetween(startNew, endNew);
    }
    return { startNew, endNew, minutes };
  }
  function defaultMinutesForType(t){
    const s = String(t||'').toLowerCase();
    if (s.includes('mezza')) return 240;
    if (s.includes('giorn')) return 570;
    if (s.includes('formaz')) return 570;
    if (s.includes('mbs')) return 570;
    if (s.includes('sottoprod')) return 240;
    if (s.includes('riunione')) return 60;
    if (s.includes('impegni personali')) return 60;
    if (s.includes('vend'))  return 90;
    return 90; // fallback
  }
  async function resolveClientIdByName(clientsDb, name){
    const key = String(name||'').toLowerCase();
    const c = (clientsDb.clients||[]).find(x => (x.name||'').toLowerCase() === key);
    return c ? c.id : null;
  }

  async function handleGetById(req, res, db, clientsDb, isAdmin){
    const a = (db.appointments||[]).find(x => x.id === req.query.id);
    if(!a) return res.status(404).json({ error:'not found' });
    if(!isAdmin && a.userId !== req.user.id) return res.status(403).json({ error:'forbidden' });
    const clientId = a.clientId || await resolveClientIdByName(clientsDb, a.client);
    return res.json({ appointment: { ...a, clientId } });
  }

  async function handleGetLast(req, res, db, clientsDb){
    const mine = (db.appointments||[]).filter(a => a.userId === req.user.id);
    const last = mine.sort((a,b)=> String(b.start||'').localeCompare(String(a.start||'')))[0] || null;
    if(!last) return res.json({ appointment: null });
    const clientId = last.clientId || await resolveClientIdByName(clientsDb, last.client);
    return res.json({ appointment: { ...last, clientId } });
  }

  async function handleGetList(req, res, db, clientsDb, isAdmin){
    const global = req.query.global === '1';
    const userId = req.query.user;
    const all = db.appointments||[];
    let list;
    if(global && isAdmin) list = all;
    else if(isAdmin && userId) list = all.filter(a => a.userId === userId);
    else list = all.filter(a => a.userId === req.user.id);
    const enriched = (list||[]).map(a => ({ ...a, clientId: a.clientId || (resolveClientIdByName(clientsDb, a.client)) }));
    return res.json({ appointments: enriched });
  }

  async function handleUpdate(req, res, body, db){
    const it = db.appointments.find(a => a.id===body.id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });

    // Base fields
    copyIfPresent(it, body, 'client', toStr);
    copyIfPresent(it, body, 'type', toType);
    copyIfPresent(it, body, 'vss', toNum);
    copyIfPresent(it, body, 'vsdPersonal', toNum);
    copyIfPresent(it, body, 'vsdIndiretto', toNum);
    copyIfPresent(it, body, 'telefonate', toNum);
    copyIfPresent(it, body, 'appFissati', toNum);
    copyIfPresent(it, body, 'nncf', toBool);
    // Hidden/persisted flags
    copyIfPresent(it, body, 'nncfPromptAnswered', toBool);
    copyIfPresent(it, body, 'salePromptAnswered', toBool);
    copyIfPresent(it, body, 'salePromptSnoozedUntil', orEmpty);
    copyIfPresent(it, body, 'nncfPromptSnoozedUntil', orEmpty);
    copyIfPresent(it, body, 'notes', orEmpty);

    const startOld = parseDateSmart(it.start);
    const endOld   = parseDateSmart(it.end);
    const durOld   = deriveOldDuration(it, startOld, endOld);
    const { startNew, endNew, minutes } = computeNewTiming(body, startOld, durOld);

    it.start = startNew.toISOString();
    it.end   = endNew.toISOString();
    it.durationMinutes = minutes;

    const c = await findOrCreateClientByName(it.client, it.nncf, { id:req.user.id, name:(req.user.name||'') });
    it.clientId = c.id;
    if(!it.createdAt) it.createdAt = new Date().toISOString();
    it.updatedAt = new Date().toISOString();

    await writeJSON('appointments.json', db);
    return res.json({ ok:true, id: it.id, clientId: it.clientId });
  }

  async function handleCreate(req, res, body, db){
    if(!body.start) return res.status(400).json({ error:'missing fields' });
    if(!body.client){
      const t = String(body.type||'').toLowerCase();
      if(t==='formazione' || t==='mbs' || t==='sottoprodotti' || t==='riunione' || t==='impegni personali'){
        body.client = body.type;
      } else {
        return res.status(400).json({ error:'missing fields' });
      }
    }
    
    const start = parseDateSmart(body.start);
    if(isNaN(start)) return res.status(400).json({ error:'invalid start' });

    let end = null;
    let minutes = Number(body.durationMinutes||0);
    if (body.end){
      const e = parseDateSmart(body.end);
      if(!isNaN(e)){
        end = e;
        minutes = minutesBetween(start, e);
      }
    }
    if(!end){
      if(!isFinite(minutes) || minutes<=0){ minutes = defaultMinutesForType(body.type); }
      end = addMinutes(start, minutes);
    }

    const c = await findOrCreateClientByName(body.client, !!body.nncf, { id:req.user.id, name:(req.user.name||'') });
    const nowIso = new Date().toISOString();
    const row = {
      id: body.id || genId(),
      userId: req.user.id,
      client: String(body.client),
      clientId: c.id,
      type: String(body.type||'manuale'),
      start: toUTCString(start),
      end: toUTCString(end),
      durationMinutes: minutes,
      vss: Number(body.vss||0),
      vsdPersonal: Number(body.vsdPersonal||0),
      vsdIndiretto: Number(body.vsdIndiretto||0),
      telefonate: Number(body.telefonate||0),
      appFissati: Number(body.appFissati||0),
      nncf: !!body.nncf,
      nncfPromptAnswered: !!body.nncfPromptAnswered,
      salePromptAnswered: !!body.salePromptAnswered,
      salePromptSnoozedUntil: body.salePromptSnoozedUntil || null,
      nncfPromptSnoozedUntil: body.nncfPromptSnoozedUntil || null,
      notes: body.notes||'',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    db.appointments.push(row);
    await writeJSON('appointments.json', db);
    return res.json({ ok:true, id: row.id, clientId: row.clientId });
  }

  // ---- routes ----
  router.get('/appointments', auth, async (req,res)=>{
    const db = await readJSON('appointments.json');
    const clientsDb = await readJSON('clients.json');
    const isAdmin = (req.user.role === 'admin');

    if (req.query.id) return handleGetById(req, res, db, clientsDb, isAdmin);
    if (req.query.last === '1') return handleGetLast(req, res, db, clientsDb);
    return handleGetList(req, res, db, clientsDb, isAdmin);
  });

  router.post('/appointments', auth, async (req,res)=>{
    const body = req.body || {};
    const db = await readJSON('appointments.json');
    db.appointments = db.appointments || [];
    if(body.id) return handleUpdate(req,res,body,db);
    return handleCreate(req,res,body,db);
  });

  function extractId(req){
    if (req && req.body && req.body.id) return String(req.body.id);
    if (req && req.query && req.query.id) return String(req.query.id);
    return '';
  }

  async function handleDelete(req, res){
    const id = extractId(req);
    if(!id) return res.status(400).json({ error:'missing id' });
    const db = await readJSON('appointments.json');
    const it = (db.appointments||[]).find(a => a.id===id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });
    db.appointments = (db.appointments||[]).filter(a => a.id!==id);
    await writeJSON('appointments.json', db);
    return res.json({ ok:true });
  }

  router.delete('/appointments', auth, async (req,res)=> handleDelete(req,res));

  return router;
};
