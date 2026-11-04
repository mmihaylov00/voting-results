const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'public/data/facebook/2026/report.json'), 'utf8'));
const directory = path.join(root, 'public/images/facebook/2026');
const sources = JSON.parse(fs.readFileSync(path.join(directory, 'SOURCES.json'), 'utf8'));
const discoveries = JSON.parse(fs.readFileSync(path.join(root, 'public/data/facebook/2026/DISCOVERY.json'), 'utf8'));

test('every Facebook image resolves to a retained asset with its own public source and hash', () => {
  const uses = [...report.pages.map(page => ({ id: 'page:' + page.id, url: page.url, images: page.avatar ? [page.avatar] : [] })),
    ...report.posts.map(post => ({ id: post.id, url: post.url, images: post.images ?? [] }))];
  const referenced = new Set();
  for (const row of uses) for (const image of row.images) {
    assert.equal(image.sourceUrl, row.url);
    assert.equal(new URL(image.sourceUrl).hostname, 'www.facebook.com');
    assert.match(image.src, /^\/images\/facebook\/2026\/[a-f0-9]{64}\.(jpg|avif)$/);
    const name = path.basename(image.src);
    const content = fs.readFileSync(path.join(directory, name));
    assert.equal(createHash('sha256').update(content).digest('hex'), image.sha256);
    assert.equal(name.split('.')[0], image.sha256);
    assert.deepEqual([sources.assets[name].width, sources.assets[name].height], [image.width, image.height]);
    assert(sources.assets[name].uses.some(use => use.id === row.id && use.sourceUrl === row.url && use.kind === image.kind));
    referenced.add(name);
  }
  assert(report.pages.filter(page => page.avatar).length >= 19);
  assert(report.posts.filter(post => post.images?.length).length >= 92);
  assert.equal(Object.keys(sources.assets).length, referenced.size);
  assert.deepEqual(new Set(fs.readdirSync(directory).filter(name => name !== 'SOURCES.json')), referenced);
});

test('new public Page and post evidence resolves to the published sources, dates and caption hashes', () => {
  assert.equal(discoveries.pages.length, 9);
  assert.equal(discoveries.posts.length, 11);
  assert.match(discoveries.captureSha256, /^[a-f0-9]{64}$/);
  for (const page of discoveries.pages) {
    const published = report.pages.find(row => row.id === page.id);
    assert(published);
    assert.equal(published.url, page.url);
    assert.equal(published.name, page.name);
    assert(page.identityEvidence.length > 0);
    assert(report.posts.some(post => post.pageId === page.id));
  }
  for (const record of discoveries.posts) {
    const published = report.posts.find(row => row.id === record.id);
    assert(published);
    assert.equal(published.url, record.url);
    assert.equal(published.pageId, record.pageId);
    assert.equal(published.publishedAt, record.publishedAt);
    assert.match(published.date, /^2026-10-/);
    assert.equal(published.sourceTextSha256, record.sourceTextSha256);
    assert.equal(published.stance.sourceTextSha256, record.sourceTextSha256);
    assert.deepEqual(published.platformLabels, record.platformLabels);
  }
  assert(!JSON.stringify(discoveries).includes('/Users/'));
  assert(!JSON.stringify(discoveries).includes('fbcdn.net'));
});
