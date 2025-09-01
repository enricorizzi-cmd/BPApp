const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.BP_JWT_SECRET || 'bp_v13_demo_secret';

function signToken(u){
  return jwt.sign({ id:u.id, role:u.role, name:u.name }, JWT_SECRET, { expiresIn:'30d' });
}

function auth(req,res,next){
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!tok) return res.status(401).json({ error:'missing token' });
  try{ req.user = jwt.verify(tok, JWT_SECRET); return next(); }
  catch(e){ return res.status(401).json({ error:'invalid token' }); }
}

function requireAdmin(req,res,next){
  if(!req.user || req.user.role !== 'admin') return res.status(403).json({ error:'admin only' });
  next();
}

module.exports = { signToken, auth, requireAdmin };
