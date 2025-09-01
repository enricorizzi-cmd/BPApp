const express = require('express');

module.exports = function({ readJSON, writeJSON, bcrypt, genId, todayISO, signToken }){
  const router = express.Router();

  router.post('/register', async (req,res)=>{
    const { name, email, password } = req.body || {};
    if(!name || !email || !password) return res.status(400).json({ error:'missing fields' });
    const db = await readJSON('users.json');
    if((db.users||[]).some(u => u.email.toLowerCase() === String(email).toLowerCase()))
      return res.status(409).json({ error:'email exists' });
    const hash = await bcrypt.hash(password, 10);
    const first = (db.users||[]).length === 0;
    const user = {
      id: genId(),
      name: String(name),
      email: String(email).toLowerCase(),
      pass: hash,
      role: first ? 'admin' : 'consultant',
      grade: 'junior',
      createdAt: todayISO()
    };
    db.users.push(user);
    await writeJSON('users.json', db);
    res.json({ ok:true });
  });

  router.post('/login', async (req,res)=>{
    const { email, password } = req.body || {};
    const db = await readJSON('users.json');
    const u = (db.users||[]).find(x => x.email.toLowerCase() === String(email||'').toLowerCase());
    if(!u) return res.status(401).json({ error:'no user' });
    const ok = await bcrypt.compare(password||'', u.pass||'');
    if(!ok) return res.status(401).json({ error:'bad creds' });
    const token = signToken(u);
    const user  = { id:u.id, name:u.name, email:u.email, role:u.role, grade:u.grade };
    res.json({ token, user });
  });

  return router;
};
