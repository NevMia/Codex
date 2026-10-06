const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const childProcess = require('node:child_process');

test('/start rejects malformed JSON and keeps serving requests', async (t) => {
  // Suppress opening a browser while exercising the real HTTP server.
  t.mock.method(childProcess, 'spawn', () => ({ on() {}, unref() {} }));
  const { startGui } = require('../src/gui/server');
  const server = startGui();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  for (const body of ['not json', '{"video":']) {
    const response = await fetch(url + '/start', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), 'Invalid request');
    const healthy = await fetch(url);
    assert.equal(healthy.status, 200);
    await healthy.text();
  }
  const valid = await fetch(url + '/start', { method: 'POST', body: '{}' });
  assert.equal(valid.status, 200);
  assert.match(await valid.text(), /Error: Invalid video URL or ID/);
});
