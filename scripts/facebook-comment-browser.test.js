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

function locatorTab(dom) {
  const queries = [], events = [];
  const visible = element => !element.closest('[hidden]') && dom.window.getComputedStyle(element).visibility !== 'hidden';
  const locator = resolve => ({
    resolve,
    filter(options) {
      assert(!(options.hasText instanceof RegExp), 'Selector filters must not serialize RegExp values');
      return locator(() => resolve().filter(element => (!options.visible || visible(element))
        && (!options.hasText || element.textContent.includes(options.hasText))
        && (!options.has || options.has.resolve().some(child => element.contains(child)))));
    },
    and(other) { return locator(() => resolve().filter(element => other.resolve().includes(element))); },
    locator(selector) {
      queries.push(selector);
      return locator(() => selector === 'xpath=..' ? [...new Set(resolve().map(element => element.parentElement))]
        : [...new Set(resolve().flatMap(element => [...element.querySelectorAll(selector)]))]);
    },
    nth: index => locator(() => resolve().slice(index, index + 1)),
    count: async () => resolve().length,
    allTextContents: async () => resolve().map(element => element.textContent),
    evaluateAll: async (callback, argument, options) => {
      assert.equal(options.timeoutMs, 15000);
      return dom.window.eval(`(${callback.toString()})`)(resolve(), argument);
    },
    isEnabled: async () => !resolve()[0].hasAttribute('disabled') && resolve()[0].getAttribute('aria-disabled') !== 'true',
    press: async key => {
      assert.equal(resolve().length, 1);
      events.push([resolve()[0].id, key]);
    },
  });
  return { queries, events, url: async () => dom.window.location.href, playwright: { getByRole(role, options) {
    assert.equal(role, 'heading'); assert.equal(options.name, 'Comments'); assert.equal(options.exact, true);
    return locator(() => [...dom.window.document.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .filter(element => element.textContent.trim().replace(/\s+/g, ' ') === options.name));
  }, locator(selector) {
    queries.push(selector);
    return locator(() => [...dom.window.document.querySelectorAll(selector)]);
  } } };
}

test('comment controls stay live across remounts and ancestor path changes', async () => {
  const dom = documentFor('<button>Before remount</button>');
  const tab = locatorTab(dom), collector = browser.createCollector({});
  const controls = await collector.controls(tab);
  assert.deepEqual(await controls.locator('button').allTextContents(), ['Before remount']);
  dom.window.document.body.innerHTML = '<main id="mount_changed"><div></div><section><div role="dialog">'
    + '<h2>Another Page’s Post  </h2><button>After remount</button></div></section></main>';
  assert.deepEqual(await controls.locator('button').allTextContents(), ['After remount']);
  assert.equal(await (await collector.controls(tab)).count(), 1);
  assert(tab.queries.every(query => !/mount_|nth-of-type/.test(query)));
  dom.window.close();
});

test('wrapped cloned and unwrapped native dialogs resolve to the same thread without ancestor indices', async () => {
  const dom = documentFor('');
  dom.window.document.body.innerHTML = '<div role="dialog"><button>Outer controls</button><div role="dialog">'
    + '<h2>Page\'s Post</h2><button>Thread controls</button></div></div>';
  const collector = browser.createCollector({}), tab = locatorTab(dom);
  const controls = await collector.controls(tab);
  assert.deepEqual(await controls.locator('button').filter({ hasText: 'Thread controls' }).allTextContents(), ['Thread controls']);
  dom.window.document.querySelector('[role="dialog"] [role="dialog"]').insertAdjacentHTML('beforeend',
    '<div role="dialog" hidden><h2>Hidden private dialog</h2></div>');
  assert.deepEqual(await controls.locator('button').filter({ hasText: 'Thread controls' }).allTextContents(), ['Thread controls']);
  dom.window.document.body.innerHTML = '<div role="dialog"><h2>Page\'s Post</h2><button>Thread controls</button></div>';
  assert.deepEqual(await controls.locator('button').filter({ hasText: 'Thread controls' }).allTextContents(), ['Thread controls']);
  assert.equal(await (await collector.controls(tab)).count(), 1);
  assert(tab.queries.every(query => !/nth-of-type|nth-child/.test(query)));
  dom.window.document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><h2>Other\'s Post</h2></div>');
  await assert.rejects(() => browser.createCollector({}).controls(locatorTab(dom)), /scope is missing or ambiguous/);
  dom.window.close();
});

test('comment controls reject hidden or ambiguous post roots instead of choosing the first', async () => {
  const collector = browser.createCollector({});
  for (const markup of ['<div role="dialog" hidden><h2>Hidden\'s Post</h2></div>',
    '<div role="dialog"><h2 hidden>Hidden\'s Post</h2></div>',
    '<div role="dialog"><h2>One\'s Post</h2></div><div role="dialog"><h2>Two’s Post</h2></div>',
    '<div role="dialog"><h2>One\'s Post</h2><h2>Two’s Post</h2></div>',
    '<div role="dialog"><h3>Not a thread\'s Post</h3></div>']) {
    const dom = documentFor(''); dom.window.document.body.innerHTML = markup;
    await assert.rejects(() => collector.controls(locatorTab(dom)), /(?:scope is missing or ambiguous|heading is ambiguous)/);
    dom.window.close();
  }
  const dom = documentFor('<button>Active</button>');
  dom.window.document.body.insertAdjacentHTML('beforeend', '<div role="dialog" hidden><h2>Hidden\'s Post</h2></div>');
  dom.window.document.body.insertAdjacentHTML('afterbegin', '<div role="dialog"><h2>Unrelated dialog</h2></div>');
  await assert.rejects(() => collector.controls(locatorTab(dom)), /scope is missing or ambiguous/);
  dom.window.document.querySelector('[role="dialog"]').remove();
  assert.deepEqual(await (await collector.controls(locatorTab(dom))).locator('button').allTextContents(), ['Active']);
  dom.window.close();
});

test('photo and reel controls use exactly one visible Comments heading direct parent', async () => {
  const collector = browser.createCollector({});
  for (const pathname of ['/photo?fbid=100', '/photo/?fbid=100', '/reel/100']) {
    const dom = documentFor('', 'https://www.facebook.com' + pathname);
    dom.window.document.body.innerHTML = '<div role="dialog"><h2>Page\'s Post</h2><button>Background</button>'
      + '<section><h2> Comments  </h2><button>Thread</button></section></div>'
      + '<aside hidden><h2>Comments</h2></aside><h3>Comments</h3>';
    const tab = locatorTab(dom);
    assert.deepEqual(await (await collector.controls(tab)).locator('button').allTextContents(), ['Thread']);
    assert(tab.queries.includes('xpath=..'));
    dom.window.document.querySelector('section').insertAdjacentHTML('beforeend', '<h2>Comments</h2>');
    await assert.rejects(() => collector.controls(tab), /heading is ambiguous/);
    dom.window.document.querySelector('[role="dialog"]').setAttribute('hidden', '');
    await assert.rejects(() => collector.controls(tab), /scope is missing or ambiguous/);
    dom.window.close();
  }
});

test('media controls use a unique visible post dialog when no Comments heading is present', async () => {
  const collector = browser.createCollector({});
  for (const pathname of ['/photo/?fbid=100', '/reel/100']) {
    const dom = documentFor('<button>Modal thread</button>', 'https://www.facebook.com' + pathname);
    dom.window.document.body.insertAdjacentHTML('beforeend', '<section hidden><h2>Comments</h2></section>');
    const tab = locatorTab(dom);
    assert.deepEqual(await (await collector.controls(tab)).locator('button').allTextContents(), ['Modal thread']);
    dom.window.document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><h2>Other\'s Post</h2></div>');
    await assert.rejects(() => collector.controls(tab), /scope is missing or ambiguous/);
    dom.window.close();
  }
});

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

test('measures expansion and ordering controls without hit-testing unrelated comment actions', async () => {
  const actions = '<h3 data-ordinary-action>Comment author</h3><button data-ordinary-action>Like</button><button data-ordinary-action>Reply</button>'.repeat(500);
  const dom = documentFor(card('1', 'Example Author', '/profile.php?id=123456', 'Comment text', { extra: actions })
    + '<button>All comments</button><button>View 2 replies</button><button hidden>View 8 replies</button>'
    + '<button aria-disabled="true">View 4 replies</button><div role="status">Loading...</div>'
    + '<button aria-label="Comment on Example\'s post, 1 comment">1</button>'
    + '<h2>Security check</h2><div role="alert">Try again later</div>');
  const measured = [];
  let unrelatedVisibilityReads = 0;
  const clientRects = dom.window.Element.prototype.getClientRects;
  dom.window.Element.prototype.getClientRects = function () {
    if (this.hasAttribute('data-ordinary-action')) unrelatedVisibilityReads++;
    return clientRects.call(this);
  };
  dom.window.document.createRange = () => ({
    selectNodeContents: element => measured.push(element.textContent.trim()),
    getClientRects: () => [{ x: 0, y: 0, width: 100, height: 20 }],
  });
  dom.window.document.elementFromPoint = () => null;
  const collector = browser.ccInstallSnapshotFix(browser.createCollector({}));
  const snapshot = await collector.snapshot({ playwright: {
    evaluate: async callback => dom.window.eval(`(${callback.toString()})()`),
  } });
  assert.deepEqual(measured, ['All comments', 'View 2 replies', 'View 4 replies']);
  assert.equal(unrelatedVisibilityReads, 0);
  assert.equal(snapshot.comments[0].text, 'Comment text');
  assert.equal(snapshot.reportedCount, 1);
  assert.equal(snapshot.ordering.text, 'All comments');
  assert.equal(snapshot.ui.pending, 3);
  assert.equal(snapshot.ui.button.text, 'View 2 replies');
  const observation = await collector.observe({ playwright: {
    evaluate: async callback => dom.window.eval(`(${callback.toString()})()`),
  } });
  assert.equal(JSON.parse(observation.split('\n')[0]).ordering, 'All comments');
  assert.deepEqual(JSON.parse(observation.split('\n')[0]).headings, ["Example's Post", 'Security check', 'Try again later']);
  assert.equal(unrelatedVisibilityReads, 0);
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

test('expands the observed duplicate by its checked name, count and index', async () => {
  const events = [];
  const collector = browser.createCollector({});
  collector.merge = async () => ({});
  collector.observe = async () => '';
  let found = 40;
  const target = { filter(options) { assert.equal(options.hasText, 'View 2 replies'); return this; },
    allTextContents: async () => Array.from({ length: found }, () => 'View 2 replies'),
    nth: index => ({ isEnabled: async () => true, press: async key => events.push([index, key]) }) };
  collector.controls = async () => ({ locator: selector => {
    assert.equal(selector, '[role="button"],button');
    return target;
  } });
  const snapshot = { comments: [], ui: { button: { text: 'View 2 replies',
    selector: 'div:nth-of-type(2) > div:nth-of-type(1)', sameNameCount: 40, sameNameIndex: 20 } } };
  await collector.step({}, {}, 'down', snapshot);
  assert.deepEqual(events, [[20, 'Enter']]);
  found = 0;
  assert.match((await collector.step({}, {}, 'down', snapshot)).error, /refresh before expanding/);
  assert.equal(events.length, 1);
});

test('activates a unique named expansion with the keyboard and rejects changed or disabled targets', async () => {
  const collector = browser.createCollector({});
  const events = [];
  collector.merge = async () => ({});
  collector.observe = async () => '';
  let count = 1, enabled = true;
  const target = { filter(options) { assert.equal(options.hasText, 'View 65 replies'); return this; },
    allTextContents: async () => Array.from({ length: count }, () => 'View 65 replies'), isEnabled: async () => enabled,
    nth() { return this; }, press: async key => events.push(key) };
  collector.controls = async () => ({ locator: selector => {
    assert.equal(selector, '[role="button"],button');
    return target;
  } });
  const snapshot = { comments: [], ui: { button: { text: 'View 65 replies', sameNameCount: 1, sameNameIndex: 0 } } };
  await collector.step({}, {}, 'down', snapshot);
  assert.deepEqual(events, ['Enter']);
  count = 2;
  assert.match((await collector.step({}, {}, 'down', snapshot)).error, /refresh before expanding/);
  count = 1; enabled = false;
  assert.match((await collector.step({}, {}, 'down', snapshot)).error, /refresh before expanding/);
  assert.deepEqual(events, ['Enter']);
});

test('literal expansion labels reject near matches and preserve multiline duplicate indices and disabled guards', async () => {
  const text = 'View (2)\nreplies';
  const dom = documentFor(`<button>View (2)\nreplies extra</button><button id="first"> ${text} </button>`
    + `<button>${text} Loading</button><button id="second">${text}</button>`);
  const tab = locatorTab(dom), collector = browser.createCollector({});
  collector.merge = async () => ({}); collector.observe = async () => '';
  const snapshot = { comments: [], ui: { button: { text, sameNameCount: 2, sameNameIndex: 1 } } };
  await collector.step(tab, {}, 'down', snapshot);
  assert.deepEqual(tab.events, [['second', 'Enter']]);
  dom.window.document.querySelector('#second').setAttribute('aria-disabled', 'true');
  assert.match((await collector.step(tab, {}, 'down', snapshot)).error, /refresh before expanding/);
  dom.window.document.querySelector('#first').textContent = 'A different expansion';
  assert.match((await collector.step(tab, {}, 'down', snapshot)).error, /refresh before expanding/);
  assert.deepEqual(tab.events, [['second', 'Enter']]);
  dom.window.close();
});

test('empty-thread End uses the exact observed literal ordering and refuses changed or disabled controls', async () => {
  const dom = documentFor('<button role="button" aria-haspopup="menu">All comments Loading</button>'
    + '<button role="button" aria-haspopup="menu" id="sort"> All comments </button>');
  const tab = locatorTab(dom), collector = browser.createCollector({});
  collector.merge = async () => ({}); collector.observe = async () => '';
  const snapshot = { comments: [], ordering: { text: 'All comments' }, ui: { button: null } };
  await collector.step(tab, {}, 'down', snapshot);
  assert.deepEqual(tab.events, [['sort', 'End']]);
  dom.window.document.querySelector('#sort').setAttribute('disabled', '');
  assert.match((await collector.step(tab, {}, 'down', snapshot)).error, /refresh before scrolling/);
  dom.window.document.querySelector('#sort').removeAttribute('disabled');
  dom.window.document.querySelector('#sort').insertAdjacentHTML('afterend',
    '<button role="button" aria-haspopup="menu">All comments</button>');
  assert.match((await collector.step(tab, {}, 'down', snapshot)).error, /refresh before scrolling/);
  snapshot.ordering.text = 'Unobserved arbitrary ordering';
  assert.match((await collector.step(tab, {}, 'down', snapshot)).error, /not grounded/);
  assert.deepEqual(tab.events, [['sort', 'End']]);
  dom.window.close();
});

test('loading waits use the observed literal disabled label and preserve timeout coverage', async () => {
  const label = 'View 2 replies Loading...';
  for (const timeout of [false, true]) {
    const collector = browser.createCollector({});
    collector.merge = async () => ({});
    let observations = 0;
    collector.observe = async () => observations++ ? '' : `button "${label}" [disabled]`;
    collector.controls = async () => ({
      locator: () => ({ last: () => ({ press: async () => {} }) }),
      getByRole(role, options) {
        assert.equal(role, 'button'); assert.equal(options.name, label); assert.equal(options.exact, true);
        return { first() { return this; }, async waitFor(options) {
          assert.deepEqual(options, { state: 'hidden', timeoutMs: 7000 });
          if (timeout) throw new Error('Still loading');
        } };
      },
    });
    const result = await collector.step({}, {}, 'down', { comments: [{ id: '1' }], ui: { button: null } });
    assert.equal(result.loadingTimedOut, timeout);
  }
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
