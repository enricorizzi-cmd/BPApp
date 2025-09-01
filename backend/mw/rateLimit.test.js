const test = require('node:test');
const assert = require('node:assert');
const rateLimit = require('./rateLimit');

test('uses x-forwarded-for when present', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, ip: '9.9.9.9', socket: { remoteAddress: '8.8.8.8' } };
  assert.strictEqual(rateLimit.getClientIp(req), '1.2.3.4');
});

test('falls back to req.ip', () => {
  const req = { headers: {}, ip: '9.9.9.9', socket: { remoteAddress: '8.8.8.8' } };
  assert.strictEqual(rateLimit.getClientIp(req), '9.9.9.9');
});

test('falls back to socket.remoteAddress', () => {
  const req = { headers: {}, socket: { remoteAddress: '8.8.8.8' } };
  assert.strictEqual(rateLimit.getClientIp(req), '8.8.8.8');
});

test('defaults to local when no ip data', () => {
  const req = { headers: {} };
  assert.strictEqual(rateLimit.getClientIp(req), 'local');
});
