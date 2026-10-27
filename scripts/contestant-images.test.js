const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const images = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/contestant-images.json'), 'utf8'));
const normalize = name => name.normalize('NFC').toLocaleUpperCase('bg')
  .replace(/[\u2013\u2014]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();

test('profile images are local files with source and attribution metadata', () => {
  const ids = new Set();
  for (const image of images) {
    assert.ok(!ids.has(image.id), `Duplicate image identity: ${image.id}`);
    ids.add(image.id);
    assert.ok(['governmental', 'presidential'].includes(image.type), image.id);
    assert.ok(image.names.length > 0 && image.names.every(name => name.trim()), image.id);
    assert.match(image.src, /^\/images\/contestants\/[\w-]+\.(?:svg|png|jpg|webp)$/);
    const bytes = fs.readFileSync(path.join(root, 'public', image.src));
    assert.ok(bytes.length > 0, image.src);
    assert.ok(image.alt && image.author && image.license, `Missing credits: ${image.id}`);
    assert.equal(new URL(image.sourceUrl).protocol, 'https:');
    assert.equal(new URL(image.licenseUrl).protocol, 'https:');
    if (image.src.endsWith('.svg')) {
      const svg = bytes.toString('utf8');
      assert.match(svg, /<svg\b/i);
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i, image.src);
    } else if (image.src.endsWith('.jpg')) {
      assert.equal(bytes.readUInt16BE(0), 0xffd8, image.src);
    } else if (image.src.endsWith('.png')) {
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG', image.src);
    }
  }
});

test('every national top-five appearance in the compiled archive has an image', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/assets/elections.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/compiled/manifest.json'), 'utf8'));
  for (const election of catalog) {
    const file = manifest.files[election.date].summaryGz;
    const summary = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'public/data/compiled', file))));
    const totals = new Map();
    for (const region of summary.regions) {
      for (const [id, votes] of Object.entries(region.partyVotes)) {
        if (id !== '0' && id !== 'no_votes') totals.set(id, (totals.get(id) ?? 0) + votes);
      }
    }
    const ranked = [...totals].sort((left, right) => right[1] - left[1]);
    const fifth = ranked[Math.min(4, ranked.length - 1)]?.[1];
    for (const [id, votes] of ranked) {
      if (votes < fifth) continue;
      const fullName = summary.parties[id];
      assert.ok(fullName, `Unnamed top-five ballot ${id} in ${election.date}`);
      const name = election.type === 'presidential' ? fullName.split(/\s+и\s+/u)[0] : fullName;
      assert.ok(images.some(image => image.type === election.type && image.names.some(alias => normalize(alias) === normalize(name))),
        `Missing image: ${election.date} - ${fullName}`);
    }
  }
});
