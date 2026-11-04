const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('the directory preserves the original election sample without adding discovered Pages or posts', () => {
  const originalPageIds = [
    '100069720181353', '138363261435366', '61583481685886', '61577398061794',
    '104575425050525', 'https://www.facebook.com/n.barekov',
    'https://www.facebook.com/noviniotposledniachas', 'https://www.facebook.com/novininafocus',
    '61591476950404', '100063562561986', '61594146398840', '61578385640569',
    '100030791183325', '61557839147130', '61594398383441', '100050258929386',
    '61595732886875', '100083137130737', '61572252076131',
  ];
  const sampleEntries = entries.filter(entry => entry.status === 'in-sample');
  assert.equal(report.pages.length, 19);
  assert.equal(report.posts.length, 97);
  assert.equal(report.collectionPostCount, 83);
  assert.equal(sampleEntries.length, originalPageIds.length);
  assert.deepEqual(new Set(report.pages.map(page => page.id)), new Set(originalPageIds));
  assert.deepEqual(new Set(sampleEntries.map(entry => entry.samplePageId)), new Set(originalPageIds));
  for (const page of report.pages) {
    const entry = sampleEntries.find(row => row.samplePageId === page.id);
    assert.equal(entry.name, page.name);
    assert.equal(facebookIdentity(entry.facebookUrl), facebookIdentity(page.url));
  }
  for (const post of report.posts) assert(originalPageIds.includes(post.pageId));
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
