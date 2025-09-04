const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(process.cwd(), 'data', 'periods.json');

function isNumberLike(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

test('periods.json: structure and invariants', () => {
  const raw = fs.readFileSync(dataPath, 'utf8');
  let json;
  assert.doesNotThrow(() => { json = JSON.parse(raw); }, 'JSON must parse');
  assert.ok(json && Array.isArray(json.periods), 'must have periods array');

  const allowedTypes = new Set(['settimanale', 'mensile', 'trimestrale', 'semestrale', 'annuale']);
  const ids = new Set();

  for (const [i, e] of json.periods.entries()) {
    assert.ok(e && typeof e === 'object', `entry ${i} must be object`);
    assert.ok(e.id && typeof e.id === 'string', `entry ${i} must have id`);
    assert.ok(!ids.has(e.id), `duplicate id at index ${i}: ${e.id}`);
    ids.add(e.id);

    assert.ok(e.userId && typeof e.userId === 'string', `entry ${i} must have userId`);
    assert.ok(e.type && allowedTypes.has(e.type), `entry ${i} has invalid type`);

    assert.ok(e.startDate && e.endDate, `entry ${i} must have dates`);
    const sd = new Date(e.startDate);
    const ed = new Date(e.endDate);
    assert.ok(!Number.isNaN(sd.valueOf()), `entry ${i} startDate invalid`);
    assert.ok(!Number.isNaN(ed.valueOf()), `entry ${i} endDate invalid`);
    assert.ok(sd <= ed, `entry ${i} startDate must be <= endDate`);

    for (const bagName of ['indicatorsPrev', 'indicatorsCons']) {
      const bag = e[bagName];
      if (!bag) continue;
      for (const [k, v] of Object.entries(bag)) {
        if (isNumberLike(v)) {
          assert.ok(v >= 0, `entry ${i} ${bagName}.${k} must be >= 0`);
        }
      }
    }
  }
});
