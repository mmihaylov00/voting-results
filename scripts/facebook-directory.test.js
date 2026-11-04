const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const report = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../public/data/facebook/2026/report.json'), 'utf8',
));
const entries = report.directory.entries;

function facebookIdentity(value) {
  if (/^\d+$/.test(value)) return 'id:' + value;
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'www.facebook.com');
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
  const id = url.searchParams.get('id')
    || pathname.match(/(?:^|\/)(\d+)$/)?.[1]
    || pathname.match(/-(\d+)$/)?.[1];
  return id ? 'id:' + id : 'handle:' + pathname.toLowerCase();
}

test('directory records have unique entry IDs and canonical Facebook identities', () => {
  const entryIds = new Set();
  const identities = new Map();
  for (const entry of entries) {
    assert(!entryIds.has(entry.id), 'Duplicate entry ID: ' + entry.id);
    entryIds.add(entry.id);
    const keys = new Set([entry.facebookUrl, entry.samplePageId]
      .filter(Boolean).map(facebookIdentity));
    for (const key of keys) {
      assert(!identities.has(key), `${key} is shared by ${identities.get(key)} and ${entry.id}`);
      identities.set(key, entry.id);
    }
  }
});

test('the directory preserves the original sample and links every collected Page without counting unchecked leads', () => {
  const originalPageIds = [
    '100069720181353', '138363261435366', '61583481685886', '61577398061794',
    '104575425050525', 'https://www.facebook.com/n.barekov',
    'https://www.facebook.com/noviniotposledniachas', 'https://www.facebook.com/novininafocus',
    '61591476950404', '100063562561986', '61594146398840', '61578385640569',
    '100030791183325', '61557839147130', '61594398383441', '100050258929386',
    '61595732886875', '100083137130737', '61572252076131',
  ];
  const sampleEntries = entries.filter(entry => entry.status === 'in-sample');
  const hash = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  assert.equal(hash(report.pages.slice(0, 19)), 'd60b42a6b83eea0b833cd864c2270cdf4e32448ba3d1539429ce73a085dc3708');
  assert.equal(hash(report.posts.slice(0, 97)), 'bdc603e46def7278cf6e5c4d4b7d6d376ac9e6a852fd0aa2f418a93b178341f6');
  assert.equal(report.collectionPostCount, report.posts.filter(post => post.origin === 'collection').length);
  assert.equal(sampleEntries.length, report.pages.length);
  assert.deepEqual(new Set(report.pages.slice(0, 19).map(page => page.id)), new Set(originalPageIds));
  assert.deepEqual(new Set(sampleEntries.map(entry => entry.samplePageId)), new Set(report.pages.map(page => page.id)));
  for (const page of report.pages) {
    const entry = sampleEntries.find(row => row.samplePageId === page.id);
    assert.equal(entry.name, page.name);
    assert.equal(facebookIdentity(entry.facebookUrl), facebookIdentity(page.url));
  }
  for (const post of report.posts) assert(report.pages.some(page => page.id === post.pageId));
  for (const entry of entries.filter(entry => entry.status !== 'in-sample')) {
    assert.equal(entry.samplePageId, null);
  }
});

test('regional directory tags retain geographic labels and public source links', () => {
  for (const entry of entries.filter(entry => entry.regional === true)) {
    assert(entry.regions.length > 0, entry.id + ' has no region');
    assert(entry.regions.every(region => typeof region === 'string' && region.trim()));
    assert(entry.coverage.trim() && entry.coverage !== 'Неуточнен', entry.id + ' has no coverage');
    assert(entry.sources.length > 0, entry.id + ' has no geographic source');
    for (const source of entry.sources) {
      assert(['https:', 'http:'].includes(new URL(source.url).protocol), entry.id);
      assert(source.note.trim(), entry.id + ' has an undocumented source');
    }
  }
});

test('original supplied Facebook links remain available alongside publisher-linked addresses', () => {
  for (const [id, handle] of [['publisher-vestnik-struma', 'vestnik.struma'], ['publisher-dir', 'dir.bg']]) {
    const entry = entries.find(entry => entry.id === id);
    const suppliedUrl = `https://www.facebook.com/${handle}`;
    assert.notEqual(entry.facebookUrl, suppliedUrl);
    assert(entry.sources.some(source => source.url === suppliedUrl && source.note.includes('не е потвърдена')));
  }
});

test('similarly named publishers and supplied slash pairs retain distinct identities', () => {
  const pairs = [
    ['publisher-dnes', 'www.dnes.bg', 'publisher-yantra-dnes', 'www.dnesbg.com'],
    ['publisher-krakra', 'krakra.tv', 'publisher-mirogled', 'mirogled.com'],
    ['publisher-pz-news', 'pz-news.bg', 'publisher-pzdnes', 'pzdnes.com'],
    ['publisher-cherno-more', 'www.chernomore.bg', 'publisher-moreto', 'www.moreto.net'],
    ['publisher-p-news', 'p-news.eu', 'publisher-pirin-press', 'pirinpress.com'],
  ];
  for (const [leftId, leftHost, rightId, rightHost] of pairs) {
    const left = entries.find(entry => entry.id === leftId);
    const right = entries.find(entry => entry.id === rightId);
    assert(left && right, `${leftId} and ${rightId} must both be retained`);
    assert.notEqual(left.id, right.id);
    assert.equal(new URL(left.websiteUrl).hostname, leftHost);
    assert.equal(new URL(right.websiteUrl).hostname, rightHost);
  }
});

test('generic city search leads remain distinct from the broader supplied names', () => {
  for (const base of ['Новини Без Цензура', 'Независими Новини']) {
    const names = [base, ...['Варна', 'Пловдив', 'Бургас', 'Русе'].map(city => `${base} - ${city}`)];
    const leads = names.map(name => entries.filter(entry => entry.name === name || entry.aliases.includes(name)));
    for (const [index, matches] of leads.entries()) {
      assert.equal(matches.length, 1, names[index] + ' must have its own directory record');
    }
    assert.equal(new Set(leads.map(matches => matches[0].id)).size, names.length);
  }
});

test('catalog additions retain public provenance and explicitly partial collection coverage', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname,
    '../public/data/facebook/2026/CATALOG-COLLECTION.json'), 'utf8'));
  const posts = new Map(report.posts.map(post => [post.id, post]));
  const originalPages = new Set(report.pages.slice(0, 19).map(page => page.id));
  assert.equal(manifest.period, report.period);
  assert.equal(manifest.originalCollectionSha256, report.collectionSha256);
  assert(manifest.posts.length > 0);
  assert.equal(new Set(manifest.posts.map(post => post.id)).size, manifest.posts.length);
  assert.deepEqual(new Set(manifest.posts.map(post => post.id)),
    new Set(report.posts.slice(97).filter(post => post.origin === 'collection').map(post => post.id)));
  for (const record of manifest.posts) {
    const post = posts.get(record.id);
    assert(post, record.id);
    assert.equal(post.origin, 'collection');
    for (const [source, target] of [['pageId', 'pageId'], ['url', 'url'], ['date', 'date'],
      ['publishedAt', 'publishedAt'], ['sourceTextSha256', 'sourceTextSha256'], ['capturedAt', 'collectedAt']]) {
      assert.equal(record[source], post[target], record.id + ': ' + source);
    }
    assert.deepEqual(record.interval, post.interval);
    assert(record.dateEvidence.trim() && record.politicalReason.trim(), record.id);
    assert(record.directoryEntryIds.every(id => entries.some(entry => entry.id === id)));
    if (!post.excerpt) assert(post.images?.length || post.linkHeadline, record.id);
    assert((post.excerpt + ' ' + (post.linkHeadline ?? '')).trim().split(/\s+/).filter(Boolean).length <= 24,
      record.id + ' has an oversized public excerpt');
  }
  for (const page of manifest.pages) {
    assert(report.pages.some(row => row.id === page.id && row.url === page.url));
    assert(page.identityEvidence.length > 0);
    if (!originalPages.has(page.id)) {
      assert(page.identityEvidence.some(source => source.note.includes('Report Page')), page.id);
    }
  }
  assert.equal(new Set(manifest.coverage.map(row => row.targetKey)).size, manifest.coverage.length);
  for (const row of manifest.coverage) {
    assert(['partial', 'unavailable', 'excluded'].includes(row.status));
    assert.equal(row.monthComplete, false);
    assert.equal(row.postsAdded, manifest.posts.filter(post => post.targetKey === row.targetKey).length);
    assert(row.postsCaptured >= row.postsAdded);
    assert(row.notes.length && row.notes.every(note => note.trim()));
  }
  for (const review of manifest.duplicateReviews) {
    assert(posts.has(review.existingPostId));
    assert.equal(review.resolution, 'held-possible-alias');
    assert(!report.posts.some(post => post.url === review.observedUrl));
  }
  assert.doesNotMatch(JSON.stringify(manifest), /\/Users\/|\/var\/folders\/|fbcdn\.net|__cft__/);
});
