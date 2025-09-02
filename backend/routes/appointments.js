const express = require('express');

module.exports = function({ auth, readJSON, writeJSON, computeEndLocal, findOrCreateClientByName, genId }){
  const router = express.Router();

  // ---- helpers ----
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
    const all = db.appointments||[];
    const list = (global && isAdmin) ? all : all.filter(a => a.userId === req.user.id);
    const enriched = (list||[]).map(a => ({ ...a, clientId: a.clientId || (resolveClientIdByName(clientsDb, a.client)) }));
    return res.json({ appointments: enriched });
  }

  async function handleUpdate(req, res, body, db){
    const it = db.appointments.find(a => a.id===body.id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });

    const patchers = {
      client: v => String(v),
      type: v => String(v || 'manuale'),
      start: v => String(v),
      durationMinutes: v => Number(v ?? it.durationMinutes ?? 0),
      vss: v => Number(v ?? it.vss ?? 0),
      vsdPersonal: v => Number(v ?? it.vsdPersonal ?? 0),
      nncf: v => Boolean(v ?? it.nncf ?? false),
      notes: v => (v ?? it.notes ?? ''),
    };
    for (const k of Object.keys(patchers)){
      if (Object.prototype.hasOwnProperty.call(body, k)){
        it[k] = patchers[k](body[k]);
      }
    }
    it.end = computeEndLocal(it.start, it.type, it.durationMinutes);

    const c = await findOrCreateClientByName(it.client, it.nncf, { id:req.user.id, name:(req.user.name||'') });
    it.clientId = c.id;

    await writeJSON('appointments.json', db);
    return res.json({ ok:true, id: it.id, clientId: it.clientId });
  }

  async function handleCreate(req, res, body, db){
    if(!body.client || !body.start) return res.status(400).json({ error:'missing fields' });
    const startLocal = String(body.start);
    const endLocal   = computeEndLocal(startLocal, body.type, body.durationMinutes);
    const c = await findOrCreateClientByName(body.client, !!body.nncf, { id:req.user.id, name:(req.user.name||'') });
    const row = {
      id: body.id || genId(),
      userId: req.user.id,
      client: String(body.client),
      clientId: c.id,
      type: String(body.type||'manuale'),
      start: startLocal,
      end: endLocal,
      durationMinutes: Number(body.durationMinutes||0),
      vss: Number(body.vss||0),
      vsdPersonal: Number(body.vsdPersonal||0),
      nncf: !!body.nncf,
      notes: body.notes||''
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
