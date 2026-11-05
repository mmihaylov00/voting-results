const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CANDIDATES = ['gyurov', 'yotova'];
const TONES = ['supportive', 'critical', 'mixed', 'neutral', 'unclear'];
const BUCKETS = [...TONES, 'not-mentioned', 'unreviewed'];
const STATUSES = ['partial', 'complete', 'unavailable'];
const ORDERINGS = ['all', 'newest', 'most-relevant', null];
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const timestamp = value => nonempty(value) && Number.isFinite(Date.parse(value));
const identifier = value => nonempty(value) && !value.includes('|');

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function fields(value, allowed, label) {
  requireValue(object(value), `${label} must be an object.`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} contains an unsupported field.`);
}

function facebookUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.facebook.com'
      && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function emptyCounts() {
  return Object.fromEntries(CANDIDATES.map(candidate => [candidate,
    Object.fromEntries(BUCKETS.map(bucket => [bucket, 0]))]));
}

/** Build public aggregates without publishing individual comments or assessments. */
function buildFacebookComments(raw, assessments, report) {
  fields(raw, ['version', 'capturedAt', 'posts'], 'Collection');
  requireValue(raw.version === 1 && timestamp(raw.capturedAt) && Array.isArray(raw.posts), 'Invalid collection header.');
  requireValue(object(assessments), 'Assessments must be an object keyed by post ID and comment ID.');
  requireValue(Array.isArray(report?.posts), 'Report must contain posts.');
  const knownPosts = new Map();
  for (const post of report.posts) {
    requireValue(object(post) && identifier(post.id) && facebookUrl(post.url)
      && !knownPosts.has(post.id), 'Report contains an invalid or duplicate post.');
    knownPosts.set(post.id, post);
  }

  const captures = new Map();
  const comments = new Map();
  for (const capture of raw.posts) {
    fields(capture, ['postId', 'postUrl', 'checkedAt', 'status', 'ordering', 'reportedCount', 'notes', 'comments'], 'Post capture');
    requireValue(knownPosts.has(capture.postId), 'Capture references an unknown post.');
    requireValue(!captures.has(capture.postId), 'Duplicate post capture.');
    requireValue(capture.postUrl === knownPosts.get(capture.postId).url, 'Capture post URL does not match the report.');
    requireValue(timestamp(capture.checkedAt) && STATUSES.includes(capture.status)
      && ORDERINGS.includes(capture.ordering)
      && (capture.reportedCount === null || Number.isSafeInteger(capture.reportedCount) && capture.reportedCount >= 0)
      && Array.isArray(capture.notes) && capture.notes.every(nonempty)
      && Array.isArray(capture.comments), 'Invalid post capture fields.');
    requireValue(capture.status !== 'unavailable' || capture.comments.length === 0,
      'An unavailable post cannot contain captured comments; use partial coverage.');

    const byId = new Map();
    for (const comment of capture.comments) {
      fields(comment, ['id', 'parentId', 'url', 'text', 'textComplete', 'publishedAtRaw', 'capturedAt', 'textSha256'], 'Comment');
      requireValue(identifier(comment.id) && (comment.parentId === null || identifier(comment.parentId))
        && comment.parentId !== comment.id && facebookUrl(comment.url)
        && typeof comment.text === 'string' && typeof comment.textComplete === 'boolean'
        && (comment.publishedAtRaw === null || nonempty(comment.publishedAtRaw))
        && timestamp(comment.capturedAt), 'Invalid comment fields.');
      requireValue(comment.textSha256 === hash(comment.text), 'Comment text hash does not match the captured text.');
      const sourceIds = new URL(comment.url).searchParams;
      requireValue(comment.parentId === null
        ? sourceIds.get('comment_id') === comment.id && !sourceIds.has('reply_comment_id')
        : sourceIds.get('comment_id') === comment.parentId && sourceIds.get('reply_comment_id') === comment.id,
      'Comment URL IDs do not match the captured comment and parent.');
      const previous = byId.get(comment.id);
      if (previous) {
        requireValue(['parentId', 'url', 'text', 'textComplete', 'publishedAtRaw', 'textSha256']
          .every(field => previous[field] === comment[field]), 'Conflicting duplicate comment ID.');
      } else {
        byId.set(comment.id, comment);
        comments.set(`${capture.postId}|${comment.id}`, comment);
      }
    }
    captures.set(capture.postId, { capture, comments: [...byId.values()] });
  }

  const annotations = new Map(Object.entries(assessments));
  for (const [key, assessment] of annotations) {
    requireValue(comments.has(key), 'Assessment references an unknown captured comment.');
    fields(assessment, ['sourceTextSha256', 'gyurov', 'yotova', 'reason', 'reviewedAt'], 'Assessment');
    requireValue(assessment.sourceTextSha256 === comments.get(key).textSha256,
      'Assessment is stale: its source text hash does not match the comment.');
    requireValue(CANDIDATES.every(candidate => assessment[candidate] === null || TONES.includes(assessment[candidate]))
      && nonempty(assessment.reason) && timestamp(assessment.reviewedAt), 'Invalid comment assessment.');
  }

  const posts = report.posts.map(post => {
    const source = captures.get(post.id);
    const counts = emptyCounts();
    let assessedCount = 0;
    let topLevelCount = 0;
    for (const comment of source?.comments ?? []) {
      const assessment = annotations.get(`${post.id}|${comment.id}`);
      if (assessment) assessedCount++;
      if (comment.parentId === null) topLevelCount++;
      for (const candidate of CANDIDATES) {
        counts[candidate][assessment ? assessment[candidate] ?? 'not-mentioned' : 'unreviewed']++;
      }
    }
    const capturedCount = source?.comments.length ?? 0;
    return {
      postId: post.id, checkedAt: source?.capture.checkedAt ?? null,
      status: source?.capture.status ?? 'not-checked', ordering: source?.capture.ordering ?? null,
      reportedCount: source?.capture.reportedCount ?? null, capturedCount, assessedCount, topLevelCount,
      replyCount: capturedCount - topLevelCount, counts, notes: [...source?.capture.notes ?? []],
    };
  });
  return { version: 1, capturedAt: raw.capturedAt, collectionSha256: hash(JSON.stringify(raw)), posts };
}

function main() {
  const [rawFile, assessmentsFile, requestedOutput, ...extra] = process.argv.slice(2);
  requireValue(rawFile && assessmentsFile && !extra.length,
    'Usage: node scripts/build-facebook-comments.js RAW.json ASSESSMENTS.json [OUTPUT.json]');
  const reportFile = path.resolve(__dirname, '../public/data/facebook/2026/report.json');
  const outputFile = path.resolve(requestedOutput ?? path.join(path.dirname(reportFile), 'comments.json'));
  requireValue(![rawFile, assessmentsFile, reportFile].some(file => path.resolve(file) === outputFile),
    'Output must differ from the input files and the election research report.');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const output = buildFacebookComments(read(rawFile), read(assessmentsFile), read(reportFile));
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(output, null, 2) + '\n');
    fs.renameSync(temporaryFile, outputFile);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
  console.log(`Wrote ${output.posts.length} post aggregates to ${outputFile}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildFacebookComments };
