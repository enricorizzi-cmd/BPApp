const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('../import-bp-csv');

test('dry-run generates expected requests from CSV', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
  const csvPath = path.join(tmpDir, 'sample.csv');
  const csv = [
    'consultantId,period,kpi,kind,value',
    'alice,2024-01,VSS,prev,100',
    'alice,2024-01,VSS,prev,50',
    'alice,2024-01,GI,prev,10',
    'bob,2024-02,VSDPersonale,cons,200',
    'bob,2024-02,VSDPersonale,cons,100',
    'bob,2024-02,GI,prev,300'
  ].join('\n');
  fs.writeFileSync(csvPath, csv);

  const requests = await run({ csvPath, dryRun: true });
  assert.equal(requests.length, 2);

  const alice = requests.find(r => r.userId === 'alice');
  assert.ok(alice, 'alice request exists');
  assert.equal(alice.startDate, new Date(Date.UTC(2024,0,1)).toISOString());
  assert.equal(alice.endDate, new Date(Date.UTC(2024,1,0)).toISOString());
  assert.deepEqual(alice.indicatorsPrev, { VSS: 150, GI: 10 });
  assert.ok(!alice.indicatorsCons);

  const bob = requests.find(r => r.userId === 'bob');
  assert.ok(bob, 'bob request exists');
  assert.equal(bob.startDate, new Date(Date.UTC(2024,1,1)).toISOString());
  assert.equal(bob.endDate, new Date(Date.UTC(2024,2,0)).toISOString());
  assert.deepEqual(bob.indicatorsPrev, { GI: 300 });
  assert.deepEqual(bob.indicatorsCons, { VSDPersonale: 300 });
});

test('supports legacy CSV format with prev/cons columns', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'));
  const csvPath = path.join(tmpDir, 'legacy.csv');
  const csv = [
    'kpi,settimana,mese,trimestre,semestre,anno,userid,indicatorsprev,indicatorscons',
    'VSS,30,7,3,2,2025,u1,10,20',
    'VSS,30,7,3,2,2025,u1,5,0',
    'VSDPersonale,30,7,3,2,2025,u2,0,7'
  ].join('\n');
  fs.writeFileSync(csvPath, csv);

  const requests = await run({ csvPath, dryRun: true });
  assert.equal(requests.length, 2);

  const u1 = requests.find(r => r.userId === 'u1');
  assert.ok(u1, 'u1 request exists');
  assert.equal(u1.startDate, new Date(Date.UTC(2025,6,1)).toISOString());
  assert.equal(u1.endDate, new Date(Date.UTC(2025,7,0)).toISOString());
  assert.deepEqual(u1.indicatorsPrev, { VSS: 15 });
  assert.deepEqual(u1.indicatorsCons, { VSS: 20 });

  const u2 = requests.find(r => r.userId === 'u2');
  assert.ok(u2, 'u2 request exists');
  assert.equal(u2.startDate, new Date(Date.UTC(2025,6,1)).toISOString());
  assert.equal(u2.endDate, new Date(Date.UTC(2025,7,0)).toISOString());
  assert.ok(!u2.indicatorsPrev);
  assert.deepEqual(u2.indicatorsCons, { VSDPersonale: 7 });
});
