const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const time = '2026-11-05T12:00:00.000Z';
const secret = new Uint8Array(32).fill(7);
const source = { id: 'post:one', pageId: 'page:one' };
let core;
test.before(async () => { core = await import('./lib/facebook-participation.mjs'); });

function checkpoint(rows, selectedSource = source) {
  return { source: selectedSource,
    comments: rows.map(([id, , parentId = null]) => ({ id, parentId })),
    authors: rows.map(([commentId, identity]) => ({ commentId, identity })),
  };
}
const initial = () => core.createParticipationState('test-run', time);
const merge = (state, rows, selectedSource = source) => core.mergeParticipation(state, checkpoint(rows, selectedSource), secret, time);

test('creates and reloads valid private state without mutating the saved input', () => {
  const state = initial();
  assert(core.validateParticipationState(state));
  const loaded = core.loadParticipationState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded, state);
  loaded.posts.changed = {};
  assert.deepEqual(state.posts, {});
  assert.throws(() => core.loadParticipationState({ ...state, author: 'unexpected' }), /Invalid saved/);
});

test('deduplicates snapshots and retains neutral top-level and reply counts', () => {
  const state = initial();
  const rows = [['1', 'uid:123'], ['2', 'uid:123', '1'], ['3', 'handle:other.account'], ['4', null]];
  const once = merge(state, rows);
  const twice = merge(once, rows);
  assert.deepEqual(twice, once);
  assert.equal(state.observedComments.length, 0);
  assert.equal(once.posts[source.id].capturedComments, 4);
  assert.equal(once.posts[source.id].topLevelComments, 3);
  assert.equal(once.posts[source.id].replyComments, 1);
  assert.equal(once.posts[source.id].matchedIdentityComments, 3);
  assert.equal(Object.keys(once.accounts).length, 2);
  assert.deepEqual(Object.values(once.accounts).map(value => value[source.id]).find(value => value.comments === 2),
    { comments: 2, topLevel: 1, replies: 1 });
  assert(core.validateParticipationState(twice));
});

test('later reliable identities recover unknown coverage without duplicating captured comments', () => {
  const unknown = merge(initial(), [['1', null], ['2', null]]);
  const known = merge(unknown, [['1', 'uid:123']]);
  const restored = core.loadParticipationState(JSON.parse(JSON.stringify(known)));
  const final = merge(restored, [['1', 'handle:changed.handle'], ['2', 'uid:123']]);
  assert.equal(final.observedComments.length, 2);
  assert.equal(final.identifiedComments.length, 2);
  assert.equal(Object.keys(final.accounts).length, 1);
  assert.equal(final.posts[source.id].matchedIdentityComments, 2);
  assert.equal(core.participationExport(final).coverage.unknownIdentityComments, 0);
});

test('uses source-scoped comment deduplication and stable account tokens across posts', () => {
  const other = { id: 'post:two', pageId: 'page:two' };
  const first = merge(initial(), [['1', 'uid:123']]);
  const second = merge(first, [['1', 'uid:123']], other);
  assert.equal(second.observedComments.length, 2);
  assert.equal(Object.keys(second.accounts).length, 1);
  assert.equal(Object.keys(Object.values(second.accounts)[0]).length, 2);
  assert(core.validateParticipationState(second));
});

test('keeps raw identities, native comment IDs, names, text and tones out of private state', () => {
  const state = merge(initial(), [['876543210987654321', 'uid:987654321098765432']]);
  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /876543210987654321|987654321098765432|uid:|handle:|authorName|gyurov|yotova|sourceText|commentId/);
  assert(Object.keys(state.accounts).every(key => /^[a-f0-9]{64}$/.test(key)));
  assert(state.observedComments.every(key => /^[a-f0-9]{64}$/.test(key)));
  assert.notEqual(Object.keys(state.accounts)[0], state.observedComments[0]);
  assert(!serialized.includes(Buffer.from(secret).toString('hex')));
});

test('refuses key changes on resume and rejects missing or short keys', () => {
  const state = merge(initial(), [['1', 'uid:123']]);
  const frame = checkpoint([['2', 'uid:123']]);
  assert.throws(() => core.mergeParticipation(state, frame, new Uint8Array(32).fill(8), time), /key changed/);
  assert.throws(() => core.mergeParticipation(state, frame, new Uint8Array(31), time), /32-byte/);
  assert.throws(() => core.mergeParticipation(state, frame, '7'.repeat(64), time), /32-byte/);
});

test('accepts cross-realm byte views and sliced Buffers without changing token derivation', () => {
  const frame = checkpoint([['1', 'uid:123']]);
  const expected = core.mergeParticipation(initial(), frame, secret, time);
  const foreignKey = vm.runInNewContext('new Uint8Array(32).fill(7)');
  assert.equal(foreignKey instanceof Uint8Array, false);
  assert.deepEqual(core.mergeParticipation(initial(), frame, foreignKey, time), expected);
  const backing = Buffer.alloc(40, 7);
  assert.deepEqual(core.mergeParticipation(initial(), frame, backing.subarray(4, 36), time), expected);
  assert.throws(() => core.mergeParticipation(initial(), frame, new Uint16Array(16), time), /32-byte/);
  assert.throws(() => core.mergeParticipation(initial(), frame, 'a'.repeat(63), time), /32-byte/);
  assert.throws(() => core.mergeParticipation(initial(), frame, 'G'.repeat(64), time), /32-byte/);
  assert.throws(() => core.mergeParticipation(initial(), frame, { byteLength: 32, BYTES_PER_ELEMENT: 1 }, time), /32-byte/);
});

test('rejects invalid author records, ungrounded IDs and arbitrary display-name identities', () => {
  for (const identity of ['Иван Иванов', 'handle:profile.php', 'handle:watch', 'handle:.invalid', 'handle:UPPER',
    'uid:0', 'https://www.facebook.com/someone', 'uid:123\n']) {
    assert.throws(() => merge(initial(), [['1', identity]]), /Invalid participation identity/);
  }
  const extra = checkpoint([['1', 'uid:123']]);
  extra.authors[0].name = 'unexpected';
  assert.throws(() => core.mergeParticipation(initial(), extra, secret, time), /Invalid participation identity/);
  const ungrounded = checkpoint([['1', 'uid:123']]);
  ungrounded.authors[0].commentId = '2';
  assert.throws(() => core.mergeParticipation(initial(), ungrounded, secret, time), /Invalid participation identity/);
});

test('rejects malformed comments, changed Page mapping and unexpected sensitive fields', () => {
  for (const patch of [{ text: 'must remain in the separate capture' }, { parentId: '1' }, { id: 'not-native' }]) {
    const frame = checkpoint([['1', 'uid:123']]);
    Object.assign(frame.comments[0], patch);
    assert.throws(() => core.mergeParticipation(initial(), frame, secret, time), /Invalid participation comment/);
  }
  const state = merge(initial(), [['1', 'uid:123']]);
  assert.throws(() => merge(state, [['2', 'uid:123']], { ...source, pageId: 'different' }), /changed its source Page/);
  assert.throws(() => merge(state, [['2', 'uid:123']], { id: '__proto__', pageId: 'different' }), /Invalid participation checkpoint/);
  const frame = checkpoint([['2', 'uid:123']]);
  frame.authorOpinions = [];
  assert.throws(() => core.mergeParticipation(state, frame, secret, time), /Invalid participation checkpoint/);
});

test('handles duplicate identical cards but rejects conflicting parents and identities', () => {
  assert.equal(merge(initial(), [['1', null], ['1', 'uid:123']]).posts[source.id].capturedComments, 1);
  assert.throws(() => merge(initial(), [['1', 'uid:123'], ['1', 'uid:456']]), /Conflicting participation identity/);
  assert.throws(() => merge(initial(), [['1', 'uid:123'], ['1', 'uid:123', '2']]), /Conflicting participation comment/);
});

test('suppresses small account cells and overlap pairs without exposing participant tokens', () => {
  const rows = Array.from({ length: 4 }, (_, index) => [String(index + 1), `uid:${index + 100}`]);
  const first = merge(initial(), rows);
  const second = merge(first, rows, { id: 'post:two', pageId: 'page:two' });
  const output = core.participationExport(second);
  assert.deepEqual(output.totals, { accounts: null, accountsOnMultiplePosts: null, accountsOnMultiplePages: null });
  assert(output.posts.every(post => post.accounts === null && post.accountsStartingThreads === null));
  assert(output.pages.every(page => page.accounts === null));
  assert.deepEqual(output.postOverlaps, []);
  assert.deepEqual(output.pageOverlaps, []);
  const exported = JSON.stringify(output);
  assert(!exported.includes(second.keyCheck));
  for (const token of Object.keys(second.accounts)) assert(!exported.includes(token));
  for (const token of second.observedComments) assert(!exported.includes(token));
  assert.throws(() => core.participationExport(second, 4), /at least five/);
});

test('counts cross-Page and cross-post accounts once with complete coverage at the threshold', () => {
  const rows = Array.from({ length: 5 }, (_, index) => [String(index + 1), `uid:${index + 100}`]);
  let state = merge(initial(), rows);
  state = merge(state, rows, { id: 'post:two', pageId: 'page:one' });
  state = merge(state, rows, { id: 'post:three', pageId: 'page:two' });
  const output = core.participationExport(state);
  assert.deepEqual(output.coverage, { capturedComments: 15, matchedIdentityComments: 15, unknownIdentityComments: 0 });
  assert.deepEqual(output.totals, { accounts: 5, accountsOnMultiplePosts: 5, accountsOnMultiplePages: 5 });
  assert.equal(output.postOverlaps.length, 3);
  assert(output.postOverlaps.every(pair => pair.sharedAccounts === 5));
  assert.deepEqual(output.pageOverlaps, [{ leftPageId: 'page:one', rightPageId: 'page:two', sharedAccounts: 5 }]);
  assert(output.pages.every(page => page.accounts === 5));
  assert.equal(output.pages.find(page => page.pageId === 'page:one').postCount, 2);
});

test('detects corrupted persisted counters and keeps empty observations distinct from matched accounts', () => {
  const empty = merge(initial(), []);
  assert.equal(Object.keys(empty.posts).length, 1);
  assert.deepEqual(core.participationExport(empty).coverage,
    { capturedComments: 0, matchedIdentityComments: 0, unknownIdentityComments: 0 });
  const state = merge(empty, [['1', 'uid:123']]);
  const corrupt = structuredClone(state);
  corrupt.posts[source.id].matchedIdentityComments = 0;
  assert.equal(core.validateParticipationState(corrupt), false);
  const extra = structuredClone(state);
  extra.accounts[Object.keys(extra.accounts)[0]][source.id].tone = 'critical';
  assert.equal(core.validateParticipationState(extra), false);
  const missingKeyCheck = { ...state, keyCheck: null };
  assert.equal(core.validateParticipationState(missingKeyCheck), false);
});
