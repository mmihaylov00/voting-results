import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

const TOKEN = /^[a-f0-9]{64}$/;
const COMMENT_ID = /^\d{1,40}$/;
const COMMENT_BANDS = ['1', '2', '3-5', '6-10', '11-20', '21+'];
const PAGE_BANDS = ['1', '2', '3', '4+'];
const RESERVED_HANDLES = new Set(['profile.php', 'photo.php', 'story.php', 'watch', 'reel', 'posts', 'groups',
  'pages', 'marketplace', 'gaming', 'help', 'login', 'share', 'hashtag', 'search']);
const identity = value => typeof value === 'string' && (/^uid:[1-9]\d{0,39}$/.test(value)
  || /^handle:[a-z0-9](?:[a-z0-9.]{0,98}[a-z0-9])?$/.test(value) && !RESERVED_HANDLES.has(value.slice(7)));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, keys) => object(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const count = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512
  && !/[|\u0000-\u001f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function createParticipationState(runId, now = new Date().toISOString()) {
  requireValue(identifier(runId) && timestamp(now), 'Invalid participation collection header.');
  return { version: 1, runId, capturedAt: now, keyCheck: null, posts: {}, accounts: {}, observedComments: [], identifiedComments: [] };
}

/** Private state keeps neutral counts and separate dedup tokens, never authors, comment text or tone. */
export function validateParticipationState(value) {
  if (!fields(value, ['version', 'runId', 'capturedAt', 'keyCheck', 'posts', 'accounts', 'observedComments', 'identifiedComments'])
    || value.version !== 1 || !identifier(value.runId) || !timestamp(value.capturedAt)
    || !(value.keyCheck === null || typeof value.keyCheck === 'string' && TOKEN.test(value.keyCheck))
    || !object(value.posts) || !object(value.accounts)
    || !Array.isArray(value.observedComments) || !Array.isArray(value.identifiedComments)) return false;
  const observed = new Set(value.observedComments);
  const identified = new Set(value.identifiedComments);
  if (observed.size !== value.observedComments.length || identified.size !== value.identifiedComments.length
    || !value.observedComments.every(token => typeof token === 'string' && TOKEN.test(token))
    || !value.identifiedComments.every(token => typeof token === 'string' && TOKEN.test(token) && observed.has(token))) return false;
  let capturedTotal = 0;
  let matchedTotal = 0;
  const matchesByPost = new Map();
  for (const [postId, post] of Object.entries(value.posts)) {
    if (!identifier(postId) || !fields(post, ['pageId', 'capturedComments', 'topLevelComments', 'replyComments', 'matchedIdentityComments'])
      || !identifier(post.pageId)
      || !['capturedComments', 'topLevelComments', 'replyComments', 'matchedIdentityComments'].every(key => count(post[key]))
      || post.topLevelComments + post.replyComments !== post.capturedComments
      || post.matchedIdentityComments > post.capturedComments) return false;
    capturedTotal += post.capturedComments;
    matchedTotal += post.matchedIdentityComments;
    matchesByPost.set(postId, 0);
  }
  for (const [token, account] of Object.entries(value.accounts)) {
    if (!TOKEN.test(token) || !object(account) || !Object.keys(account).length) return false;
    for (const [postId, stats] of Object.entries(account)) {
      if (!Object.hasOwn(value.posts, postId) || !fields(stats, ['comments', 'topLevel', 'replies'])
        || !['comments', 'topLevel', 'replies'].every(key => count(stats[key])) || !stats.comments
        || stats.topLevel + stats.replies !== stats.comments) return false;
      matchesByPost.set(postId, matchesByPost.get(postId) + stats.comments);
    }
  }
  return capturedTotal === observed.size && matchedTotal === identified.size
    && (!observed.size || value.keyCheck !== null)
    && Object.entries(value.posts).every(([id, post]) => matchesByPost.get(id) === post.matchedIdentityComments);
}

export function loadParticipationState(value) {
  requireValue(validateParticipationState(value), 'Invalid saved participation state.');
  return structuredClone(value);
}

/** New catalog posts have no collected participation; existing observations and collection time stay intact. */
export function alignParticipationCohort(state, sources) {
  const next = loadParticipationState(state);
  requireValue(Array.isArray(sources), 'Invalid participation source cohort.');
  const posts = new Map();
  for (const source of sources) {
    requireValue(fields(source, ['id', 'pageId']) && identifier(source.id) && identifier(source.pageId)
      && !posts.has(source.id), 'Invalid or duplicate participation source.');
    posts.set(source.id, source);
  }
  for (const [postId, post] of Object.entries(next.posts)) {
    requireValue(posts.get(postId)?.pageId === post.pageId, 'Participation source was removed or changed Page.');
  }
  for (const source of posts.values()) {
    next.posts[source.id] ??= { pageId: source.pageId, capturedComments: 0,
      topLevelComments: 0, replyComments: 0, matchedIdentityComments: 0 };
  }
  return next;
}

/** Unknown authors can become matched later; known comments are counted only once. */
export function mergeParticipation(state, checkpoint, secret, now = new Date().toISOString()) {
  requireValue(validateParticipationState(state), 'Invalid participation state.');
  requireValue(ArrayBuffer.isView(secret) && secret.BYTES_PER_ELEMENT === 1 && secret.byteLength === 32,
    'A private 32-byte collection key is required.');
  const privateKey = Buffer.from(secret.buffer, secret.byteOffset, secret.byteLength);
  requireValue(timestamp(now) && fields(checkpoint, ['source', 'comments', 'authors'])
    && fields(checkpoint.source, ['id', 'pageId']) && identifier(checkpoint.source.id) && identifier(checkpoint.source.pageId)
    && Array.isArray(checkpoint.comments) && checkpoint.comments.length <= 10000
    && Array.isArray(checkpoint.authors) && checkpoint.authors.length <= 10000, 'Invalid participation checkpoint.');
  const comments = new Map();
  for (const comment of checkpoint.comments) {
    requireValue(fields(comment, ['id', 'parentId']) && typeof comment.id === 'string' && COMMENT_ID.test(comment.id)
      && (comment.parentId === null || typeof comment.parentId === 'string' && COMMENT_ID.test(comment.parentId)
        && comment.parentId !== comment.id), 'Invalid participation comment.');
    requireValue(!comments.has(comment.id) || comments.get(comment.id).parentId === comment.parentId,
      'Conflicting participation comment.');
    comments.set(comment.id, comment);
  }
  const authors = new Map();
  for (const author of checkpoint.authors) {
    requireValue(fields(author, ['commentId', 'identity']) && comments.has(author.commentId)
      && (author.identity === null || identity(author.identity)),
    'Invalid participation identity.');
    const previous = authors.get(author.commentId);
    requireValue(!previous || !author.identity || previous === author.identity, 'Conflicting participation identity.');
    if (author.identity || !authors.has(author.commentId)) authors.set(author.commentId, author.identity);
  }
  const next = structuredClone(state);
  const sign = (domain, value) => createHmac('sha256', privateKey).update(`${domain}\0${value}`, 'utf8').digest('hex');
  const keyCheck = sign('collection', state.runId);
  requireValue(next.keyCheck === null || next.keyCheck === keyCheck, 'Collection key changed; resume with the original private key.');
  next.keyCheck = keyCheck;
  const source = checkpoint.source;
  const post = next.posts[source.id] ??= { pageId: source.pageId, capturedComments: 0,
    topLevelComments: 0, replyComments: 0, matchedIdentityComments: 0 };
  requireValue(post.pageId === source.pageId, 'A post changed its source Page.');
  const observed = new Set(next.observedComments);
  const identified = new Set(next.identifiedComments);
  for (const comment of comments.values()) {
    const commentToken = sign('comment', `${source.id}|${comment.id}`);
    if (!observed.has(commentToken)) {
      observed.add(commentToken);
      post.capturedComments++;
      post[comment.parentId === null ? 'topLevelComments' : 'replyComments']++;
    }
    const identity = authors.get(comment.id);
    if (!identity || identified.has(commentToken)) continue;
    const accountToken = sign('account', identity);
    const account = next.accounts[accountToken] ??= {};
    const stats = account[source.id] ??= { comments: 0, topLevel: 0, replies: 0 };
    stats.comments++;
    stats[comment.parentId === null ? 'topLevel' : 'replies']++;
    post.matchedIdentityComments++;
    identified.add(commentToken);
  }
  next.observedComments = Array.from(observed);
  next.identifiedComments = Array.from(identified);
  next.capturedAt = now;
  return next;
}

/** Export aggregate participation only, suppressing every account cell smaller than five. */
export function participationExport(state, minimum = 5) {
  requireValue(validateParticipationState(state), 'Invalid participation state.');
  requireValue(Number.isSafeInteger(minimum) && minimum >= 5, 'Minimum account-cell size must be at least five.');
  const cell = value => value >= minimum ? value : null;
  const accountValues = Object.values(state.accounts);
  const postAccounts = new Map();
  const pageAccounts = new Map();
  const postStarters = new Map();
  const postRepeaters = new Map();
  const postPairs = new Map();
  const pagePairs = new Map();
  const activityCounts = new Map();
  const pageActivityCounts = new Map();
  let multiplePosts = 0;
  let multiplePages = 0;
  const increment = (map, id) => map.set(id, (map.get(id) ?? 0) + 1);
  const pairs = (values, map) => {
    const sorted = [...values].sort();
    for (let a = 0; a < sorted.length; a++) for (let b = a + 1; b < sorted.length; b++) {
      increment(map, JSON.stringify([sorted[a], sorted[b]]));
    }
  };
  for (const account of accountValues) {
    const posts = Object.keys(account);
    const pages = new Set(posts.map(id => state.posts[id].pageId));
    const comments = posts.reduce((sum, id) => sum + account[id].comments, 0);
    const commentBand = COMMENT_BANDS[[1, 2, 5, 10, 20, Infinity].findIndex(maximum => comments <= maximum)];
    const activityKey = JSON.stringify([commentBand, PAGE_BANDS[Math.min(pages.size, 4) - 1]]);
    increment(activityCounts, activityKey);
    for (const pageId of pages) {
      const counts = pageActivityCounts.get(pageId) ?? new Map();
      increment(counts, activityKey);
      pageActivityCounts.set(pageId, counts);
    }
    if (posts.length > 1) multiplePosts++;
    if (pages.size > 1) multiplePages++;
    for (const id of posts) {
      increment(postAccounts, id);
      if (account[id].topLevel) increment(postStarters, id);
      if (account[id].comments > 1) increment(postRepeaters, id);
    }
    for (const id of pages) increment(pageAccounts, id);
    pairs(posts, postPairs);
    pairs(pages, pagePairs);
  }
  const pageTotals = new Map();
  for (const post of Object.values(state.posts)) {
    const page = pageTotals.get(post.pageId) ?? { postCount: 0, capturedComments: 0, matchedIdentityComments: 0 };
    page.postCount++;
    page.capturedComments += post.capturedComments;
    page.matchedIdentityComments += post.matchedIdentityComments;
    pageTotals.set(post.pageId, page);
  }
  const overlaps = (map, leftName, rightName) => Array.from(map).filter(([, value]) => value >= minimum)
    .map(([pair, sharedAccounts]) => ({ [leftName]: JSON.parse(pair)[0], [rightName]: JSON.parse(pair)[1], sharedAccounts }));
  const activityCells = counts => COMMENT_BANDS.flatMap(commentBand => PAGE_BANDS.map(pageBand => ({
    commentBand, pageBand, accounts: cell(counts?.get(JSON.stringify([commentBand, pageBand])) ?? 0),
  })));
  return {
    version: 1, runId: state.runId, capturedAt: state.capturedAt, minimumCellCount: minimum, unit: 'observed-accounts',
    coverage: { capturedComments: state.observedComments.length, matchedIdentityComments: state.identifiedComments.length,
      unknownIdentityComments: state.observedComments.length - state.identifiedComments.length },
    totals: { accounts: cell(accountValues.length), accountsOnMultiplePosts: cell(multiplePosts), accountsOnMultiplePages: cell(multiplePages) },
    posts: Object.entries(state.posts).map(([postId, post]) => ({ postId, ...post,
      accounts: cell(postAccounts.get(postId) ?? 0), accountsStartingThreads: cell(postStarters.get(postId) ?? 0),
      accountsWithMultipleComments: cell(postRepeaters.get(postId) ?? 0) })),
    pages: Array.from(pageTotals, ([pageId, totals]) => ({ pageId, ...totals, accounts: cell(pageAccounts.get(pageId) ?? 0) })),
    postOverlaps: overlaps(postPairs, 'leftPostId', 'rightPostId'), pageOverlaps: overlaps(pagePairs, 'leftPageId', 'rightPageId'),
    activity: { cells: activityCells(activityCounts),
      pages: Array.from(pageTotals.keys(), pageId => ({ pageId, cells: activityCells(pageActivityCounts.get(pageId)) })) },
  };
}
