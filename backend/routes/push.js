const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function({ auth, readJSON, writeJSON, todayISO, VAPID_PUBLIC_KEY }){
  const router = express.Router();

  router.get('/push/publicKey', (req,res)=>{
    res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
  });

  router.post('/push/subscribe', auth, async (req,res)=>{
    const sub = req.body && req.body.subscription;
    if(!sub || !sub.endpoint) return res.status(400).json({ error:'bad subscription' });

    const db = await readJSON('push_subscriptions.json');
    db.subs = db.subs || [];

    const idx = db.subs.findIndex(s => s.endpoint === sub.endpoint);
    const row = {
      userId: req.user.id,
      endpoint: sub.endpoint,
      keys: sub.keys || {},
      createdAt: todayISO(),
      lastSeen: todayISO()
    };
    if(idx>=0) db.subs[idx] = { ...db.subs[idx], ...row };
    else db.subs.push(row);

    await writeJSON('push_subscriptions.json', db);
    res.json({ ok:true });
  });

  router.post('/push_subscribe', auth, async (req,res)=>{
    try{
      const f = path.join(__dirname, '..', 'data', 'push_subscriptions.json');
      const db = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : { subscriptions: [] };
      const entry = { userId: req.user.id, subscription: req.body && req.body.subscription };
      if(!entry.subscription) return res.status(400).json({ error:'missing subscription' });
      const ep = entry.subscription && entry.subscription.endpoint;
      const filtered = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
      filtered.push(entry);
      db.subscriptions = filtered;
      fs.writeFileSync(f + '.tmp', JSON.stringify(db,null,2)); fs.renameSync(f+'.tmp', f);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  router.post('/push_unsubscribe', auth, async (req,res)=>{
    try{
      const f = path.join(__dirname, '..', 'data', 'push_subscriptions.json');
      const db = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : { subscriptions: [] };
      const ep = req.body && req.body.endpoint;
      if(!ep) return res.status(400).json({ error:'missing endpoint' });
      db.subscriptions = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
      fs.writeFileSync(f + '.tmp', JSON.stringify(db,null,2)); fs.renameSync(f+'.tmp', f);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  return router;
};
