/**
 * Simple in-memory rate limiter per IP+route.
 * Usage: app.post("/api/login", rateLimit({ windowMs:60000, max:5 }), handler)
 */
function getClientIp(req){
  return (req.headers['x-forwarded-for'] || req.ip || (req.socket && req.socket.remoteAddress) || '')
    .split(',')[0].trim() || 'local';
}

module.exports = function rateLimit(opts){
  const windowMs = (opts && opts.windowMs) || 60000;
  const max = (opts && opts.max) || 10;
  const bucket = new Map(); // key -> { count, reset }
  return function(req,res,next){
    try{
      const ip = getClientIp(req);
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
module.exports.getClientIp = getClientIp;
