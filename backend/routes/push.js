const express = require('express');

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, todayISO, VAPID_PUBLIC_KEY }){
  const router = express.Router();

  router.get('/push/publicKey', (req,res)=>{
    res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
  });

  // New subscription (accepts {subscription} or raw subscription object). Stored via KV storage
  router.post('/push/subscribe', auth, async (req,res)=>{
    try{
      const sub = (req.body && (req.body.subscription || req.body)) || null;
      if(!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth){
        return res.status(400).json({ error:'invalid_subscription' });
      }
      const db = await (async ()=>{ try{ return await readJSON('push_subscriptions.json'); }catch(_){ return { subs: [] }; } })();
      db.subs = db.subs || [];
      const idx = db.subs.findIndex(s => s.endpoint === sub.endpoint);
      const row = { userId: req.user.id, endpoint: sub.endpoint, keys: sub.keys, createdAt: todayISO(), lastSeen: todayISO() };
      
      // Usa operazioni Supabase invece di writeJSON per evitare sovrascrittura
      if (typeof insertRecord === 'function' && typeof updateRecord === 'function') {
        try {
          const mappedSub = {
            userid: row.userId,
            endpoint: row.endpoint,
            p256dh: row.keys.p256dh,
            auth: row.keys.auth,
            createdat: row.createdAt,
            lastseen: row.lastSeen
          };
          
          if(idx>=0) {
            // Aggiorna subscription esistente
            await updateRecord('push_subscriptions', db.subs[idx].id, mappedSub);
          } else {
            // Inserisci nuova subscription
            mappedSub.id = require('nanoid').nanoid();
            await insertRecord('push_subscriptions', mappedSub);
          }
        } catch (error) {
          console.error('Error with push subscription:', error);
          // Fallback al metodo tradizionale se Supabase fallisce
          if(idx>=0) db.subs[idx] = { ...db.subs[idx], ...row };
          else db.subs.push(row);
          await writeJSON('push_subscriptions.json', db);
        }
      } else {
        // SQLite locale: usa il metodo tradizionale
        if(idx>=0) db.subs[idx] = { ...db.subs[idx], ...row };
        else db.subs.push(row);
        await writeJSON('push_subscriptions.json', db);
      }
      res.json({ ok:true });
    }catch(e){ res.status(400).json({ error:'invalid_subscription' }); }
  });

  // Back-compat route
  router.post('/push_subscribe', auth, async (req,res)=>{
    try{
      const sub = req.body && req.body.subscription;
      if(!sub) return res.status(400).json({ error:'missing subscription' });
      const db = await (async ()=>{ try{ return await readJSON('push_subscriptions.json'); }catch(_){ return { subscriptions: [] }; } })();
      const ep = sub && sub.endpoint;
      const filtered = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
      filtered.push({ userId: req.user.id, subscription: sub });
      db.subscriptions = filtered;
      await writeJSON('push_subscriptions.json', db);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  router.post('/push_unsubscribe', auth, async (req,res)=>{
    try{
      const ep = req.body && req.body.endpoint;
      if(!ep) return res.status(400).json({ error:'missing endpoint' });
      const db = await (async ()=>{ try{ return await readJSON('push_subscriptions.json'); }catch(_){ return { subs: [], subscriptions: [] }; } })();
      db.subs = (db.subs||[]).filter(s => s.endpoint !== ep);
      db.subscriptions = (db.subscriptions||[]).filter(s => !(s.subscription && s.subscription.endpoint===ep));
      await writeJSON('push_subscriptions.json', db);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  return router;
};
