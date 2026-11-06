const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const modules = Promise.all([import('./merge-facebook-comment-runs.mjs'), import('./lib/facebook-participation.mjs')]);
const sha256 = text => createHash('sha256').update(text).digest('hex');
const runId = 'fresh-run';
const time = '2026-11-05T12:00:00.000Z';
const secret = Buffer.alloc(32, 7);
const source = { posts: [1, 2, 3].map(index => ({ id: `p${index}`, pageId: `page-${index}`,
  url: `https://www.facebook.com/page-${index}/posts/${index}/` })) };

function traversalProof(capture) {
  const proof = { postId: capture.postId, captured: capture.comments.length, reported: capture.reportedCount,
    checkedAt: capture.checkedAt, actualEndingOrdering: capture.ordering, needsOrderRecheck: false, reviewComplete: true };
  if (capture.status === 'unavailable') return { ...proof, unavailableVerified: true };
  if (capture.status === 'complete' && !capture.comments.length && capture.ordering === null)
    return { ...proof, emptyThreadVerified: true };
  const evidence = { label: 'All comments', checkedAt: capture.checkedAt,
    reportedCount: capture.reportedCount, captured: capture.comments.length };
  proof.allTerminal = true;
  proof.orderProof = { all: evidence };
  if (capture.ordering === 'newest') {
    proof.newestTerminal = true;
    proof.orderProof.newest = { ...evidence, label: 'Newest' };
  }
  return proof;
}

async function fixture() {
  const [, { createParticipationState, mergeParticipation }] = await modules;
  const sourceText = JSON.stringify(source, null, 2) + '\n';
  const metadata = { version: 1, runId, sourceReportSha256: sha256(sourceText) };
  const shards = [1, 0, 2].map((sourceIndex, index) => {
    const post = source.posts[sourceIndex];
    const comments = index === 2 ? [] : Array.from({ length: 5 }, (_, commentIndex) => {
      const id = String(10000 + sourceIndex * 100 + commentIndex);
      const text = `Comment ${commentIndex}`;
      return { id, parentId: null, url: `${post.url}?comment_id=${id}`, text, textComplete: true,
        publishedAtRaw: '1d', capturedAt: time, textSha256: sha256(text) };
    });
    const captures = { version: 1, capturedAt: time, posts: [{ postId: post.id, postUrl: post.url,
      checkedAt: time, status: index === 2 ? 'unavailable' : 'complete', ordering: index === 2 ? null : 'all',
      reportedCount: index === 2 ? null : comments.length, notes: [], comments }] };
    const participation = index === 2 ? null : mergeParticipation(createParticipationState(runId, time), {
      source: { id: post.id, pageId: post.pageId }, comments: comments.map(comment => ({ id: comment.id, parentId: comment.parentId })),
      authors: comments.map((comment, actor) => ({ commentId: comment.id, identity: `uid:${20000 + actor}` })),
    }, secret, time);
    return { name: ['root', 'worker-a', 'worker-b'][index], queue: { runId, postIds: [post.id] }, captures,
      participation, progress: { donePostIds: [post.id], totalPosts: 1 },
      qa: { posts: [traversalProof(captures.posts[0])] } };
  });
  return { sourceText, metadata, secret, shards };
}

test('merges disjoint sources in frozen order and combines neutral account overlap', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture();
  const before = JSON.stringify(input);
  const result = mergeFacebookCommentRuns(input);
  assert.deepEqual(result.captures.posts.map(post => post.postId), ['p1', 'p2', 'p3']);
  assert.deepEqual(result.participation.totals, { accounts: 5, accountsOnMultiplePosts: 5, accountsOnMultiplePages: 5 });
  assert.deepEqual(result.participation.pageOverlaps, [{ leftPageId: 'page-1', rightPageId: 'page-2', sharedAccounts: 5 }]);
  assert.equal(result.summary.reviewedPosts, 3);
  assert.equal(result.summary.capturedComments, 10);
  assert.equal(result.summary.unavailablePosts, 1);
  assert.equal(result.participationState.posts.p3.capturedComments, 0);
  assert.equal(result.participation.posts.find(post => post.postId === 'p3').accounts, null);
  assert.equal(JSON.stringify(input), before, 'merge must not mutate checkpoint inputs');
});

test('binds the public export to the merged capture hash and excludes private identities', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const { captures, participation, summary, participationState } = mergeFacebookCommentRuns(await fixture());
  assert.equal(participation.collectionSha256, sha256(JSON.stringify(captures)));
  assert.equal(summary.collectionSha256, participation.collectionSha256);
  const exported = JSON.stringify(participation);
  for (const token of Object.keys(participationState.accounts)) assert.ok(!exported.includes(token));
  for (const forbidden of ['keyCheck', 'observedComments', 'identifiedComments', 'uid:20000', 'Comment 0', '10000']) {
    assert.ok(!exported.includes(forbidden), `public export contains ${forbidden}`);
  }
  assert.ok(!JSON.stringify(summary).includes('keyCheck'));
});

test('repairs missing identity checkpoints as unknown coverage without inventing authors', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture();
  input.shards[1].participation = null;
  const result = mergeFacebookCommentRuns(input);
  assert.equal(result.summary.capturedComments, 10);
  assert.equal(result.summary.matchedIdentityComments, 5);
  assert.equal(result.summary.unknownIdentityComments, 5);
  assert.equal(result.participation.totals.accountsOnMultiplePosts, null);
  assert.deepEqual(result.participation.pageOverlaps, []);
});

test('initializes a reviewed literal-empty post and preserves reviewed partial coverage', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture();
  const empty = input.shards[2].captures.posts[0];
  empty.status = 'complete';
  input.shards[2].qa.posts = [traversalProof(empty)];
  const partial = input.shards[0].captures.posts[0];
  partial.status = 'partial'; partial.reportedCount = 6; partial.ordering = 'newest';
  input.shards[0].qa.posts = [traversalProof(partial)];
  input.shards[0].qa.posts[0].orderProof.all.captured = 4;
  input.shards[0].qa.posts[0].orderProof.newest.reportedCount = null;
  const result = mergeFacebookCommentRuns(input);
  assert.equal(result.summary.completePosts, 2);
  assert.equal(result.summary.partialPosts, 1);
  assert.equal(result.captures.posts.find(post => post.postId === partial.postId).status, 'partial');
  assert.equal(result.participation.posts.length, 3);
  assert.equal(result.participation.pages.length, 3);
});

test('rejects missing, unfinished or stale traversal proof despite completed progress', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const missing = await fixture(); delete missing.shards[0].qa;
  assert.throws(() => mergeFacebookCommentRuns(missing), /Traversal proof/);
  for (const patch of [{ reviewComplete: false }, { needsOrderRecheck: true }, { captured: 4 },
    { reported: 6 }, { checkedAt: '2026-11-05T11:59:59.000Z' }, { actualEndingOrdering: 'newest' }]) {
    const input = await fixture(); Object.assign(input.shards[0].qa.posts[0], patch);
    assert.throws(() => mergeFacebookCommentRuns(input), /Traversal proof/);
  }
  const unproven = await fixture(); delete unproven.shards[0].qa.posts[0].orderProof;
  assert.throws(() => mergeFacebookCommentRuns(unproven), /All-comments terminal/);
});

test('partial gaps need both current All-comments and Newest terminal ordering evidence', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture();
  const shard = input.shards[0], capture = shard.captures.posts[0];
  capture.status = 'partial'; capture.reportedCount = 6; capture.ordering = 'newest';
  shard.qa.posts = [traversalProof(capture)];
  const mutations = [proof => { delete proof.allTerminal; }, proof => { delete proof.newestTerminal; },
    proof => { delete proof.orderProof.newest; }, proof => { proof.orderProof.all.label = 'Most relevant'; },
    proof => { proof.orderProof.newest.label = 'All comments'; }, proof => { proof.orderProof.newest.captured = 4; },
    proof => { proof.orderProof.newest.reportedCount = 7; },
    proof => { proof.orderProof.newest.checkedAt = '2026-11-05T11:59:59.000Z'; }];
  for (const mutate of mutations) {
    const invalid = structuredClone(input); mutate(invalid.shards[0].qa.posts[0]);
    assert.throws(() => mergeFacebookCommentRuns(invalid), /proof/);
  }
  assert.equal(mergeFacebookCommentRuns(input).summary.partialPosts, 1);
  capture.status = 'complete'; capture.reportedCount = capture.comments.length;
  shard.qa.posts = [traversalProof(capture)]; shard.qa.posts[0].orderProof.all.captured = 4;
  assert.equal(mergeFacebookCommentRuns(input).summary.completePosts, 2);
});

test('literal-empty and unavailable threads require their matching explicit proof', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture(), shard = input.shards[2], capture = shard.captures.posts[0];
  delete shard.qa.posts[0].unavailableVerified;
  assert.throws(() => mergeFacebookCommentRuns(input), /explicit unavailability proof/);
  capture.status = 'complete'; shard.qa.posts = [traversalProof(capture)];
  delete shard.qa.posts[0].emptyThreadVerified;
  assert.throws(() => mergeFacebookCommentRuns(input), /explicit empty-thread proof/);
});

test('an ordered zero capture requires a zero native counter and normal All-comments proof', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture(), shard = input.shards[2], capture = shard.captures.posts[0];
  capture.status = 'complete'; capture.ordering = 'all'; capture.reportedCount = 0;
  shard.qa.posts = [traversalProof(capture)];
  assert.equal(mergeFacebookCommentRuns(input).summary.completePosts, 3);
  assert.equal(shard.qa.posts[0].emptyThreadVerified, undefined);
  const unproven = structuredClone(input); delete unproven.shards[2].qa.posts[0].allTerminal;
  assert.throws(() => mergeFacebookCommentRuns(unproven), /All-comments terminal/);
  capture.reportedCount = null; shard.qa.posts = [traversalProof(capture)];
  assert.throws(() => mergeFacebookCommentRuns(input), /zero native counter/);
});

test('verified positive-counter empty views remain partial and require distinct private proof', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const input = await fixture();
  const shard = input.shards[2];
  const capture = shard.captures.posts[0];
  capture.status = 'partial';
  capture.reportedCount = 1;
  const proof = { postId: capture.postId, emptyViewConflictVerified: true, emptyThreadVerified: false,
    unavailableVerified: false, reviewComplete: true, captured: 0, reported: 1,
    checkedAt: capture.checkedAt, actualEndingOrdering: null };
  shard.qa = { posts: [proof] };
  const result = mergeFacebookCommentRuns(input);
  assert.equal(result.summary.emptyViewConflictPosts, 1);
  assert.equal(result.summary.partialPosts, 1);
  assert.equal(result.summary.unavailablePosts, 0);
  assert.equal(result.captures.posts.find(post => post.postId === capture.postId).reportedCount, 1);
  delete shard.qa;
  assert.throws(() => mergeFacebookCommentRuns(input), /requires verified empty-view conflict proof/);
  shard.qa = { posts: [{ ...proof, allTerminal: true }] };
  assert.throws(() => mergeFacebookCommentRuns(input), /distinct explicit proof/);
  shard.qa = { posts: [{ ...proof, reported: 2 }] };
  assert.throws(() => mergeFacebookCommentRuns(input), /distinct explicit proof/);
  shard.qa = { posts: [{ ...proof, emptyThreadVerified: true }] };
  assert.throws(() => mergeFacebookCommentRuns(input), /distinct explicit proof/);
  shard.qa = { posts: [proof] };
  for (const patch of [{ status: 'complete' }, { reportedCount: 0 }, { comments: [
    { id: '12345', parentId: null, url: `${capture.postUrl}?comment_id=12345`, text: 'Captured', textComplete: true,
      publishedAtRaw: '1d', capturedAt: time, textSha256: sha256('Captured') },
  ] }]) {
    const invalid = structuredClone(input);
    Object.assign(invalid.shards[2].captures.posts[0], patch);
    assert.throws(() => mergeFacebookCommentRuns(invalid), /distinct explicit proof/);
  }
});

test('rejects unfinished queues, duplicate assignment and a missing source post', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const unfinished = await fixture(); unfinished.shards[0].progress.donePostIds = [];
  assert.throws(() => mergeFacebookCommentRuns(unfinished), /incomplete/);
  const duplicate = await fixture(); duplicate.shards[1] = structuredClone(duplicate.shards[0]); duplicate.shards[1].name = 'worker-a';
  assert.throws(() => mergeFacebookCommentRuns(duplicate), /overlap/);
  const missing = await fixture(); missing.shards.pop();
  assert.throws(() => mergeFacebookCommentRuns(missing), /cover every/);
  const repeatedId = await fixture(); repeatedId.shards[0].queue.postIds.push(repeatedId.shards[0].queue.postIds[0]);
  assert.throws(() => mergeFacebookCommentRuns(repeatedId), /incomplete/);
});

test('rejects different source revisions, run identifiers and HMAC keys', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const sourceMismatch = await fixture(); sourceMismatch.sourceText += ' ';
  assert.throws(() => mergeFacebookCommentRuns(sourceMismatch), /source report hash/);
  const runMismatch = await fixture(); runMismatch.shards[1].participation.runId = 'another-run';
  assert.throws(() => mergeFacebookCommentRuns(runMismatch), /different run/);
  const keyMismatch = await fixture(); keyMismatch.secret = Buffer.alloc(32, 8);
  assert.throws(() => mergeFacebookCommentRuns(keyMismatch), /collection key/);
});

test('rejects conflicting captures, unsupported author fields and invalid complete claims', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const author = await fixture(); author.shards[0].captures.posts[0].comments[0].author = 'private';
  assert.throws(() => mergeFacebookCommentRuns(author), /unsupported field/);
  const duplicate = await fixture(); duplicate.shards[0].captures.posts[0].comments.push({ ...duplicate.shards[0].captures.posts[0].comments[0] });
  assert.throws(() => mergeFacebookCommentRuns(duplicate), /duplicate native/);
  const truncated = await fixture(); truncated.shards[0].captures.posts[0].comments[0].textComplete = false;
  assert.throws(() => mergeFacebookCommentRuns(truncated), /truncated/);
  const counter = await fixture(); counter.shards[0].captures.posts[0].reportedCount++;
  assert.throws(() => mergeFacebookCommentRuns(counter), /exact native counter/);
  const profileLink = await fixture(); const profileComment = profileLink.shards[0].captures.posts[0].comments[0];
  profileComment.url = `https://www.facebook.com/private-profile?comment_id=${profileComment.id}`;
  assert.throws(() => mergeFacebookCommentRuns(profileLink), /not an author profile/);
  const parent = await fixture(); const capture = parent.shards[0].captures.posts[0]; const reply = capture.comments[1];
  reply.parentId = '99999'; reply.url = `${capture.postUrl}?comment_id=99999&reply_comment_id=${reply.id}`;
  assert.throws(() => mergeFacebookCommentRuns(parent), /uncaptured parent/);
});

test('rejects participation with foreign queue membership or extra personal fields', async () => {
  const [{ mergeFacebookCommentRuns }] = await modules;
  const foreign = await fixture(); foreign.shards[0].participation.posts.p1 = { ...foreign.shards[0].participation.posts.p2 };
  assert.throws(() => mergeFacebookCommentRuns(foreign), /Invalid saved participation state/);
  const personal = await fixture(); personal.shards[0].participation.authorNames = ['private'];
  assert.throws(() => mergeFacebookCommentRuns(personal), /Invalid saved participation state/);
});

async function writeRun(directory, input) {
  await fs.writeFile(path.join(directory, 'source-report.json'), input.sourceText);
  await fs.writeFile(path.join(directory, 'run-meta.json'), JSON.stringify(input.metadata));
  await fs.writeFile(path.join(directory, 'participation-key.bin'), input.secret);
  for (const shard of input.shards) {
    const target = shard.name === 'root' ? directory : path.join(directory, shard.name);
    await fs.mkdir(target, { recursive: true });
    for (const [file, data] of [['queue.json', shard.queue], ['captures.json', shard.captures],
      ['completion-progress.json', shard.progress]]) await fs.writeFile(path.join(target, file), JSON.stringify(data));
    if (shard.participation) await fs.writeFile(path.join(target, 'participation-state.json'), JSON.stringify(shard.participation));
    if (shard.qa) await fs.writeFile(path.join(target, 'traversal-qa.json'), JSON.stringify(shard.qa));
  }
}

test('private CLI writes only merged outputs atomically and preserves all input snapshots', async () => {
  const [{ mergePrivateCommentRun }] = await modules;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'facebook-comment-merge-'));
  try {
    await writeRun(directory, await fixture());
    const before = await fs.readFile(path.join(directory, 'captures.json'), 'utf8');
    const summary = await mergePrivateCommentRun(directory);
    const output = path.join(directory, 'merged');
    assert.deepEqual((await fs.readdir(output)).sort(), ['captures.json', 'merge-summary.json', 'participation-state.json', 'participation.json']);
    assert.equal(await fs.readFile(path.join(directory, 'captures.json'), 'utf8'), before);
    assert.equal(summary.capturedComments, 10);
    assert.equal((await fs.stat(path.join(output, 'participation-state.json'))).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await fs.readFile(path.join(output, 'participation.json'), 'utf8')).collectionSha256, summary.collectionSha256);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('private CLI discovers a fourth worker while preserving exact source coverage', async () => {
  const [{ mergePrivateCommentRun }] = await modules;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'facebook-comment-merge-four-'));
  try {
    const input = await fixture();
    const fourthSource = { id: 'p4', pageId: 'page-4', url: 'https://www.facebook.com/page-4/posts/4/' };
    input.sourceText = JSON.stringify({ posts: [...source.posts, fourthSource] });
    input.metadata.sourceReportSha256 = sha256(input.sourceText);
    const fourth = structuredClone(input.shards[2]);
    fourth.name = 'worker-c';
    fourth.queue.postIds = ['p4'];
    fourth.progress.donePostIds = ['p4'];
    fourth.captures.posts[0].postId = 'p4';
    fourth.captures.posts[0].postUrl = fourthSource.url;
    fourth.qa.posts[0].postId = 'p4';
    input.shards.push(fourth);
    await writeRun(directory, input);
    const result = await mergePrivateCommentRun(directory);
    assert.equal(result.reviewedPosts, 4);
    assert.deepEqual(result.shards.map(shard => shard.name), ['root', 'worker-a', 'worker-b', 'worker-c']);
    await fs.rm(path.join(directory, 'worker-c'), { recursive: true });
    await assert.rejects(() => mergePrivateCommentRun(directory), /cover every/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('private CLI rejects a fourth shard symlink or unfinished queue', async () => {
  const [{ mergePrivateCommentRun }] = await modules;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'facebook-comment-merge-worker-'));
  try {
    await writeRun(directory, await fixture());
    const fourth = path.join(directory, 'worker-c');
    await fs.symlink(path.join(directory, 'worker-b'), fourth);
    await assert.rejects(() => mergePrivateCommentRun(directory), /real private directories/);
    await fs.unlink(fourth);
    await fs.mkdir(fourth);
    await assert.rejects(() => mergePrivateCommentRun(directory), /ENOENT/);
    assert.equal(await fs.stat(path.join(directory, 'merged')).catch(() => null), null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('CLI refuses a repository-contained input or a symlink output into the repository', async () => {
  const [{ mergePrivateCommentRun }] = await modules;
  const project = path.resolve(__dirname, '..');
  await assert.rejects(() => mergePrivateCommentRun(project), /outside the repository/);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'facebook-comment-merge-link-'));
  try {
    await writeRun(directory, await fixture());
    await fs.symlink(project, path.join(directory, 'merged'));
    await assert.rejects(() => mergePrivateCommentRun(directory), /must not be a symlink/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
