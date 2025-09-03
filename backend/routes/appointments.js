const express = require('express');

module.exports = function({ auth, readJSON, writeJSON, computeEndLocal, findOrCreateClientByName, genId }){
  const router = express.Router();

  // ---- helpers ----
  function parseDateSmart(s){
    if(!s) return new Date(NaN);
    const d = new Date(s);
    if(!isNaN(d)) return d;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0, 0);
    return new Date(NaN);
  }
  function minutesBetween(a,b){ return Math.max(1, Math.round((b - a)/60000)); }
  function defaultMinutesForType(t){
    const s = String(t||'').toLowerCase();
    if (s.includes('mezza')) return 240;
    if (s.includes('giorn')) return 570;
    if (s.includes('formaz')) return 570;
    if (s.includes('mbs')) return 570;
    if (s.includes('sottoprod')) return 240;
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
    const all = db.appointments||[];
    const list = (global && isAdmin) ? all : all.filter(a => a.userId === req.user.id);
    const enriched = (list||[]).map(a => ({ ...a, clientId: a.clientId || (resolveClientIdByName(clientsDb, a.client)) }));
    return res.json({ appointments: enriched });
  }

  async function handleUpdate(req, res, body, db){
    const it = db.appointments.find(a => a.id===body.id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });

    // Base fields
    if (Object.prototype.hasOwnProperty.call(body, 'client')) it.client = String(body.client);
    if (Object.prototype.hasOwnProperty.call(body, 'type'))   it.type   = String(body.type || 'manuale');
    if (Object.prototype.hasOwnProperty.call(body, 'vss'))    it.vss    = Number(body.vss||0);
    if (Object.prototype.hasOwnProperty.call(body, 'vsdPersonal')) it.vsdPersonal = Number(body.vsdPersonal||0);
    if (Object.prototype.hasOwnProperty.call(body, 'vsdIndiretto')) it.vsdIndiretto = Number(body.vsdIndiretto||0);
    if (Object.prototype.hasOwnProperty.call(body, 'telefonate')) it.telefonate = Number(body.telefonate||0);
    if (Object.prototype.hasOwnProperty.call(body, 'appFissati')) it.appFissati = Number(body.appFissati||0);
    if (Object.prototype.hasOwnProperty.call(body, 'nncf'))   it.nncf   = !!body.nncf;
    if (Object.prototype.hasOwnProperty.call(body, 'notes'))  it.notes  = body.notes || '';

    const startOld = parseDateSmart(it.start);
    const endOld   = parseDateSmart(it.end);
    const durOld   = isFinite(Number(it.durationMinutes)) && Number(it.durationMinutes)>0
                      ? Number(it.durationMinutes)
                      : (isNaN(startOld) || isNaN(endOld) ? 90 : minutesBetween(startOld, endOld));

    const startNew = Object.prototype.hasOwnProperty.call(body,'start') ? parseDateSmart(body.start) : startOld;
    const endProvided = Object.prototype.hasOwnProperty.call(body,'end');
    const endCandidate = endProvided ? parseDateSmart(body.end) : null;
    const durProvided = Object.prototype.hasOwnProperty.call(body,'durationMinutes');
    let minutes = durProvided ? Number(body.durationMinutes) : durOld;
    if (!isFinite(minutes) || minutes<=0) minutes = durOld;

    let endNew;
    if (endProvided && !isNaN(endCandidate)){
      endNew = endCandidate;
      minutes = minutesBetween(startNew, endNew);
    } else if (durProvided && isFinite(minutes) && minutes>0){
      endNew = new Date(startNew.getTime() + minutes*60000);
    } else {
      // keep same duration relative to new start
      endNew = new Date(startNew.getTime() + (durOld>0?durOld:90)*60000);
      minutes = minutesBetween(startNew, endNew);
    }

    it.start = startNew.toISOString();
    it.end   = endNew.toISOString();
    it.durationMinutes = minutes;

    const c = await findOrCreateClientByName(it.client, it.nncf, { id:req.user.id, name:(req.user.name||'') });
    it.clientId = c.id;

    await writeJSON('appointments.json', db);
    return res.json({ ok:true, id: it.id, clientId: it.clientId });
  }

  async function handleCreate(req, res, body, db){
    if(!body.start) return res.status(400).json({ error:'missing fields' });
    if(!body.client){
      const t = String(body.type||'').toLowerCase();
      if(t==='formazione' || t==='mbs' || t==='sottoprodotti'){
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
      end = new Date(start.getTime() + minutes*60000);
    }

    const c = await findOrCreateClientByName(body.client, !!body.nncf, { id:req.user.id, name:(req.user.name||'') });
    const row = {
      id: body.id || genId(),
      userId: req.user.id,
      client: String(body.client),
      clientId: c.id,
      type: String(body.type||'manuale'),
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes: minutes,
      vss: Number(body.vss||0),
      vsdPersonal: Number(body.vsdPersonal||0),
      vsdIndiretto: Number(body.vsdIndiretto||0),
      telefonate: Number(body.telefonate||0),
      appFissati: Number(body.appFissati||0),
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
