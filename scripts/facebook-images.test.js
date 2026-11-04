const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'public/data/facebook/2026/report.json'), 'utf8'));
const directory = path.join(root, 'public/images/facebook/2026');
const sources = JSON.parse(fs.readFileSync(path.join(directory, 'SOURCES.json'), 'utf8'));

test('every Facebook image resolves to a retained asset with its own public source and hash', () => {
  const uses = [...report.pages.map(page => ({ id: 'page:' + page.id, url: page.url, images: [page.avatar] })),
    ...report.posts.map(post => ({ id: post.id, url: post.url, images: post.images }))];
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
  assert.equal(report.pages.filter(page => page.avatar).length, 10);
  assert.equal(report.posts.filter(post => post.images.length).length, 81);
  assert.equal(Object.keys(sources.assets).length, referenced.size);
  assert.deepEqual(new Set(fs.readdirSync(directory).filter(name => name !== 'SOURCES.json')), referenced);
});
