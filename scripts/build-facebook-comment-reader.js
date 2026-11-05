const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildFacebookComments } = require('./build-facebook-comments');

const MAX_EXCERPT = 280;
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const markers = /\[(?:име|лични данни|връзка|скрито|обида|лично твърдение)\]/gu;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

/** The privacy review covers exactly this excerpt, never an unseen continuation. */
function commentExcerpt(text) {
  return Array.from(text.replace(/\r\n?/g, '\n').trim()).slice(0, MAX_EXCERPT).join('');
}

function removedOnly(text, source) {
  const remaining = Array.from(text.replace(markers, '').replace(/\s+/gu, ' ').trim());
  let index = 0;
  for (const character of source.replace(/\s+/gu, ' ').trim()) {
    if (remaining[index] === character) index++;
  }
  return index === remaining.length;
}

function validatePrivacyReview(review, source, sourceHash) {
  const label = ' (' + sourceHash + ')';
  requireValue(object(review) && Object.keys(review).every(key => ['text', 'reviewedAt'].includes(key))
    && typeof review.reviewedAt === 'string' && Number.isFinite(Date.parse(review.reviewedAt)), 'Invalid privacy review.' + label);
  if (review.text === null) return;
  requireValue(typeof review.text === 'string' && review.text.trim().length > 0
    && Array.from(review.text).length <= MAX_EXCERPT, 'Invalid reviewed excerpt.' + label);
  requireValue(removedOnly(review.text, commentExcerpt(source)), 'An excerpt may only remove text or add redaction markers.' + label);
  const numberRuns = review.text.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? [];
  requireValue(!/https?:\/\/|www\.|facebook\.com|@/iu.test(review.text)
    && !numberRuns.some(value => value.replace(/\D/g, '').length >= 7), 'Reviewed excerpt contains a link or possible personal identifier.' + label);
}

/** Privacy review is mandatory; absence never falls back to the raw comment. */
function buildFacebookCommentReader(raw, assessments, reviews, report, aggregates) {
  const expected = buildFacebookComments(raw, assessments, report);
  assert.deepEqual(aggregates, expected, 'Reader inputs must match the published comment aggregates.');
  requireValue(object(reviews), 'Privacy reviews must be an object keyed by source text hash.');
  const texts = new Map(raw.posts.flatMap(post => post.comments.map(comment => [comment.textSha256, comment.text])));
  for (const [sourceHash, review] of Object.entries(reviews)) {
    requireValue(texts.has(sourceHash), 'Privacy review references an unknown text.');
    validatePrivacyReview(review, texts.get(sourceHash), sourceHash);
  }
  requireValue([...texts.keys()].every(key => Object.hasOwn(reviews, key)), 'A comment is missing its privacy review.');

  const captures = new Map(raw.posts.map(post => [post.postId, post]));
  const files = new Map();
  const posts = report.posts.map(post => {
    const source = captures.get(post.id);
    const comments = [...new Map((source?.comments ?? []).map(comment => [comment.id, comment])).values()];
    const indexes = new Map(comments.map((comment, index) => [comment.id, index + 1]));
    const rows = comments.map((comment, index) => {
      const parentId = comment.parentId === null ? null : indexes.get(comment.parentId);
      requireValue(parentId !== undefined && (parentId === null || comments[parentId - 1].parentId === null), 'Comment must reference a captured thread root.');
      const assessment = assessments[post.id + '|' + comment.id];
      return {
        id: index + 1, parentId, text: reviews[comment.textSha256].text,
        truncated: Array.from(comment.text.replace(/\r\n?/g, '\n').trim()).length > MAX_EXCERPT,
        gyurov: assessment ? assessment.gyurov ?? 'not-mentioned' : 'unreviewed',
        yotova: assessment ? assessment.yotova ?? 'not-mentioned' : 'unreviewed',
      };
    });
    const content = { version: 1, collectionSha256: expected.collectionSha256, postId: post.id, comments: rows };
    const file = hash(JSON.stringify(content) + '\n') + '.json';
    files.set(file, content);
    return { postId: post.id, file, count: rows.length };
  });
  return { manifest: { version: 1, collectionSha256: expected.collectionSha256, posts }, files };
}

function main() {
  const [rawFile, assessmentsFile, reviewsFile, requestedOutput, ...extra] = process.argv.slice(2);
  requireValue(rawFile && assessmentsFile && reviewsFile && !extra.length,
    'Usage: node scripts/build-facebook-comment-reader.js RAW.json ASSESSMENTS.json PRIVACY_REVIEWS.json [OUTPUT_DIRECTORY]');
  const dataDirectory = path.resolve(__dirname, '../public/data/facebook/2026');
  const outputDirectory = path.resolve(requestedOutput ?? path.join(dataDirectory, 'comments'));
  const inputs = [rawFile, assessmentsFile, reviewsFile, path.join(dataDirectory, 'report.json'), path.join(dataDirectory, 'comments.json')];
  requireValue(!inputs.some(file => path.resolve(file) === outputDirectory || path.resolve(file).startsWith(outputDirectory + path.sep)),
    'Output directory must not contain input files.');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const output = buildFacebookCommentReader(read(rawFile), read(assessmentsFile), read(reviewsFile),
    read(path.join(dataDirectory, 'report.json')), read(path.join(dataDirectory, 'comments.json')));
  const manifestFile = path.join(outputDirectory, 'manifest.json');
  const previous = fs.existsSync(manifestFile) ? read(manifestFile) : null;
  requireValue(previous === null || object(previous) && previous.version === 1 && Array.isArray(previous.posts)
    && previous.posts.every(post => object(post) && typeof post.file === 'string' && /^[a-f0-9]{64}\.json$/.test(post.file)),
  'Previous reader manifest contains invalid filenames.');
  fs.mkdirSync(outputDirectory, { recursive: true });
  // The manifest is replaced last so readers validate every file against its collection.
  for (const [file, value] of [...output.files, ['manifest.json', output.manifest]]) {
    const destination = path.join(outputDirectory, file);
    const temporary = destination + '.tmp-' + process.pid;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value) + '\n');
      fs.renameSync(temporary, destination);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  for (const post of previous?.posts ?? []) {
    if (!output.files.has(post.file)) fs.rmSync(path.join(outputDirectory, post.file), { force: true });
  }
  console.log('Wrote anonymous excerpts for ' + output.manifest.posts.length + ' posts.');
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildFacebookCommentReader, commentExcerpt, validatePrivacyReview };
