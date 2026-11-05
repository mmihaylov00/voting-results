import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_BYTES = 128 * 1024;
const MAX_CHANGES = 100;
const STORE_NAME = 'facebook-tone-suggestions';
const TONES = ['supportive', 'critical', 'mixed', 'neutral', 'unclear', 'not-mentioned', 'unreviewed'];
const DRAFT_FIELDS = ['key', 'kind', 'postId', 'commentId', 'sourceSha256', 'collectionSha256',
  'originalGyurov', 'originalYotova', 'gyurov', 'yotova'];
const SOURCE_FIELDS = DRAFT_FIELDS.slice(0, 8);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const tone = value => TONES.includes(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, keys) => object(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const keyFor = (kind, postId, commentId) => kind === 'post' ? `post:${postId}` : `comment:${postId}:${commentId}`;

class InvalidSuggestions extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

/** Only the deployment's bundled public snapshots establish editable records. */
export function loadToneReviewCatalog(directory = resolve(process.cwd(), 'public/data/facebook/2026')) {
  const read = file => JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
  const report = read('report.json');
  const manifest = read('comments/manifest.json');
  if (!object(report) || report.version !== 1 || !hash(report.collectionSha256) || !Array.isArray(report.posts)
    || !object(manifest) || manifest.version !== 1 || !hash(manifest.collectionSha256)
    || !Array.isArray(manifest.posts) || manifest.posts.length !== report.posts.length) throw new Error('Invalid source catalog');
  const catalog = new Map();
  const posts = new Set();
  for (const post of report.posts) {
    if (!object(post) || typeof post.id !== 'string' || !post.id || posts.has(post.id)
      || !hash(post.sourceTextSha256) || post.stance !== undefined && (!object(post.stance)
        || ![post.stance.gyurov, post.stance.yotova].every(value => value === null || tone(value)))) {
      throw new Error('Invalid source post');
    }
    posts.add(post.id);
    const key = keyFor('post', post.id, null);
    catalog.set(key, {
      key, kind: 'post', postId: post.id, commentId: null,
      sourceSha256: post.sourceTextSha256, collectionSha256: report.collectionSha256,
      originalGyurov: post.stance ? post.stance.gyurov ?? 'not-mentioned' : 'unreviewed',
      originalYotova: post.stance ? post.stance.yotova ?? 'not-mentioned' : 'unreviewed', editable: true,
    });
  }
  for (const entry of manifest.posts) {
    if (!object(entry) || !posts.delete(entry.postId) || typeof entry.file !== 'string'
      || !/^[a-f0-9]{64}\.json$/.test(entry.file) || !Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new Error('Invalid comment manifest');
    }
    const bytes = readFileSync(resolve(directory, 'comments', entry.file));
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    if (sourceSha256 + '.json' !== entry.file) throw new Error('Comment content hash mismatch');
    const report = JSON.parse(bytes.toString('utf8'));
    if (!object(report) || report.version !== 1 || report.collectionSha256 !== manifest.collectionSha256
      || report.postId !== entry.postId || !Array.isArray(report.comments) || report.comments.length !== entry.count) {
      throw new Error('Invalid comment snapshot');
    }
    report.comments.forEach((comment, index) => {
      if (!object(comment) || comment.id !== index + 1 || !tone(comment.gyurov) || !tone(comment.yotova)
        || !(comment.text === null || typeof comment.text === 'string' && comment.text.trim())) {
        throw new Error('Invalid source comment');
      }
      const key = keyFor('comment', entry.postId, comment.id);
      catalog.set(key, {
        key, kind: 'comment', postId: entry.postId, commentId: comment.id, sourceSha256,
        collectionSha256: report.collectionSha256, originalGyurov: comment.gyurov,
        originalYotova: comment.yotova, editable: comment.text !== null,
      });
    });
  }
  if (posts.size) throw new Error('Missing comment snapshot');
  return catalog;
}

export function parseToneSuggestions(value, catalog) {
  if (!fields(value, ['version', 'batchId', 'changes']) || value.version !== 1
    || typeof value.batchId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.batchId)
    || !Array.isArray(value.changes) || !value.changes.length || value.changes.length > MAX_CHANGES) {
    throw new InvalidSuggestions(400, 'invalid-suggestions');
  }
  const keys = new Set();
  const changes = value.changes.map(change => {
    if (!fields(change, DRAFT_FIELDS) || typeof change.key !== 'string' || keys.has(change.key)
      || !tone(change.gyurov) || !tone(change.yotova)
      || change.gyurov === change.originalGyurov && change.yotova === change.originalYotova) {
      throw new InvalidSuggestions(400, 'invalid-suggestions');
    }
    const source = catalog.get(change.key);
    if (!source?.editable || !SOURCE_FIELDS.every(field => change[field] === source[field])) {
      throw new InvalidSuggestions(409, 'outdated-source');
    }
    keys.add(change.key);
    return Object.fromEntries(DRAFT_FIELDS.map(field => [field, change[field]]));
  }).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return { version: 1, batchId: value.batchId, changes };
}

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex,nofollow,noarchive', ...headers } });
}

/** The store factory is injected so validation and failed writes can be tested without credentials. */
export function createToneSuggestionsHandler({ getStore, loadCatalog = loadToneReviewCatalog,
  now = () => new Date().toISOString() }) {
  let catalog;
  return async request => {
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, { Allow: 'POST' });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'invalid-origin' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'json-required' }, 415);
    }
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
      return json({ error: 'payload-too-large' }, 413);
    }
    let value;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return json({ error: 'payload-too-large' }, 413);
      value = JSON.parse(text);
    } catch { return json({ error: 'invalid-json' }, 400); }
    try {
      catalog ??= loadCatalog();
      const batch = parseToneSuggestions(value, catalog);
      const store = getStore({ name: STORE_NAME, consistency: 'strong' });
      const result = await store.setJSON(batch.batchId, { ...batch, receivedAt: now() }, { onlyIfNew: true });
      if (result?.modified === false) {
        const existing = await store.get(batch.batchId, { type: 'json', consistency: 'strong' });
        if (!existing) throw new Error('Stored submission unavailable');
        if (existing.version !== 1 || existing.batchId !== batch.batchId
          || JSON.stringify(existing.changes) !== JSON.stringify(batch.changes)) {
          return json({ error: 'batch-conflict' }, 409);
        }
      } else if (result?.modified !== true) throw new Error('Submission was not stored');
      return json({ version: 1, batchId: batch.batchId, accepted: batch.changes.length }, result.modified ? 201 : 200);
    } catch (error) {
      if (error instanceof InvalidSuggestions) return json({ error: error.message }, error.status);
      console.error({ event: 'facebook-tone-suggestion-unavailable' });
      return json({ error: 'submission-unavailable' }, 503);
    }
  };
}
