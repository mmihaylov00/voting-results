const assert = require('node:assert/strict');
const { test } = require('node:test');

const modules = Promise.all([
  import('./lib/facebook-comment-driver.mjs'), import('./lib/facebook-comment-review.mjs'),
]);
const source = { id: 'post:example', url: 'https://www.facebook.com/example/posts/123/' };
const comment = (id, parentId = null) => ({ id, parentId, text: `Comment ${id}`, textComplete: true });
const memoryFs = () => ({ writes: [], async writeFile(path, text) { this.writes.push([path, text]); }, async rename() {} });
const postFixture = (comments = [comment('1'), comment('2', '1')], reportedCount = comments.length) => ({
  postId: source.id, postUrl: source.url, checkedAt: null, status: 'partial', ordering: 'all',
  reportedCount, notes: [], comments,
});
const snapshotFixture = post => ({
  comments: structuredClone(post.comments), reportedCount: post.reportedCount,
  ordering: { text: 'All comments' }, ui: { top: 0, max: 0, pending: 0 },
});

async function driverFixture(post = postFixture()) {
  const [{ createDriver }] = await modules;
  const snapshot = snapshotFixture(post);
  const tools = {
    async snapshot() { return structuredClone(snapshot); }, async observe() { return 'Comments'; },
    async merge() {}, async step() { return {}; },
  };
  const captures = { capturedAt: null, posts: [post] };
  const fs = memoryFs();
  const driver = createDriver({ tools, captures, fs, dir: '/private/test', tab: {} });
  driver.begin = async () => ({ post });
  return { driver, tools, post, snapshot, fs };
}

test('completion requires a current matching counter, ordering, connected parents and full texts', async () => {
  const [{ completeCommentObservation }] = await modules;
  const post = postFixture();
  const snapshot = snapshotFixture(post);
  assert.equal(completeCommentObservation(post, snapshot), true);
  for (const patch of [
    { reportedCount: null }, { reportedCount: 1 }, { ordering: { text: 'Newest' } },
    { error: 'No open comment thread' }, { ui: { top: 0, max: 100, pending: 0 } },
    { ui: { top: 0, max: 0, pending: 1 } },
  ]) assert.equal(completeCommentObservation(post, { ...snapshot, ...patch }), false);
  assert.equal(completeCommentObservation({ ...post, ordering: 'newest' }, snapshot), false);
  assert.equal(completeCommentObservation({ ...post, comments: [comment('1'), { ...comment('2', '1'), textComplete: false }] }, snapshot), false);
  assert.equal(completeCommentObservation({ ...post, comments: [comment('1'), comment('2', 'missing')] }, snapshot), false);
  assert.equal(completeCommentObservation({ ...post, comments: [comment('1'), comment('1')] }, snapshot), false);
  assert.equal(completeCommentObservation({ ...post, comments: [comment('1'), comment('2', '2')] }, snapshot), false);
});

test('driver completes only after two matching terminal snapshots', async () => {
  const { driver, post, tools } = await driverFixture();
  let observations = 0;
  tools.observe = async () => { observations++; return 'Comments'; };
  const result = await driver.collect(source, 1);
  assert.equal(result.status, 'complete');
  assert.equal(result.terminal, true);
  assert.ok(observations >= 2);
  assert.equal(post.comments.length, 2);
  assert.deepEqual(post.notes, []);
});

test('a late loading indicator prevents complete status and queue terminality', async () => {
  const { driver, tools, post } = await driverFixture();
  let reads = 0;
  tools.snapshot = async () => ({ ...snapshotFixture(post), ui: { top: 0, max: 0, pending: ++reads === 1 ? 0 : 1 } });
  const result = await driver.collect(source, 1);
  assert.equal(result.status, 'partial');
  assert.equal(result.terminal, false);
});

test('unknown counters and unresolved bodies or parents remain partial after visible exhaustion', async () => {
  const examples = [
    postFixture([comment('1')], null),
    postFixture([comment('1'), { ...comment('2', '1'), textComplete: false }]),
    postFixture([comment('1'), comment('2', 'missing')]),
    postFixture([comment('1'), comment('2'), comment('3')], 2),
  ];
  for (const post of examples) {
    const { driver } = await driverFixture(post);
    const result = await driver.collect(source, 6);
    assert.equal(result.status, 'partial');
    assert.equal(result.terminal, true);
    assert.equal(post.comments.length, examples.indexOf(post) === 0 ? 1 : examples.indexOf(post) === 3 ? 3 : 2);
  }
  assert.equal(examples[0].reportedCount, null);
  assert.match(examples[0].notes[0], /нативен брояч/);
});

test('a quiet bottom with a counter gap settles to partial without another End action', async () => {
  const { driver, tools, post } = await driverFixture(postFixture([comment('1')], 3));
  let actions = 0;
  let merges = 0;
  tools.step = async () => { actions++; return {}; };
  tools.merge = async () => { merges++; };
  const result = await driver.collect(source, 6);
  assert.equal(result.status, 'partial');
  assert.equal(result.terminal, true);
  assert.equal(actions, 0);
  assert.equal(merges, 3);
  assert.equal(post.reportedCount, 3);
  assert.equal(post.comments.length, 1);
  assert.match(post.notes[0], /брояч/);
});

test('late loading and newly captured comments reset quiet-bottom stability', async () => {
  const { driver, tools, snapshot, post } = await driverFixture(postFixture([comment('1')], 3));
  const stability = () => driver.terminalStability[source.id + '|all'].stable;
  let actions = 0;
  tools.step = async () => { actions++; return {}; };
  tools.merge = async () => { post.comments = structuredClone(snapshot.comments); };
  assert.equal((await driver.collect(source, 2)).terminal, false);
  assert.equal(stability(), 1);
  snapshot.ui.pending = 1;
  assert.equal((await driver.collect(source, 1)).terminal, false);
  assert.equal(stability(), 0);
  assert.equal(actions, 1);
  snapshot.ui.pending = 0;
  snapshot.comments.push(comment('2'));
  assert.equal((await driver.collect(source, 2)).terminal, false);
  assert.equal(stability(), 0);
  assert.equal(post.comments.length, 2);
  assert.equal((await driver.collect(source, 2)).terminal, false);
  assert.equal(stability(), 2);
  const result = await driver.collect(source, 1);
  assert.equal(result.terminal, true);
  assert.equal(result.status, 'partial');
  assert.equal(actions, 1);
});

test('pending controls and a changed ordering do not become terminal', async () => {
  const { driver, snapshot } = await driverFixture();
  snapshot.ui.pending = 1;
  assert.equal((await driver.collect(source, 2)).terminal, false);
  snapshot.ordering.text = 'Newest';
  const changed = await driver.collect(source, 2);
  assert.match(changed.error, /ordering changed/);
  assert.equal(changed.status, 'partial');
});

test('restrictions stop immediately and browser-control timeouts preserve collected bodies', async () => {
  const { driver, post, tools } = await driverFixture();
  const before = structuredClone(post.comments);
  tools.observe = async () => 'Security Check: check you are human';
  const blocked = await driver.collect(source);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.status, 'partial');
  assert.equal(blocked.terminal, false);
  assert.deepEqual(post.comments, before);
  tools.observe = async () => 'Comments';
  driver.begin = async () => { throw new Error('Playwright selector deadline exceeded'); };
  const timedOut = await driver.collect(source);
  assert.equal(timedOut.status, 'partial');
  assert.equal(timedOut.unavailable, undefined);
  assert.match(timedOut.error, /Browser collection action failed/);
  assert.deepEqual(post.comments, before);
});

test('a challenge appearing after begin stops before another UI action', async () => {
  const { driver, tools, snapshot } = await driverFixture();
  snapshot.ui.pending = 1;
  let observations = 0;
  let actions = 0;
  tools.observe = async () => ++observations === 1 ? 'Comments' : 'Security Check';
  tools.step = async () => { actions++; return {}; };
  const result = await driver.collect(source);
  assert.equal(result.blocked, true);
  assert.equal(actions, 0);
});

async function beginFixture({ empty = false, view = 'Loading Facebook', reported = null, comments = [] } = {}) {
  const [{ createDriver }] = await modules;
  const post = postFixture(comments, reported);
  const chain = { locator() { return this; }, filter() { return this; }, getByRole() { return this; }, first() { return this; },
    async waitFor() { throw new Error('selector deadline exceeded'); } };
  const tab = { async url() { return source.url; }, playwright: {
    locator() { return chain; }, getByRole() { return chain; }, async evaluate() { return empty; },
  } };
  const snapshot = empty ? { ...snapshotFixture(post), comments: [], ordering: null } : { error: 'No open comment thread', comments: [] };
  const tools = { async snapshot() { return structuredClone(snapshot); }, async observe() { return view; }, async merge() {} };
  const driver = createDriver({ tools, tab, captures: { posts: [post] }, fs: memoryFs(), dir: '/private/test' });
  return { driver, post, tools, snapshot };
}

test('a no-thread loading timeout is partial; native unavailable evidence is kept distinct from empty', async () => {
  const loading = await beginFixture();
  const partial = await loading.driver.collect(source);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.unavailable, undefined);
  assert.equal(partial.terminal, false);
  const unavailable = await beginFixture({ view: "This content isn't available right now" });
  const result = await unavailable.driver.collect(source);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailableVerified, true);
  assert.equal(result.emptyThreadVerified, false);
});

test('literal empty observations preserve an unknown counter and never erase previous bodies', async () => {
  const empty = await beginFixture({ empty: true });
  const result = await empty.driver.collect(source);
  assert.equal(result.status, 'complete');
  assert.equal(result.emptyThreadVerified, true);
  assert.equal(result.reported, null);
  const prior = await beginFixture({ empty: true, comments: [comment('1')], reported: 1 });
  const retained = await prior.driver.collect(source);
  assert.equal(retained.status, 'partial');
  assert.equal(retained.emptyThreadVerified, false);
  assert.equal(prior.post.comments.length, 1);
});

test('a twice-confirmed empty view with a positive native counter is terminal partial', async () => {
  const { driver, post } = await beginFixture({ empty: true, reported: 1 });
  const result = await driver.collect(source);
  assert.equal(result.status, 'partial');
  assert.equal(result.terminal, true);
  assert.equal(result.emptyViewConflictVerified, true);
  assert.equal(result.emptyThreadVerified, false);
  assert.equal(result.unavailableVerified, false);
  assert.equal(result.error, undefined);
  assert.equal(post.ordering, null);
  assert.equal(post.reportedCount, 1);
  assert.equal(post.comments.length, 0);
  assert.match(post.notes[0], /показва 1/);
});

test('transient empty views, pending loading and stale counters do not prove an empty-view conflict', async () => {
  const transient = await beginFixture({ empty: true, reported: 1 });
  let emptyReads = 0;
  transient.driver.tab.playwright.evaluate = async () => ++emptyReads === 1;
  assert.equal((await transient.driver.collect(source)).emptyViewConflictVerified, false);
  const loading = await beginFixture({ empty: true, reported: 1 });
  loading.snapshot.ui.pending = 1;
  const pending = await loading.driver.collect(source);
  assert.equal(pending.terminal, false);
  assert.equal(pending.emptyViewConflictVerified, false);
  const stale = await beginFixture({ empty: true, reported: 1 });
  stale.snapshot.reportedCount = null;
  const unknown = await stale.driver.collect(source);
  assert.equal(unknown.emptyViewConflictVerified, false);
  assert.equal(unknown.terminal, false);
  const prior = await beginFixture({ empty: true, reported: 1, comments: [comment('1')] });
  const retained = await prior.driver.collect(source);
  assert.equal(retained.emptyViewConflictVerified, false);
  assert.equal(retained.terminal, false);
  assert.equal(prior.post.comments.length, 1);
});

test('a restriction after empty-view verification revokes terminality', async () => {
  const { driver, tools } = await beginFixture({ empty: true, reported: 1 });
  let observations = 0;
  tools.observe = async () => ++observations < 3 ? 'Comments' : 'Security Check';
  const result = await driver.collect(source);
  assert.equal(result.blocked, true);
  assert.equal(result.terminal, false);
  assert.equal(result.emptyViewConflictVerified, false);
  assert.equal(result.status, 'partial');
});

async function reviewerFixture({ post = postFixture([comment('1')], 2), result = { terminal: true }, label } = {}) {
  const [, { createReviewer }] = await modules;
  const fs = memoryFs();
  const driver = { targetOrdering: 'all', tab: {}, async collect() { post.ordering = this.targetOrdering; return { status: post.status, ...result }; }, async save() {} };
  const tools = { async observe() { return 'Comments'; }, async snapshot() {
    return { ...snapshotFixture(post), ordering: { text: label || (driver.targetOrdering === 'all' ? 'All comments' : 'Newest') } };
  } };
  const reviewer = createReviewer({ driver, tools, fs, dir: '/private/test', captures: { posts: [post] },
    source: { posts: [source] }, qa: { posts: [] }, queue: [source.id], index: 0, stage: 'all' });
  return { reviewer, driver, tools, post, result };
}

test('reviewer requires explicit terminality rather than arbitrary notes', async () => {
  const { reviewer, post } = await reviewerFixture({ result: { terminal: false } });
  post.notes = ['Loading was interrupted'];
  await reviewer.step();
  assert.equal(reviewer.index, 0);
  assert.equal(reviewer.stage, 'all');
  assert.equal(reviewer.qa.posts.length, 0);
});

test('partial counter gaps require verified All comments and Newest terminals before advancing', async () => {
  const { reviewer, post } = await reviewerFixture();
  await reviewer.step();
  assert.equal(reviewer.index, 0);
  assert.equal(reviewer.stage, 'newest');
  assert.equal(reviewer.qa.posts[0].allTerminal, true);
  await reviewer.step();
  const qa = reviewer.qa.posts[0];
  assert.equal(reviewer.index, 1);
  assert.equal(qa.newestTerminal, true);
  assert.equal(qa.reviewComplete, true);
  assert.equal(post.status, 'partial');
  assert.equal(qa.orderProof.all.reportedCount, 2);
  assert.match(post.notes[0], /брояч е 2/);
});

test('an accessible revisit clears stale empty/unavailable QA flags and still checks Newest for a gap', async () => {
  const { reviewer } = await reviewerFixture();
  reviewer.qa.posts.push({ postId: source.id, unavailableVerified: true, emptyThreadVerified: true });
  await reviewer.step();
  assert.equal(reviewer.index, 0);
  assert.equal(reviewer.stage, 'newest');
  assert.equal(reviewer.qa.posts[0].unavailableVerified, false);
  assert.equal(reviewer.qa.posts[0].emptyThreadVerified, false);
});

test('late wrong ordering, failed reads and restrictions leave the reviewer queue unfinished', async () => {
  const wrong = await reviewerFixture({ label: 'Most relevant' });
  assert.match((await wrong.reviewer.step()).error, /ordering/);
  assert.equal(wrong.reviewer.index, 0);
  assert.equal(wrong.reviewer.qa.posts[0].allTerminal, false);
  assert.equal(wrong.reviewer.qa.posts[0].reviewComplete, undefined);
  const failed = await reviewerFixture();
  failed.tools.snapshot = async () => { throw new Error('Browser deadline exceeded'); };
  assert.match((await failed.reviewer.step()).error, /could not be read/);
  assert.equal(failed.reviewer.index, 0);
  const blocked = await reviewerFixture();
  blocked.tools.observe = async () => 'Temporarily blocked';
  assert.equal((await blocked.reviewer.step()).blocked, true);
  assert.equal(blocked.reviewer.index, 0);
});

test('native unavailable and literal empty checks remain separate in reviewer QA', async () => {
  const unavailable = await reviewerFixture({ post: postFixture([], null),
    result: { terminal: true, unavailableVerified: true, unavailable: true } });
  unavailable.post.status = 'unavailable';
  await unavailable.reviewer.step();
  assert.equal(unavailable.reviewer.index, 1);
  assert.equal(unavailable.reviewer.qa.posts[0].unavailableVerified, true);
  assert.equal(unavailable.reviewer.qa.posts[0].emptyThreadVerified, false);
  const empty = await reviewerFixture({ post: postFixture([], null),
    result: { terminal: true, emptyThreadVerified: true } });
  empty.post.status = 'complete';
  await empty.reviewer.step();
  assert.equal(empty.reviewer.index, 1);
  assert.equal(empty.reviewer.qa.posts[0].emptyThreadVerified, true);
  assert.equal(empty.post.reportedCount, null);
});

test('reviewer records an empty-view conflict as partial without inventing ordering proof', async () => {
  const { reviewer, post, tools } = await reviewerFixture({ post: postFixture([], 1),
    result: { terminal: true, emptyViewConflictVerified: true } });
  post.ordering = null;
  tools.snapshot = async () => { throw new Error('No ordering exists in the empty view'); };
  reviewer.qa.posts.push({ postId: source.id, allTerminal: true, orderProof: { all: {} } });
  const result = await reviewer.step();
  assert.equal(result.status, 'partial');
  assert.equal(reviewer.index, 1);
  const proof = reviewer.qa.posts[0];
  assert.equal(proof.emptyViewConflictVerified, true);
  assert.equal(proof.emptyThreadVerified, false);
  assert.equal(proof.unavailableVerified, false);
  assert.equal(proof.reviewComplete, true);
  assert.equal(proof.captured, 0);
  assert.equal(proof.reported, 1);
  assert.equal(proof.orderProof, undefined);
  assert.equal(proof.allTerminal, undefined);
  assert.equal(proof.newestTerminal, undefined);
  assert.equal(post.status, 'partial');
});

test('reviewer rejects contradictory empty-view conflict proofs', async () => {
  for (const post of [postFixture([], 0), postFixture([comment('1')], 1)]) {
    const { reviewer } = await reviewerFixture({ post, result: { terminal: true, emptyViewConflictVerified: true } });
    const result = await reviewer.step();
    assert.equal(result.terminal, false);
    assert.match(result.error, /proof does not match/);
    assert.equal(reviewer.index, 0);
    assert.equal(reviewer.qa.posts.length, 0);
  }
});

test('reviewer errors never advance and missing All proof forces that order before Newest completion', async () => {
  const failed = await reviewerFixture({ result: { error: 'Expansion control changed' } });
  await failed.reviewer.step();
  assert.equal(failed.reviewer.index, 0);
  assert.equal(failed.reviewer.qa.posts.length, 0);
  const missing = await reviewerFixture();
  missing.reviewer.stage = 'newest';
  assert.match((await missing.reviewer.step()).error, /All comments ordering proof is missing/);
  assert.equal(missing.reviewer.stage, 'all');
  assert.equal(missing.reviewer.index, 0);
});
