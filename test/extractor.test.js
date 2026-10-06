const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const youtubeApi = require('../src/youtubeApi');
const { runExtraction } = require('../src/extractor');

test('raw totals count duplicate top-level text across pages and replies', async (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
  const streams = [];
  const createWriteStream = fs.createWriteStream;
  t.mock.method(fs, 'createWriteStream', (...args) => {
    const stream = createWriteStream(...args);
    streams.push(stream);
    return stream;
  });
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const top = (id, text, replies = 0) => ({
    id: 'thread-' + id,
    snippet: { totalReplyCount: replies, topLevelComment: {
      id, snippet: { textOriginal: text, authorDisplayName: id }
    } }
  });
  t.mock.method(youtubeApi, 'httpGetJson', async (url, query) => {
    if (url.endsWith('/comments')) return { items: [
      { id: 'r1', snippet: { textOriginal: 'echo', parentId: 't1' } },
      { id: 'r2', snippet: { textOriginal: 'echo', parentId: 't1' } }
    ] };
    if (!query.pageToken) return {
      items: [top('t1', 'repeat', 2), { id: 'missing-top', snippet: {} }],
      nextPageToken: 'NEXT'
    };
    return { items: [top('t2', 'repeat'), top('t3', 'echo'), top('t4', 'unique')] };
  });
  const result = await runExtraction({
    video: 'dQw4w9WgXcQ', apiKey: 'test', out, sleepMs: 0, capPerThread: 1
  });
  await Promise.all(streams.map((stream) => new Promise((resolve, reject) => {
    if (stream.writableFinished) return resolve();
    stream.once('finish', resolve);
    stream.once('error', reject);
  })));
  const records = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  const raw = records(result.files.jsonlRaw);
  const deduped = records(result.files.jsonlDeduped);
  assert.equal(raw.filter((r) => !r.isReply).length, 4);
  assert.equal(raw.length, 6);
  assert.equal(deduped.length, 3);
  assert.equal(result.meta.topLevelCount, 4);
  assert.equal(result.meta.replyCountRaw, 2);
  assert.equal(result.meta.totalCountRaw, raw.length);
  assert.equal(result.meta.replyCountCappedForSummary, 1);
  assert.equal(result.meta.totalCountCappedForSummary, 5);
  assert.equal(result.meta.settings.dedupeCount, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.files.meta, 'utf8')), result.meta);
});
