import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, realpath, rename, lstat, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createParticipationState, loadParticipationState, mergeParticipation, participationExport,
  validateParticipationState } from './lib/facebook-participation.mjs';

const require = createRequire(import.meta.url);
const { buildFacebookComments } = require('./build-facebook-comments.js');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && !!value.trim();
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requireValue(condition, message) { if (!condition) throw new Error(message); }

function sameIds(left, right) {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  return left.length === right.length && leftIds.size === left.length
    && rightIds.size === right.length && left.every(id => rightIds.has(id));
}

function completeCapture(capture) {
  if (capture.status !== 'complete') return;
  const comments = capture.comments;
  requireValue(!comments.length || capture.ordering !== null && capture.reportedCount === comments.length,
    'A complete populated thread needs a confirmed ordering and exact native counter.');
  requireValue(capture.reportedCount === null || capture.reportedCount === comments.length,
    'A complete thread has a contradictory native counter.');
  const ids = new Set(comments.map(comment => comment.id));
  requireValue(comments.every(comment => comment.textComplete && (comment.parentId === null || ids.has(comment.parentId))),
    'A complete thread contains truncated text or an uncaptured parent.');
}

/** Merge disjoint, finished private queues without publishing or modifying their inputs. */
export function mergeFacebookCommentRuns({ sourceText, metadata, secret, shards }) {
  requireValue(typeof sourceText === 'string' && object(metadata) && identifier(metadata.runId)
    && /^[a-f0-9]{64}$/.test(metadata.sourceReportSha256 ?? '')
    && sha256(sourceText) === metadata.sourceReportSha256, 'The frozen source report hash does not match run metadata.');
  requireValue(ArrayBuffer.isView(secret) && secret.BYTES_PER_ELEMENT === 1 && secret.byteLength === 32,
    'A private 32-byte collection key is required.');
  const source = JSON.parse(sourceText);
  requireValue(Array.isArray(source?.posts) && source.posts.length > 0 && Array.isArray(shards) && shards.length > 0,
    'Missing source posts or collection shards.');
  const sources = new Map(source.posts.map(post => [post.id, post]));
  requireValue(sources.size === source.posts.length, 'Duplicate source post IDs.');
  const queueIds = new Set();
  const shardNames = new Set();
  const capturesById = new Map();
  const captureTimes = [];
  for (const shard of shards) {
    requireValue(object(shard) && identifier(shard.name) && !shardNames.has(shard.name)
      && object(shard.queue) && shard.queue.runId === metadata.runId && Array.isArray(shard.queue.postIds)
      && object(shard.progress) && Array.isArray(shard.progress.donePostIds)
      && shard.progress.totalPosts === shard.queue.postIds.length
      && sameIds(shard.queue.postIds, shard.progress.donePostIds), 'A collection queue is incomplete, duplicated or from a different run.');
    shardNames.add(shard.name);
    requireValue(object(shard.captures) && timestamp(shard.captures.capturedAt) && Array.isArray(shard.captures.posts)
      && sameIds(shard.queue.postIds, shard.captures.posts.map(post => post.postId)), 'Captured posts do not match their assigned queue.');
    buildFacebookComments(shard.captures, {}, source);
    const qaRows = shard.qa?.posts ?? [];
    requireValue(Array.isArray(qaRows) && new Set(qaRows.map(post => post.postId)).size === qaRows.length,
      'Invalid or duplicated private traversal proof.');
    const qaById = new Map(qaRows.map(post => [post.postId, post]));
    for (const proof of qaRows.filter(post => post.emptyViewConflictVerified === true)) {
      const capture = shard.captures.posts.find(post => post.postId === proof.postId);
      requireValue(capture && capture.status === 'partial' && capture.comments.length === 0
        && Number.isSafeInteger(capture.reportedCount) && capture.reportedCount > 0
        && proof.captured === 0 && proof.reported === capture.reportedCount && proof.reviewComplete === true
        && proof.emptyThreadVerified !== true && proof.unavailableVerified !== true
        && proof.allTerminal !== true && proof.newestTerminal !== true && !proof.orderProof,
      'A verified empty-view conflict requires partial zero capture, a positive native counter and distinct explicit proof.');
    }
    captureTimes.push(shard.captures.capturedAt);
    for (const capture of shard.captures.posts) {
      requireValue(sources.has(capture.postId) && !queueIds.has(capture.postId), 'Source queues overlap or contain an unknown post.');
      requireValue(new Set(capture.comments.map(comment => comment.id)).size === capture.comments.length,
        'A capture contains duplicate native comment IDs.');
      for (const comment of capture.comments) {
        const expected = new URL(capture.postUrl);
        expected.searchParams.set('comment_id', comment.parentId ?? comment.id);
        if (comment.parentId) expected.searchParams.set('reply_comment_id', comment.id);
        requireValue(comment.url === expected.href, 'Comment links must stay on the frozen source post, not an author profile.');
      }
      completeCapture(capture);
      if (capture.status === 'partial' && capture.comments.length === 0 && capture.reportedCount > 0
        && capture.ordering === null) {
        requireValue(qaById.get(capture.postId)?.emptyViewConflictVerified === true,
          'A positive-counter empty capture without ordering requires verified empty-view conflict proof.');
      }
      queueIds.add(capture.postId);
      capturesById.set(capture.postId, structuredClone(capture));
    }
  }
  requireValue(queueIds.size === sources.size && source.posts.every(post => queueIds.has(post.id)),
    'The queue union does not cover every frozen source post.');
  const capturedAt = new Date(Math.max(...captureTimes.map(value => Date.parse(value)))).toISOString();
  const captures = { version: 1, capturedAt, posts: source.posts.map(post => capturesById.get(post.id)) };
  const aggregate = buildFacebookComments(captures, {}, source);
  const participation = createParticipationState(metadata.runId, capturedAt);
  const normalizedKey = Buffer.from(secret.buffer, secret.byteOffset, secret.byteLength);
  const keyCheck = createHmac('sha256', normalizedKey).update(`collection\0${metadata.runId}`, 'utf8').digest('hex');
  participation.keyCheck = keyCheck;
  const observed = new Set();
  const identified = new Set();
  const shardSummaries = [];
  for (const shard of shards) {
    let state = shard.participation === null || shard.participation === undefined
      ? createParticipationState(metadata.runId, capturedAt) : loadParticipationState(shard.participation);
    requireValue(state.runId === metadata.runId && (state.keyCheck === null || state.keyCheck === keyCheck),
      'Participation state belongs to a different run or collection key.');
    requireValue(Object.keys(state.posts).every(id => shard.queue.postIds.includes(id)),
      'Participation state includes another queue\'s posts.');
    for (const capture of shard.captures.posts) {
      const post = sources.get(capture.postId);
      state = mergeParticipation(state, { source: { id: post.id, pageId: post.pageId },
        comments: capture.comments.map(comment => ({ id: comment.id, parentId: comment.parentId })), authors: [] }, secret, capturedAt);
      const stats = state.posts[post.id];
      requireValue(stats.capturedComments === capture.comments.length
        && stats.topLevelComments === capture.comments.filter(comment => comment.parentId === null).length,
      'Participation counts do not match captured comments.');
    }
    for (const [postId, stats] of Object.entries(state.posts)) participation.posts[postId] = stats;
    for (const [account, posts] of Object.entries(state.accounts)) {
      const target = participation.accounts[account] ??= {};
      for (const [postId, stats] of Object.entries(posts)) {
        requireValue(!Object.hasOwn(target, postId), 'An account contains duplicate post counts across queues.');
        target[postId] = stats;
      }
    }
    for (const token of state.observedComments) {
      requireValue(!observed.has(token), 'Comment deduplication tokens overlap across queues.');
      observed.add(token);
    }
    for (const token of state.identifiedComments) {
      requireValue(!identified.has(token), 'Identified comment tokens overlap across queues.');
      identified.add(token);
    }
    shardSummaries.push({ name: shard.name, posts: shard.queue.postIds.length,
      capturedComments: state.observedComments.length, matchedIdentityComments: state.identifiedComments.length });
  }
  participation.observedComments = [...observed];
  participation.identifiedComments = [...identified];
  requireValue(validateParticipationState(participation), 'Merged participation state is inconsistent.');
  const report = { ...participationExport(participation), collectionSha256: aggregate.collectionSha256 };
  requireValue(report.coverage.capturedComments === aggregate.posts.reduce((sum, post) => sum + post.capturedCount, 0),
    'Merged participation coverage differs from the captured snapshot.');
  const summary = { version: 1, runId: metadata.runId, capturedAt, sourceReportSha256: metadata.sourceReportSha256,
    collectionSha256: aggregate.collectionSha256, reviewedPosts: captures.posts.length,
    capturedComments: report.coverage.capturedComments, matchedIdentityComments: report.coverage.matchedIdentityComments,
    unknownIdentityComments: report.coverage.unknownIdentityComments,
    completePosts: captures.posts.filter(post => post.status === 'complete').length,
    partialPosts: captures.posts.filter(post => post.status === 'partial').length,
    unavailablePosts: captures.posts.filter(post => post.status === 'unavailable').length,
    emptyViewConflictPosts: shards.reduce((sum, shard) => sum
      + (shard.qa?.posts ?? []).filter(post => post.emptyViewConflictVerified === true).length, 0),
    truncatedComments: captures.posts.reduce((sum, post) => sum + post.comments.filter(comment => !comment.textComplete).length, 0),
    unresolvedParentComments: captures.posts.reduce((sum, post) => {
      const ids = new Set(post.comments.map(comment => comment.id));
      return sum + post.comments.filter(comment => comment.parentId !== null && !ids.has(comment.parentId)).length;
    }, 0), shards: shardSummaries };
  return { captures, participationState: participation, participation: report, summary };
}

function inside(base, candidate) {
  const path = relative(base, candidate);
  return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

async function atomicJson(path, value) {
  const temporary = `${path}.next-${process.pid}`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export async function mergePrivateCommentRun(directory) {
  const root = await realpath(resolve(directory));
  requireValue(!inside(projectRoot, root), 'Private collection directories must stay outside the repository.');
  const output = join(root, 'merged');
  try { requireValue(!(await lstat(output)).isSymbolicLink(), 'Merged output must not be a symlink.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const json = async path => JSON.parse(await readFile(path, 'utf8'));
  const shards = [];
  const names = ['root', 'worker-a', 'worker-b'];
  try {
    await lstat(join(root, 'worker-c'));
    names.push('worker-c');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of names) {
    const path = name === 'root' ? root : join(root, name);
    const entry = await lstat(path);
    requireValue(entry.isDirectory() && !entry.isSymbolicLink(), 'Collection shards must be real private directories.');
    shards.push({ name, queue: await json(join(path, 'queue.json')), captures: await json(join(path, 'captures.json')),
      participation: await optionalJson(join(path, 'participation-state.json')), progress: await json(join(path, 'completion-progress.json')),
      qa: await optionalJson(join(path, 'traversal-qa.json')) });
  }
  const result = mergeFacebookCommentRuns({ sourceText: await readFile(join(root, 'source-report.json'), 'utf8'),
    metadata: await json(join(root, 'run-meta.json')), secret: await readFile(join(root, 'participation-key.bin')), shards });
  await mkdir(output, { recursive: true, mode: 0o700 });
  await atomicJson(join(output, 'captures.json'), result.captures);
  await atomicJson(join(output, 'participation-state.json'), result.participationState);
  await atomicJson(join(output, 'participation.json'), result.participation);
  await atomicJson(join(output, 'merge-summary.json'), result.summary);
  return result.summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length === 3, 'Usage: node scripts/merge-facebook-comment-runs.mjs PRIVATE_RUN_ROOT');
    console.log(JSON.stringify(await mergePrivateCommentRun(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
