/**
 * Simple in-memory rate limiter per IP+route.
 * Usage: app.post("/api/login", rateLimit({ windowMs:60000, max:5 }), handler)
 */
module.exports = function rateLimit(opts){
  const windowMs = (opts && opts.windowMs) || 60000;
  const max = (opts && opts.max) || 10;
  const bucket = new Map(); // key -> { count, reset }
  return function(req,res,next){
    try{
      const ip = (req.headers['x-forwarded-for']||req.connection.remoteAddress||'').split(',')[0].trim() || 'local';
      const key = ip + '|' + (req.path||'');
      const now = Date.now();
      let b = bucket.get(key);
      if(!b || now > b.reset){ b = { count:0, reset: now + windowMs }; bucket.set(key,b); }
      b.count++;
      if(b.count > max){
        res.setHeader('Retry-After', Math.ceil((b.reset - now)/1000));
        return res.status(429).json({ error:"Too many requests" });
      }
      return next();
    }catch(e){ return next(); }
  }
};