const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVideoId, cleanText } = require('../src/utils');
const youtubeApi = require('../src/youtubeApi');
const { paginate } = youtubeApi;

test('parseVideoId supports id and urls', () => {
  assert.equal(parseVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://youtu.be/dQw4w9WgXcQ?t=8'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('invalid'), null);
});

test('cleanText strips urls and normalizes spaces', () => {
  const input = 'Hi   there https://example.com 😄  www.test.com';
  assert.equal(cleanText(input), 'Hi there 😄');
});

test('paginate terminates when nextPageToken absent', async () => {
  const oldHttpGetJson = youtubeApi.httpGetJson;
  let calls = 0;

  youtubeApi.httpGetJson = async () => {
    calls += 1;
    if (calls === 1) return { items: [1], nextPageToken: 'NEXT' };
    return { items: [2] };
  };

  const pages = [];
  for await (const page of paginate({ endpoint: 'x', params: {}, apiKey: 'k', requestCounter: {} })) {
    pages.push(page.items[0]);
  }

  youtubeApi.httpGetJson = oldHttpGetJson;
  assert.deepEqual(pages, [1, 2]);
});
