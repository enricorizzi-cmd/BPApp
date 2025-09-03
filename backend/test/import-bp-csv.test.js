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
