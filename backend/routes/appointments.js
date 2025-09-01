const express = require('express');

module.exports = function({ auth, readJSON, writeJSON, computeEndLocal, findOrCreateClientByName, genId }){
  const router = express.Router();

  router.get('/appointments', auth, async (req,res)=>{
    const db = await readJSON('appointments.json');
    const clientsDb = await readJSON('clients.json');
    const isAdmin = (req.user.role === 'admin');

    if (req.query.id){
      const a = (db.appointments||[]).find(x => x.id === req.query.id);
      if(!a) return res.status(404).json({ error:'not found' });
      if(!isAdmin && a.userId !== req.user.id) return res.status(403).json({ error:'forbidden' });
      const clientId = a.clientId || (() => {
        const key = String(a.client||'').toLowerCase();
        const c = (clientsDb.clients||[]).find(x => (x.name||'').toLowerCase() === key);
        return c ? c.id : null;
      })();
      return res.json({ appointment: { ...a, clientId } });
    }

    if (req.query.last === '1'){
      const mine = (db.appointments||[]).filter(a => a.userId === req.user.id);
      const last = mine.sort((a,b)=> String(b.start||'').localeCompare(String(a.start||'')))[0] || null;
      if(!last) return res.json({ appointment: null });
      const clientId = last.clientId || (() => {
        const key = String(last.client||'').toLowerCase();
        const c = (clientsDb.clients||[]).find(x => (x.name||'').toLowerCase() === key);
        return c ? c.id : null;
      })();
      return res.json({ appointment: { ...last, clientId } });
    }

    const global = req.query.global === '1';
    let list = [];
    if(global && isAdmin) list = db.appointments||[];
    else list = (db.appointments||[]).filter(a => a.userId === req.user.id);

    function resolveClientIdByName(name){
      const key = String(name||'').toLowerCase();
      const c = (clientsDb.clients||[]).find(x => (x.name||'').toLowerCase() === key);
      return c ? c.id : null;
    }
    const enriched = (list||[]).map(a => ({ ...a, clientId: a.clientId || resolveClientIdByName(a.client) }));
    res.json({ appointments: enriched });
  });

  router.post('/appointments', auth, async (req,res)=>{
    const body = req.body || {};
    const db = await readJSON('appointments.json');
    db.appointments = db.appointments || [];

    if(body.id){
      const it = db.appointments.find(a => a.id===body.id);
      if(!it) return res.status(404).json({ error:'not found' });
      if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });

      if(body.client!=null) it.client = String(body.client);
      if(body.type!=null)   it.type   = String(body.type||'manuale');
      if(body.start) it.start = String(body.start);
      it.durationMinutes = Number((body.durationMinutes ?? it.durationMinutes ?? 0));
      it.end    = computeEndLocal(it.start, it.type, it.durationMinutes);
      it.vss    = Number((body.vss ?? it.vss ?? 0));
      it.vsdPersonal = Number((body.vsdPersonal ?? it.vsdPersonal ?? 0));
      it.nncf   = Boolean(body.nncf ?? it.nncf ?? false);
      it.notes  = (body.notes ?? it.notes ?? '');

      const c = await findOrCreateClientByName(it.client, it.nncf, { id:req.user.id, name:(req.user.name||'') });
      it.clientId = c.id;

      await writeJSON('appointments.json', db);
      return res.json({ ok:true, id: it.id, clientId: it.clientId });
    }else{
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
      res.json({ ok:true, id: row.id, clientId: row.clientId });
    }
  });

  router.delete('/appointments', auth, async (req,res)=>{
    const id = String(req.body && req.body.id || req.query && req.query.id || '');
    if(!id) return res.status(400).json({ error:'missing id' });
    const db = await readJSON('appointments.json');
    const it = (db.appointments||[]).find(a => a.id===id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });
    db.appointments = (db.appointments||[]).filter(a => a.id!==id);
    await writeJSON('appointments.json', db);
    res.json({ ok:true });
  });

  return router;
};
