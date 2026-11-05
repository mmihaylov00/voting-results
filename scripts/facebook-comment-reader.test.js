const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFacebookComments } = require('./build-facebook-comments');
const { buildFacebookCommentReader, commentExcerpt } = require('./build-facebook-comment-reader');

const time = '2026-11-05T09:00:00.000Z';
const hash = text => createHash('sha256').update(text).digest('hex');
const report = { posts: [{ id: 'post-1', url: 'https://www.facebook.com/example/posts/1' }] };
const comment = (id, text, parentId = null) => ({
  id, parentId, text, textComplete: true, textSha256: hash(text), publishedAtRaw: time, capturedAt: time,
  url: report.posts[0].url + '?comment_id=' + (parentId ?? id) + (parentId ? '&reply_comment_id=' + id : ''),
});
const raw = comments => ({ version: 1, capturedAt: time, posts: [{
  postId: 'post-1', postUrl: report.posts[0].url, checkedAt: time,
  status: 'complete', ordering: 'all', reportedCount: comments.length, notes: [], comments,
}] });
const reviews = rows => Object.fromEntries(rows.map(row => [row.textSha256, { text: commentExcerpt(row.text) || null, reviewedAt: time }]));
const build = (input, annotations = {}, privacy = reviews(input.posts[0].comments), aggregateOverride) =>
  buildFacebookCommentReader(input, annotations, privacy, report, aggregateOverride ?? buildFacebookComments(input, annotations, report));

test('exports reviewed excerpts and local thread indexes without author or native comment records', () => {
  const root = comment('native-root-123', 'Мария Иванова\nБраво, Йотова!');
  const reply = comment('native-reply-456', 'Съгласен съм.', root.id);
  const input = raw([reply, root]);
  const privacy = reviews([root, reply]);
  privacy[root.textSha256].text = 'Браво, Йотова!';
  const annotations = { 'post-1|native-root-123': { sourceTextSha256: root.textSha256,
    gyurov: null, yotova: 'supportive', reason: 'PRIVATE REVIEW REASON', reviewedAt: time } };
  const output = build(input, annotations, privacy);
  assert.match(output.manifest.posts[0].file, /^[a-f0-9]{64}\.json$/);
  assert.equal(output.manifest.posts[0].count, 2);
  const file = output.files.get(output.manifest.posts[0].file);
  assert.equal(output.manifest.posts[0].file, hash(JSON.stringify(file) + '\n') + '.json');
  assert.equal(file.comments[0].parentId, 2);
  assert.equal(file.comments[1].parentId, null);
  assert.equal(file.comments[1].text, 'Браво, Йотова!');
  assert.equal(file.comments[1].yotova, 'supportive');
  assert.equal(file.comments[0].gyurov, 'unreviewed');
  assert.doesNotMatch(JSON.stringify(file), /Мария|Иванова|native-root|native-reply|PRIVATE|facebook\.com|textSha256|publishedAtRaw|capturedAt/);
});

test('requires a reviewed decision for every unique source text and preserves hidden texts and duplicate bodies', () => {
  const rows = [comment('a', 'Текст'), comment('b', 'Текст'), comment('c', '')];
  const privacy = reviews(rows);
  privacy[rows[0].textSha256].text = null;
  const output = build(raw(rows), {}, privacy);
  assert.deepEqual([...output.files.values()][0].comments.map(row => row.text), [null, null, null]);
  delete privacy[rows[0].textSha256];
  assert.throws(() => build(raw(rows), {}, privacy), /missing its privacy review/);
  assert.throws(() => build(raw(rows), {}, { ...reviews(rows), [hash('unknown')]: { text: null, reviewedAt: time } }), /unknown text/);
});

test('rejects privacy payloads that could leak identifiers, introduce prose, or change the published cohort', () => {
  const row = comment('a', 'Мария Иванова, пишете на maria@example.com или https://example.com, телефон 0888123456.');
  const input = raw([row]);
  for (const text of ['maria@example.com', 'https://example.com', '0888123456', 'Напълно ново твърдение']) {
    assert.throws(() => build(input, {}, { [row.textSha256]: { text, reviewedAt: time } }), /identifier|only remove/);
  }
  assert.throws(() => build(input, {}, { [row.textSha256]: { text: null, reviewedAt: time, authorName: 'Мария' } }), /Invalid privacy review/);
  assert.throws(() => build(input, {}, { [row.textSha256]: { text: null, reviewedAt: 'unknown' } }), /Invalid privacy review/);
  assert.throws(() => build(input, {}, reviews([row]), { ...buildFacebookComments(input, {}, report), collectionSha256: '0'.repeat(64) }), /published comment aggregates/);
});

test('only permits deletions and explicit redaction markers, with a Unicode-safe excerpt limit', () => {
  const row = comment('a', 'Мария Иванова\nСамо Йотова!');
  const output = build(raw([row]), {}, { [row.textSha256]: { text: '[име]\nСамо Йотова!', reviewedAt: time } });
  assert.equal([...output.files.values()][0].comments[0].text, '[име]\nСамо Йотова!');
  assert.equal(Array.from(commentExcerpt('😀'.repeat(300))).length, 280);
  const lineEndings = comment('crlf', 'а'.repeat(278) + '\r\nб');
  assert.equal([...build(raw([lineEndings])).files.values()][0].comments[0].truncated, false);
  const long = comment('long', 'а'.repeat(281));
  const excerpt = [...build(raw([long])).files.values()][0].comments[0];
  assert.equal(excerpt.text.length, 280);
  assert.equal(excerpt.truncated, true);
  assert.throws(() => build(raw([long]), {}, { [long.textSha256]: { text: long.text, reviewedAt: time } }), /Invalid reviewed excerpt/);
});

test('reader URLs change on excerpt or per-comment label revisions even when aggregate totals stay equal', () => {
  const rows = [comment('a', 'Първи коментар'), comment('b', 'Втори коментар')];
  const input = raw(rows);
  const annotation = (row, gyurov) => ({ sourceTextSha256: row.textSha256, gyurov,
    yotova: null, reason: 'Преглед.', reviewedAt: time });
  const first = { 'post-1|a': annotation(rows[0], 'critical'), 'post-1|b': annotation(rows[1], 'neutral') };
  const second = { 'post-1|a': annotation(rows[0], 'neutral'), 'post-1|b': annotation(rows[1], 'critical') };
  assert.deepEqual(buildFacebookComments(input, first, report), buildFacebookComments(input, second, report));
  assert.notEqual(build(input, first).manifest.posts[0].file, build(input, second).manifest.posts[0].file);
  const privacy = reviews(rows);
  privacy[rows[0].textSha256].text = null;
  assert.notEqual(build(input, first).manifest.posts[0].file, build(input, first, privacy).manifest.posts[0].file);
});

test('rejects missing roots and nested parent references', () => {
  assert.throws(() => build(raw([comment('reply', 'Отговор', 'missing')])), /thread root/);
  const rows = [comment('root', 'Основен'), comment('reply', 'Отговор', 'root'), comment('nested', 'Друг отговор', 'reply')];
  assert.throws(() => build(raw(rows)), /thread root/);
});

test('CLI publishes validated files and preserves the previous export when privacy validation fails', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'facebook-comment-reader-'));
  try {
    const scripts = path.join(folder, 'scripts');
    const data = path.join(folder, 'public/data/facebook/2026');
    const privateFiles = path.join(folder, 'private');
    for (const directory of [scripts, data, privateFiles]) fs.mkdirSync(directory, { recursive: true });
    for (const file of ['build-facebook-comment-reader.js', 'build-facebook-comments.js']) fs.copyFileSync(path.join(__dirname, file), path.join(scripts, file));
    const input = raw([comment('private-native-id', 'Браво, Йотова!')]);
    const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
    write(path.join(data, 'report.json'), report);
    write(path.join(data, 'comments.json'), buildFacebookComments(input, {}, report));
    const rawFile = path.join(privateFiles, 'raw.json');
    const annotations = path.join(privateFiles, 'assessments.json');
    const privacy = path.join(privateFiles, 'privacy.json');
    write(rawFile, input);
    write(annotations, {});
    write(privacy, reviews(input.posts[0].comments));
    const script = path.join(scripts, 'build-facebook-comment-reader.js');
    const run = (...extra) => spawnSync(process.execPath, [script, rawFile, annotations, privacy, ...extra], { encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const output = path.join(data, 'comments');
    const manifestFile = path.join(output, 'manifest.json');
    const manifest = fs.readFileSync(manifestFile, 'utf8');
    const file = JSON.parse(manifest).posts[0].file;
    const published = fs.readFileSync(path.join(output, file), 'utf8');
    write(privacy, {});
    assert.equal(run().status, 1);
    assert.equal(fs.readFileSync(manifestFile, 'utf8'), manifest);
    assert.equal(fs.readFileSync(path.join(output, file), 'utf8'), published);
    const updated = reviews(input.posts[0].comments);
    updated[input.posts[0].comments[0].textSha256].text = null;
    write(privacy, updated);
    assert.equal(run().status, 0);
    const revised = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.notEqual(revised.posts[0].file, file);
    assert.equal(fs.existsSync(path.join(output, file)), false);
    assert.equal(run(privateFiles).status, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(rawFile, 'utf8')), input);
    assert(!fs.readdirSync(output).some(name => name.includes('.tmp-')));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
