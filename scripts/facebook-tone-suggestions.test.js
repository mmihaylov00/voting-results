const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const implementation = import('./lib/facebook-tone-suggestions.mjs');
const postId = 'post:sample';
const collection = 'a'.repeat(64);
const rawCollection = 'b'.repeat(64);
const textHash = 'c'.repeat(64);
const batchId = '11111111-1111-4111-8111-111111111111';

function sourceFiles(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tone-suggestions-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'comments'));
  const report = { version: 1, collectionSha256: collection, posts: [{ id: postId,
    sourceTextSha256: textHash, stance: { gyurov: 'critical', yotova: null } }] };
  const comments = { version: 1, collectionSha256: rawCollection, postId, comments: [
    { id: 1, parentId: null, text: 'Public reviewed excerpt.', truncated: false, gyurov: 'neutral', yotova: 'not-mentioned' },
    { id: 2, parentId: 1, text: null, truncated: false, gyurov: 'unreviewed', yotova: 'unreviewed' },
  ] };
  const bytes = JSON.stringify(comments) + '\n';
  const file = createHash('sha256').update(bytes).digest('hex') + '.json';
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report));
  writeFileSync(join(directory, 'comments', file), bytes);
  writeFileSync(join(directory, 'comments/manifest.json'), JSON.stringify({ version: 1,
    collectionSha256: rawCollection, posts: [{ postId, file, count: 2 }] }));
  return { directory, file };
}

function draft(source, changes = {}) {
  const { editable, ...record } = source;
  return { ...record, gyurov: 'supportive', yotova: record.originalYotova, ...changes };
}

const payload = changes => ({ version: 1, batchId, changes });
const request = (value, options = {}) => new Request('https://voting-results.netlify.app/api/facebook-tone-suggestions', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://voting-results.netlify.app', ...options.headers },
  body: JSON.stringify(value),
});

function storage() {
  const records = new Map();
  const options = [];
  return {
    records, options,
    getStore(settings) {
      options.push(settings);
      return {
        async setJSON(key, value, condition) {
          assert.deepEqual(condition, { onlyIfNew: true });
          if (records.has(key)) return { modified: false };
          records.set(key, structuredClone(value));
          return { modified: true, etag: 'stored-etag' };
        },
        async get(key, settings) {
          assert.deepEqual(settings, { type: 'json', consistency: 'strong' });
          return records.get(key) ?? null;
        },
      };
    },
  };
}

test('catalog pins source revisions and never contains comment text or author fields', async t => {
  const { loadToneReviewCatalog } = await implementation;
  const { directory, file } = sourceFiles(t);
  const catalog = loadToneReviewCatalog(directory);
  assert.equal(catalog.size, 3);
  assert.equal(catalog.get(`post:${postId}`).collectionSha256, collection);
  assert.equal(catalog.get(`post:${postId}`).originalYotova, 'not-mentioned');
  assert.equal(catalog.get(`comment:${postId}:1`).sourceSha256, file.slice(0, -5));
  assert.equal(catalog.get(`comment:${postId}:1`).collectionSha256, rawCollection);
  assert.equal(catalog.get(`comment:${postId}:2`).editable, false);
  assert.equal(JSON.stringify([...catalog.values()]).includes('Public reviewed excerpt'), false);
  assert.equal(JSON.stringify([...catalog.values()]).includes('author'), false);
});

test('catalog rejects reader content that does not match the bundled manifest hash', async t => {
  const { loadToneReviewCatalog } = await implementation;
  const { directory, file } = sourceFiles(t);
  writeFileSync(join(directory, 'comments', file), readFileSync(join(directory, 'comments', file), 'utf8') + ' ');
  assert.throws(() => loadToneReviewCatalog(directory), /content hash mismatch/);
});

test('catalog accepts every deployed source record and its largest allowed batch fits the request bound', async () => {
  const { loadToneReviewCatalog, parseToneSuggestions } = await implementation;
  const directory = resolve(__dirname, '../public/data/facebook/2026');
  const catalog = loadToneReviewCatalog(directory);
  const report = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
  const comments = JSON.parse(readFileSync(join(directory, 'comments.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(directory, 'comments/manifest.json'), 'utf8'));
  assert.equal(catalog.size, report.posts.length + manifest.posts.reduce((sum, post) => sum + post.count, 0));
  const records = [...catalog.values()];
  assert.equal(records.filter(record => record.kind === 'post').length, report.posts.length);
  assert.equal(records.filter(record => record.kind === 'comment').length, 7997);
  assert.equal(records.filter(record => record.kind === 'comment' && record.editable).length, 6224);
  assert.equal(records.filter(record => !record.editable).length, 1773);
  assert(records.filter(record => record.kind === 'comment')
    .every(record => record.originalGyurov !== 'unreviewed' && record.originalYotova !== 'unreviewed'));
  assert.equal(comments.posts.reduce((sum, post) => sum + post.capturedCount, 0), 7997);
  assert.equal(comments.posts.reduce((sum, post) => sum + post.assessedCount, 0), 7997);
  for (const post of comments.posts) {
    assert.equal(post.assessedCount, post.capturedCount);
    for (const candidate of ['gyurov', 'yotova']) assert.equal(post.counts[candidate].unreviewed, 0);
  }
  const largest = records.filter(record => record.editable)
    .map(record => draft(record, { gyurov: record.originalGyurov === 'supportive' ? 'critical' : 'supportive' }))
    .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length).slice(0, 100);
  const batch = payload(largest);
  assert.ok(Buffer.byteLength(JSON.stringify(batch), 'utf8') < 128 * 1024);
  assert.equal(parseToneSuggestions(batch, catalog).changes.length, 100);
});

test('parser sanitizes and canonicalizes valid post and comment changes', async t => {
  const { loadToneReviewCatalog, parseToneSuggestions } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const post = draft(catalog.get(`post:${postId}`));
  const comment = draft(catalog.get(`comment:${postId}:1`));
  const parsed = parseToneSuggestions(payload([post, comment]), catalog);
  assert.deepEqual(parsed.changes.map(change => change.key), [comment.key, post.key]);
  assert.deepEqual(new Set(Object.keys(parsed.changes[0])), new Set(Object.keys(comment)));
  assert.equal(parsed.changes.some(change => Object.hasOwn(change, 'editable')), false);
});

test('parser rejects unknown fields, enums, duplicates, no-ops and stale sources', async t => {
  const { loadToneReviewCatalog, parseToneSuggestions } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const post = draft(catalog.get(`post:${postId}`));
  const invalid = [
    { ...payload([post]), visitor: 'unexpected' },
    { ...payload([post]), version: 2 },
    { ...payload([post]), batchId: '../unsafe-path' },
    payload([]), payload(Array.from({ length: 101 }, () => post)),
    payload([{ ...post, author: 'unexpected' }]),
    payload([{ ...post, gyurov: 'unknown' }]),
    payload([post, post]),
    payload([{ ...post, gyurov: post.originalGyurov }]),
    payload([{ ...post, sourceSha256: 'd'.repeat(64) }]),
    payload([{ ...post, collectionSha256: rawCollection }]),
    payload([{ ...post, originalYotova: 'critical' }]),
    payload([{ ...post, kind: 'comment' }]),
    payload([{ ...post, postId: 'uncollected' }]),
    payload([{ ...post, commentId: 100 }]),
    payload([{ ...post, key: '__proto__' }]),
    payload([draft(catalog.get(`comment:${postId}:2`))]),
  ];
  for (const value of invalid) assert.throws(() => parseToneSuggestions(value, catalog));
});

test('handler rejects invalid HTTP envelopes before touching storage', async () => {
  const { createToneSuggestionsHandler } = await implementation;
  let calls = 0;
  const handle = createToneSuggestionsHandler({ getStore() { calls++; throw new Error('Unexpected store'); }, loadCatalog() { throw new Error('Unexpected catalog'); } });
  assert.equal((await handle(new Request('https://example.test/api'))).status, 405);
  assert.equal((await handle(request({}, { headers: { origin: 'https://other.test' } }))).status, 403);
  assert.equal((await handle(request({}, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  assert.equal((await handle(request({}, { headers: { 'content-length': '999999' } }))).status, 413);
  assert.equal((await handle(request({ oversized: 'x'.repeat(128 * 1024) }))).status, 413);
  assert.equal((await handle(new Request('https://example.test/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal(calls, 0);
});

test('handler stores only validated records and returns an exact acknowledgement', async t => {
  const { loadToneReviewCatalog, createToneSuggestionsHandler } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const store = storage();
  const handle = createToneSuggestionsHandler({ getStore: store.getStore, loadCatalog: () => catalog,
    now: () => '2026-11-05T20:00:00.000Z' });
  const changes = [draft(catalog.get(`comment:${postId}:1`))];
  const response = await handle(request(payload(changes)));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { version: 1, batchId, accepted: 1 });
  assert.deepEqual(store.options, [{ name: 'facebook-tone-suggestions', consistency: 'strong' }]);
  assert.deepEqual(store.records.get(batchId), { ...payload(changes), receivedAt: '2026-11-05T20:00:00.000Z' });
  assert.equal(JSON.stringify([...store.records.values()]).includes('Public reviewed excerpt'), false);
});

test('retrying the same batch is idempotent and cannot overwrite a different batch body', async t => {
  const { loadToneReviewCatalog, createToneSuggestionsHandler } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const store = storage();
  const handle = createToneSuggestionsHandler({ getStore: store.getStore, loadCatalog: () => catalog });
  const changes = [draft(catalog.get(`post:${postId}`)), draft(catalog.get(`comment:${postId}:1`))];
  assert.equal((await handle(request(payload(changes)))).status, 201);
  const original = structuredClone(store.records.get(batchId));
  const repeated = await handle(request(payload([...changes].reverse())));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { version: 1, batchId, accepted: 2 });
  const conflict = await handle(request(payload([{ ...changes[0], gyurov: 'mixed' }])));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'batch-conflict' });
  assert.deepEqual(store.records.get(batchId), original);
  assert.equal(store.records.size, 1);
});

test('invalid source changes never reach the store', async t => {
  const { loadToneReviewCatalog, createToneSuggestionsHandler } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const handle = createToneSuggestionsHandler({ getStore() { throw new Error('Must not store invalid changes'); }, loadCatalog: () => catalog });
  const invalid = draft(catalog.get(`post:${postId}`), { sourceSha256: 'd'.repeat(64) });
  const response = await handle(request(payload([invalid])));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'outdated-source' });
});

test('runtime credentials, failed writes and missing source files produce retryable failures', async t => {
  const { loadToneReviewCatalog, createToneSuggestionsHandler } = await implementation;
  const catalog = loadToneReviewCatalog(sourceFiles(t).directory);
  const value = payload([draft(catalog.get(`post:${postId}`))]);
  const previousError = console.error;
  const errors = [];
  console.error = event => errors.push(event);
  t.after(() => { console.error = previousError; });
  const cases = [
    { getStore() { throw new Error('secret runtime credentials'); }, loadCatalog: () => catalog },
    { getStore: () => ({ setJSON: async () => { throw new Error('secret storage failure'); } }), loadCatalog: () => catalog },
    { getStore: () => ({ setJSON: async () => ({ modified: false }), get: async () => null }), loadCatalog: () => catalog },
    { getStore() {}, loadCatalog() { throw new Error('private path'); } },
  ];
  for (const options of cases) {
    const response = await createToneSuggestionsHandler(options)(request(value));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'submission-unavailable' });
  }
  assert.deepEqual(errors, Array.from({ length: cases.length }, () => ({ event: 'facebook-tone-suggestion-unavailable' })));
});
