const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFacebookComments } = require('./build-facebook-comments');

const time = '2026-11-05T09:00:00.000Z';
const report = { posts: [
  { id: 'p1', url: 'https://www.facebook.com/example/posts/1' },
  { id: 'p2', url: 'https://www.facebook.com/example/posts/2' },
  { id: 'p3', url: 'https://www.facebook.com/example/posts/3' },
] };
const hash = value => createHash('sha256').update(value).digest('hex');
const collection = (...posts) => ({ version: 1, capturedAt: time, posts });
const comment = (id, text = 'Текст за преглед', parentId = null) => ({
  id, parentId, url: `https://www.facebook.com/example/posts/1?comment_id=${parentId ?? id}${parentId ? `&reply_comment_id=${id}` : ''}`,
  text, textComplete: true, publishedAtRaw: '1d', capturedAt: time, textSha256: hash(text),
});
const capture = (comments = [], overrides = {}) => ({
  postId: 'p1', postUrl: report.posts[0].url, checkedAt: time, status: 'partial',
  ordering: 'all', reportedCount: null, notes: ['Събрана е само видимата част.'], comments, ...overrides,
});
const assessment = (row, gyurov = 'supportive', yotova = 'critical') => ({
  sourceTextSha256: row.textSha256, gyurov, yotova, reason: 'Изрично отношение в текста.', reviewedAt: time,
});

test('retains every report post and distinguishes unchecked, unavailable and observed zero comments', () => {
  const original = structuredClone(report);
  const raw = collection(capture([], { status: 'complete', reportedCount: 0 }),
    capture([], { postId: 'p2', postUrl: report.posts[1].url, status: 'unavailable', ordering: null }));
  const output = buildFacebookComments(raw, {}, report);
  assert.deepEqual(output.posts.map(row => row.postId), ['p1', 'p2', 'p3']);
  assert.deepEqual(output.posts.map(row => row.status), ['complete', 'unavailable', 'not-checked']);
  assert.deepEqual(output.posts.map(row => row.reportedCount), [0, null, null]);
  assert.equal(output.posts[2].checkedAt, null);
  assert(output.posts.every(row => row.capturedCount === 0 && row.assessedCount === 0));
  assert.equal(output.collectionSha256, hash(JSON.stringify(raw)));
  assert.deepEqual(report, original);
});

test('counts independent candidate assessments, unknowns and replies without reaction weighting', () => {
  const rows = ['supportive', 'critical', 'mixed', 'neutral', 'unclear', null, undefined]
    .map((tone, index) => comment(String(index + 1), `Коментар ${index}`, index ? '1' : null));
  const annotations = Object.fromEntries(rows.slice(0, 6).map((row, index) => [`p1|${row.id}`,
    assessment(row, ['supportive', 'critical', 'mixed', 'neutral', 'unclear', null][index],
      ['critical', 'supportive', 'unclear', 'mixed', 'neutral', null][index])]));
  const row = buildFacebookComments(collection(capture(rows, { reportedCount: 100 })), annotations, report).posts[0];
  assert.equal(row.capturedCount, 7);
  assert.equal(row.assessedCount, 6);
  assert.equal(row.topLevelCount, 1);
  assert.equal(row.replyCount, 6);
  for (const candidate of ['gyurov', 'yotova']) {
    assert.deepEqual(Object.values(row.counts[candidate]), [1, 1, 1, 1, 1, 1, 1]);
    assert.equal(Object.values(row.counts[candidate]).reduce((sum, count) => sum + count, 0), row.capturedCount);
  }
  const independent = buildFacebookComments(collection(capture([rows[0]])),
    { 'p1|1': assessment(rows[0], null, 'supportive') }, report).posts[0];
  assert.equal(independent.counts.gyurov['not-mentioned'], 1);
  assert.equal(independent.counts.gyurov.critical, 0);
  assert.equal(independent.counts.yotova.supportive, 1);
});

test('deduplicates repeated IDs but preserves identical text at distinct IDs', () => {
  const first = comment('1', 'Повтарящ се текст');
  const sameText = comment('2', first.text);
  const raw = collection(capture([first, { ...first, capturedAt: '2026-11-05T09:01:00.000Z' }, sameText]));
  const output = buildFacebookComments(raw, { 'p1|1': assessment(first), 'p1|2': assessment(sameText) }, report);
  assert.equal(output.posts[0].capturedCount, 2);
  assert.equal(output.posts[0].counts.gyurov.supportive, 2);
  assert.throws(() => buildFacebookComments(collection(capture([first, comment('1', 'Друг текст')])), {}, report), /Conflicting duplicate/);
  assert.throws(() => buildFacebookComments(collection(capture([first, comment('1', first.text, '2')])), {}, report), /Conflicting duplicate/);
});

test('rejects incorrect text hashes, stale assessments and unknown references', () => {
  const first = comment('1');
  const raw = collection(capture([first]));
  assert.throws(() => buildFacebookComments(collection(capture([{ ...first, text: 'Променен текст' }])), {}, report), /text hash/);
  assert.throws(() => buildFacebookComments(raw, { 'p1|1': { ...assessment(first), sourceTextSha256: '0'.repeat(64) } }, report), /stale/);
  assert.throws(() => buildFacebookComments(raw, { 'p1|2': assessment(first) }, report), /unknown captured comment/);
  assert.throws(() => buildFacebookComments(collection(capture([], { postId: 'unknown' })), {}, report), /unknown post/);
  assert.throws(() => buildFacebookComments(collection(capture([], { postUrl: report.posts[1].url })), {}, report), /URL does not match/);
  assert.throws(() => buildFacebookComments(collection(capture(), capture()), {}, report), /Duplicate post capture/);
  assert.throws(() => buildFacebookComments(collection(capture([{ ...first, url: `${report.posts[0].url}?comment_id=other` }])), {}, report), /URL IDs/);
  assert.throws(() => buildFacebookComments(collection(capture([{ ...comment('2', 'Reply', '1'), parentId: '3' }])), {}, report), /URL IDs/);
});

test('validates capture fields and assessment values before publishing', () => {
  const first = comment('1');
  for (const invalid of [{ status: 'not-checked' }, { ordering: 'friends' }, { reportedCount: -1 },
    { reportedCount: 1.5 }, { checkedAt: 'unknown' }, { notes: [''] }, { comments: null }]) {
    assert.throws(() => buildFacebookComments(collection(capture([], invalid)), {}, report), /Invalid post capture/);
  }
  for (const invalid of [{ textComplete: null }, { parentId: '1' }, { id: 'bad|id' },
    { url: 'https://example.com/comment/1' }, { capturedAt: 'unknown' }, { publishedAtRaw: '' }]) {
    assert.throws(() => buildFacebookComments(collection(capture([{ ...first, ...invalid }])), {}, report), /Invalid comment/);
  }
  for (const invalid of [{ gyurov: 'positive' }, { yotova: undefined }, { reason: '' }, { reviewedAt: 'unknown' }]) {
    assert.throws(() => buildFacebookComments(collection(capture([first])),
      { 'p1|1': { ...assessment(first), ...invalid } }, report), /Invalid comment assessment/);
  }
  assert.throws(() => buildFacebookComments(collection(capture([first], { status: 'unavailable' })), {}, report), /unavailable post/);
});

test('publishes only aggregate counts and collection coverage, with no comment or author records', () => {
  const first = comment('private-comment-id', 'PRIVATE COMMENT TEXT');
  const annotation = { ...assessment(first), reason: 'PRIVATE ASSESSMENT REASON' };
  const output = buildFacebookComments(collection(capture([first])), { 'p1|private-comment-id': annotation }, report);
  assert.deepEqual(Object.keys(output), ['version', 'capturedAt', 'collectionSha256', 'posts']);
  assert.deepEqual(Object.keys(output.posts[0]), ['postId', 'checkedAt', 'status', 'ordering', 'reportedCount',
    'capturedCount', 'assessedCount', 'topLevelCount', 'replyCount', 'counts', 'notes']);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|private-comment-id|facebook\.com|textSha256|sourceTextSha256/);
  assert.throws(() => buildFacebookComments(collection(capture([{ ...first, authorName: 'PRIVATE AUTHOR' }])), {}, report), /unsupported field/);
});

test('CLI uses report references and writes all post aggregates without overwriting inputs on failure', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'facebook-comments-'));
  try {
    const rawFile = path.join(folder, 'raw.json');
    const assessmentsFile = path.join(folder, 'assessments.json');
    const outputFile = path.join(folder, 'public', 'comments.json');
    const script = path.join(__dirname, 'build-facebook-comments.js');
    const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/facebook/2026/report.json'), 'utf8'));
    const raw = collection(capture([], { postId: actual.posts[0].id, postUrl: actual.posts[0].url }));
    fs.writeFileSync(rawFile, JSON.stringify(raw));
    fs.writeFileSync(assessmentsFile, '{}');
    execFileSync(process.execPath, [script, rawFile, assessmentsFile, outputFile]);
    const published = fs.readFileSync(outputFile, 'utf8');
    assert.equal(JSON.parse(published).posts.length, actual.posts.length);
    fs.writeFileSync(assessmentsFile, JSON.stringify({ unknown: {} }));
    const failed = spawnSync(process.execPath, [script, rawFile, assessmentsFile, outputFile], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.equal(fs.readFileSync(outputFile, 'utf8'), published);
    const overwrite = spawnSync(process.execPath, [script, rawFile, assessmentsFile, rawFile], { encoding: 'utf8' });
    assert.equal(overwrite.status, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(rawFile, 'utf8')), raw);
    assert(!fs.readdirSync(path.dirname(outputFile)).some(name => name.includes('.tmp-')));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
