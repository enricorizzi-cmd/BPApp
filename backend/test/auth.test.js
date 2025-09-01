const test = require('node:test');
const assert = require('node:assert');

const { signToken, auth, requireAdmin } = require('../services/auth');

function mockRes(){
  return {
    statusCode: 200,
    body: null,
    status(code){ this.statusCode = code; return this; },
    json(obj){ this.body = obj; }
  };
}

test('signToken and auth middleware', () => {
  const token = signToken({ id: 'u1', role: 'admin', name: 'Alice' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.id, 'u1');
});

test('auth rejects invalid token', () => {
  const req = { headers: { authorization: 'Bearer bad' } };
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('requireAdmin blocks non-admin', () => {
  const req = { user: { role: 'consultant' } };
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});
