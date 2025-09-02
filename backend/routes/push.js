const express = require('express');
const { saveSubscription, deleteSubscription } = require('../lib/subscriptions-db');

module.exports = function({ auth, VAPID_PUBLIC_KEY }){
  const router = express.Router();

  router.get('/push/publicKey', (req,res)=>{
    res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
  });

  // New subscription (accepts {subscription} or raw subscription object)
  router.post('/push/subscribe', auth, async (req,res)=>{
    try{
      const sub = (req.body && (req.body.subscription || req.body)) || null;
      if(!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth){
        return res.status(400).json({ error:'invalid_subscription' });
      }
      await saveSubscription(req.user.id, sub);
      res.json({ ok:true });
    }catch(e){ res.status(400).json({ error:'invalid_subscription' }); }
  });

  // Back-compat route
  router.post('/push_subscribe', auth, async (req,res)=>{
    try{
      const sub = req.body && req.body.subscription;
      if(!sub) return res.status(400).json({ error:'missing subscription' });
      await saveSubscription(req.user.id, sub);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  router.post('/push_unsubscribe', auth, async (req,res)=>{
    try{
      const ep = req.body && req.body.endpoint;
      if(!ep) return res.status(400).json({ error:'missing endpoint' });
      await deleteSubscription(ep);
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:'fail' }); }
  });

  return router;
};
