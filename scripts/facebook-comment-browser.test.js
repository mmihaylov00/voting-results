const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
let browser;
test.before(async () => { browser = await import('./lib/facebook-comment-browser.mjs'); });

function documentFor(markup, url = 'https://www.facebook.com/example/posts/100') {
  const dom = new JSDOM(`<div role="dialog"><h2>Example's Post</h2>${markup}</div>`, { url, runScripts: 'outside-only' });
  dom.window.Element.prototype.getClientRects = function () { return this.hasAttribute('hidden') ? [] : [{}]; };
  dom.window.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, width: this.hasAttribute('hidden') ? 0 : 500,
      height: 300, right: 500, bottom: 300 };
  };
  return dom;
}

function card(id, name, href, body = 'Body', options = {}) {
  const parentId = options.parentId;
  const permalink = `?comment_id=${parentId ?? id}${parentId ? `&reply_comment_id=${id}` : ''}`;
  return `<div role="article" aria-label="${parentId ? 'Reply' : 'Comment'} by ${name} 1h ago"${options.hidden ? ' hidden' : ''}>
    ${href === null ? '' : `<a href="${href}">${name}</a>`}<div dir="auto">${body}</div>
    <a href="${permalink}">1h</a>${options.extra ?? ''}</div>`;
}

test('reads the byline profile link and ignores a tagged person inside the body', () => {
  const dom = documentFor(card('1', 'Example Author', '/profile.php?id=123456789',
    '<a href="/profile.php?id=987654321">Tagged Person</a> replied here'));
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [{ commentId: '1', identity: 'uid:123456789' }]);
  dom.window.close();
});

test('nested replies keep their own author and never borrow the root byline', () => {
  const reply = card('2', 'Reply Author', '/profile.php?id=222222', 'Reply', { parentId: '1' });
  const root = card('1', 'Root Author', '/profile.php?id=111111', 'Root', { extra: reply });
  const dom = documentFor(root);
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [
    { commentId: '1', identity: 'uid:111111' }, { commentId: '2', identity: 'uid:222222' },
  ]);
  dom.window.close();
});

test('does not infer authors from names, reply mentions or a missing byline', () => {
  const dom = documentFor(card('1', 'Missing Author', null,
    '<a href="/profile.php?id=111111">Missing Author</a> body mention'));
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [{ commentId: '1', identity: null }]);
  dom.window.close();
});

test('equal display names remain distinct by profile links and normalized handles', () => {
  const dom = documentFor(card('1', 'Same Display Name', '/profile.php?id=123456')
    + card('2', 'Same Display Name', '/people/Some-Name/654321/')
    + card('3', 'Other Display Name', '/Mixed.Case.Account.123/?__cft__=tracking'));
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [
    { commentId: '1', identity: 'uid:123456' }, { commentId: '2', identity: 'uid:654321' },
    { commentId: '3', identity: 'handle:mixed.case.account.123' },
  ]);
  dom.window.close();
});

test('skips ambiguous native IDs and hidden cards rather than guessing', () => {
  const dom = documentFor(card('1', 'Author One', '/profile.php?id=111111', 'Body',
    { extra: '<a href="?comment_id=999">another comment link</a>' })
    + card('2', 'Hidden Author', '/profile.php?id=222222', 'Body', { hidden: true }));
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), []);
  dom.window.close();
});

test('rejects unrelated host and generic navigation links as author identities', () => {
  const dom = documentFor(card('1', 'External Author', 'https://example.com/profile.php?id=123456')
    + card('2', 'Generic Author', '/watch/')
    + card('3', 'Credential URL', 'https://name:password@www.facebook.com/profile.php?id=123456')
    + card('4', 'Port URL', 'https://www.facebook.com:444/profile.php?id=123456')
    + card('5', 'Invalid Profile', '/profile.php?id=not-a-number'));
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [
    { commentId: '1', identity: null }, { commentId: '2', identity: null },
    { commentId: '3', identity: null }, { commentId: '4', identity: null }, { commentId: '5', identity: null },
  ]);
  dom.window.close();
});

test('ignores fake external comment IDs and Facebook comment links inside the body', async () => {
  const dom = documentFor(`<div role="article" aria-label="Comment by Example Author 1h ago">
    <a href="/profile.php?id=123456">Example Author</a>
    <a href="https://example.com/?comment_id=999">External reference</a>
    <div dir="auto">Source text <a href="https://www.facebook.com/another/posts/200?comment_id=888">quoted comment</a></div>
    <a href="?comment_id=1">1h</a>
  </div>`);
  assert.deepEqual(browser.readVisibleAuthors(dom.window.document), [{ commentId: '1', identity: 'uid:123456' }]);
  const collector = browser.createCollector({});
  const snapshot = await collector.snapshot({ playwright: {
    evaluate: async callback => dom.window.eval(`(${callback.toString()})()`),
  } });
  assert.equal(snapshot.comments.length, 1);
  assert.equal(snapshot.comments[0].id, '1');
  assert.equal(snapshot.comments[0].parentId, null);
  assert.equal(new URL(snapshot.comments[0].url).searchParams.get('comment_id'), '1');
  dom.window.close();
});

test('merges snapshots before virtualization drops rows and protects fully expanded text', async () => {
  const persisted = [];
  const hooks = [];
  const capture = { postId: 'post:100', postUrl: 'https://www.facebook.com/example/posts/100', comments: [] };
  const captures = { version: 1, capturedAt: '2026-11-05T00:00:00.000Z', posts: [capture] };
  const events = [];
  const collector = browser.createCollector({
    commentCaptureFs: { writeFile: async (_path, text) => { persisted.push(JSON.parse(text)); events.push('write'); },
      rename: async () => { events.push('rename'); } },
    commentCaptureCrypto: { createHash }, commentCaptureDir: '/private-collection', commentCaptures: captures,
    onObserve: async value => { hooks.push(value); events.push('hook'); },
  });
  const row = { id: '1', parentId: null, url: 'https://www.facebook.com/profile.php?id=999999&comment_id=1',
    text: 'Fully expanded source text.', textComplete: true, publishedAtRaw: '1h' };
  let found = [row];
  collector.snapshot = async () => ({ comments: found });
  const tab = { playwright: { evaluate: async () => [{ commentId: '1', identity: 'uid:123456' }] } };
  await collector.merge(tab, capture);
  const first = structuredClone(capture.comments[0]);
  found = [{ ...row, text: 'Fully...', textComplete: false }];
  await collector.merge(tab, capture);
  found = [];
  tab.playwright.evaluate = async () => [];
  await collector.merge(tab, capture);
  assert.equal(capture.comments.length, 1);
  assert.deepEqual(capture.comments[0], first);
  assert.equal(capture.comments[0].url, 'https://www.facebook.com/example/posts/100?comment_id=1');
  assert.equal(capture.comments[0].textSha256, createHash('sha256').update(row.text).digest('hex'));
  assert.doesNotMatch(JSON.stringify(persisted), /profile\.php|999999|123456|identity|author/);
  assert.deepEqual(Object.keys(hooks[0]).sort(), ['postId', 'comments', 'authors'].sort());
  assert.deepEqual(hooks[0].comments, [{ id: '1', parentId: null }]);
  assert.doesNotMatch(JSON.stringify(hooks), /Fully|textComplete|publishedAtRaw/);
  assert.deepEqual(events, ['write', 'rename', 'hook', 'write', 'rename', 'hook', 'write', 'rename', 'hook']);
});

test('constructs canonical reply permalinks on the source post', async () => {
  const capture = { postId: 'post:100', postUrl: 'https://www.facebook.com/story.php?story_fbid=100&id=500', comments: [] };
  const collector = browser.createCollector({ commentCaptureFs: { writeFile: async () => {}, rename: async () => {} },
    commentCaptureCrypto: { createHash }, commentCaptureDir: '/private',
    commentCaptures: { version: 1, capturedAt: '2026-11-05T00:00:00.000Z', posts: [capture] } });
  collector.snapshot = async () => ({ comments: [{ id: '2', parentId: '1', url: 'https://www.facebook.com/other',
    text: 'Reply', textComplete: true, publishedAtRaw: '1h' }] });
  await collector.merge({}, capture);
  const url = new URL(capture.comments[0].url);
  assert.equal(url.pathname, '/story.php');
  assert.equal(url.searchParams.get('story_fbid'), '100');
  assert.equal(url.searchParams.get('id'), '500');
  assert.equal(url.searchParams.get('comment_id'), '1');
  assert.equal(url.searchParams.get('reply_comment_id'), '2');
});

test('scrolls through a focusable comment link and captures on both sides of the action', async () => {
  const events = [];
  const collector = browser.createCollector({});
  collector.merge = async (_tab, _post, observation) => { events.push(observation ? 'capture-existing-frame' : 'capture-new-frame'); return {}; };
  collector.observe = async () => { events.push('observe'); return ''; };
  const links = { count: async () => 1, last: () => ({ press: async key => events.push(`link:${key}`) }) };
  collector.controls = async () => ({ locator: selector => {
    assert.equal(selector, 'a[href*="comment_id=1"]');
    return links;
  } });
  const empty = { filter() { return this; }, allTextContents: async () => [], count: async () => 0 };
  const tab = { playwright: { locator: () => empty } };
  const snapshot = { comments: [{ id: '1' }], ui: { top: 0, max: 1000, pending: 0, button: null } };
  const result = await collector.step(tab, {}, 'down', snapshot);
  assert.equal(result.action, 'focus final comment link and End');
  assert.deepEqual(events, ['capture-existing-frame', 'link:End', 'observe', 'capture-new-frame']);
});

test('expands the exact freshly observed button and refuses a changed target', async () => {
  const events = [];
  const collector = browser.createCollector({});
  collector.merge = async () => ({});
  collector.observe = async () => '';
  let found = 1;
  const target = { filter() { return this; }, count: async () => found,
    nth: index => ({ click: async () => events.push([index, 'click']) }) };
  collector.controls = async () => ({ locator: selector => {
    assert.equal(selector, 'div:nth-of-type(2) > div:nth-of-type(1)');
    return target;
  } });
  const snapshot = { comments: [], ui: { button: { text: 'View 2 replies',
    selector: 'div:nth-of-type(2) > div:nth-of-type(1)', sameNameCount: 40, sameNameIndex: 20 } } };
  await collector.step({}, {}, 'down', snapshot);
  assert.deepEqual(events, [[0, 'click']]);
  found = 0;
  assert.match((await collector.step({}, {}, 'down', snapshot)).error, /refresh before expanding/);
  assert.equal(events.length, 1);
});

test('filters byline reads to unresolved comment IDs and can recover an unknown author later', async () => {
  const dom = documentFor(card('1', 'First Author', '/profile.php?id=123456')
    + card('2', 'Second Author', '/profile.php?id=654321'));
  assert.deepEqual(JSON.parse(JSON.stringify(dom.window.eval(`(${browser.readVisibleAuthors.toString()})({commentIds:['2']})`))),
    [{ commentId: '2', identity: 'uid:654321' }]);
  dom.window.close();
  const capture = { postId: 'post:100', postUrl: 'https://www.facebook.com/example/posts/100', comments: [] };
  const hooks = [];
  let needed = [];
  const collector = browser.createCollector({ commentCaptureFs: { writeFile: async () => {}, rename: async () => {} },
    commentCaptureCrypto: { createHash }, commentCaptureDir: '/private',
    commentCaptures: { version: 1, capturedAt: '2026-11-05T00:00:00.000Z', posts: [capture] },
    authorIdsNeeded: () => needed, onObserve: async observation => hooks.push(observation),
  });
  collector.snapshot = async () => ({ comments: [{ id: '1', parentId: null, text: 'Body', textComplete: true, publishedAtRaw: '1h' }] });
  const tab = { playwright: { evaluate: async (_callback, argument) => {
    assert.deepEqual(argument, { commentIds: ['1'] });
    return [{ commentId: '1', identity: 'uid:123456' }];
  } } };
  await collector.merge(tab, capture);
  needed = ['1'];
  await collector.merge(tab, capture);
  assert.equal(capture.comments.length, 1);
  assert.deepEqual(hooks[0].authors, []);
  assert.deepEqual(hooks[1].authors, [{ commentId: '1', identity: 'uid:123456' }]);
});
