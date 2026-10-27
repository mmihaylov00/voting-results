const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const zlib = require('node:zlib');
const {importShtaboData} = require('./import-shtabo-data');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'shtabo-import-'));
  t.after(() => fs.rmSync(temporary, {recursive: true, force: true}));
  const source = path.join(temporary, 'BG');
  const project = path.join(temporary, 'site');
  const catalog = path.join(project, 'src/assets/elections.json');
  fs.mkdirSync(path.dirname(catalog), {recursive: true});
  fs.mkdirSync(path.join(project, 'public/data/2024.10.27'), {recursive: true});
  fs.writeFileSync(path.join(project, 'public/data/2024.10.27/votes.txt'), 'preserve existing data');
  fs.writeFileSync(catalog, JSON.stringify([{date: '2024.10.27', name: 'Октомври 2024'}]));
  const manifest = {country: 'BG', elections: [
    {date: '2022-10-02', type: 'PARLIAMENTARY', title: 'Октомври 2022', folder: '2022.10.02'},
    {date: '2016-11-06', type: 'PRESIDENTIAL', title: 'Ноември 2016', rounds: [
      {date: '2016-11-06', roundNumber: 1, title: 'Тур 1', folder: 'presidential/tur1'},
      {date: '2016-11-13', roundNumber: 2, title: 'Тур 2', folder: 'presidential/tur2'},
    ]},
    {date: '2022-10-02', type: 'EUROPEAN', folder: 'not-imported'},
  ]};
  const headers = {
    sections: 'sectionId;regionId;regionName;municipalityId;cityName;sectionName',
    protocols: 'sectionId;totalA;totalB;voted;discardedVotes;noVotesPaper;noVotesMachine;protocolPaperVotes;protocolMachineVotes',
    votes: 'sectionId;partyId;total;paper;machine',
    cik_parties: 'partyId;partyName',
  };
  for (const folder of ['2022.10.02', 'presidential/tur1', 'presidential/tur2']) {
    fs.mkdirSync(path.join(source, folder), {recursive: true});
    for (const [name, header] of Object.entries(headers)) {
      fs.writeFileSync(path.join(source, folder, `${name}.txt.gz`), zlib.gzipSync(`${header}\r\n1;2;3;4;5;6;7;8;9\r\n`));
    }
    fs.writeFileSync(path.join(source, folder, 'SOURCE.md'), 'Official archive provenance');
  }
  fs.writeFileSync(path.join(source, '2022.10.02/local_candidates.txt.gz'), zlib.gzipSync('regionId;partyId;candidateId;candidateName\n1;2;101;Name\n'));
  fs.writeFileSync(path.join(source, '2022.10.02/preferences.txt.gz'), zlib.gzipSync('sectionId;partyId;preference;paper;machine\n1;2;101;3;4\n'));
  const saveManifest = () => fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify(manifest));
  saveManifest();
  return {source, project, catalog, manifest, saveManifest};
}

test('imports actual round dates, preserves existing data and can run twice', t => {
  const f = fixture(t);
  assert.equal(importShtaboData(f.source, f.project).length, 3);
  const catalog = JSON.parse(fs.readFileSync(f.catalog, 'utf8'));
  assert.deepEqual(catalog.map(e => [e.date, e.type, e.round]), [
    ['2024.10.27', 'governmental', undefined], ['2022.10.02', 'governmental', undefined],
    ['2016.11.13', 'presidential', 2], ['2016.11.06', 'presidential', 1],
  ]);
  assert.equal(fs.readFileSync(path.join(f.project, 'public/data/2024.10.27/votes.txt'), 'utf8'), 'preserve existing data');
  assert.equal(fs.readFileSync(path.join(f.project, 'public/data/2016.11.13/SOURCE.md'), 'utf8'), 'Official archive provenance');
  assert.deepEqual(fs.readFileSync(path.join(f.project, 'public/data/2022.10.02/preferences.txt.gz')), fs.readFileSync(path.join(f.source, '2022.10.02/preferences.txt.gz')));
  fs.writeFileSync(path.join(f.project, 'public/data/2016.11.13/protocols.txt.gz'), 'preserve later source corrections');
  assert.deepEqual(importShtaboData(f.source, f.project), []);
  assert.equal(fs.readFileSync(path.join(f.project, 'public/data/2016.11.13/protocols.txt.gz'), 'utf8'), 'preserve later source corrections');
});

test('rejects invalid headers before copying any data or changing the catalog', t => {
  const f = fixture(t);
  const before = fs.readFileSync(f.catalog, 'utf8');
  fs.writeFileSync(path.join(f.source, 'presidential/tur2/votes.txt.gz'), zlib.gzipSync('wrong;headers\n1;2\n'));
  assert.throws(() => importShtaboData(f.source, f.project), /Invalid canonical headers/);
  assert.equal(fs.readFileSync(f.catalog, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(f.project, 'public/data')), ['2024.10.27']);
});

test('rejects source traversal and duplicate dates or folders', t => {
  const f = fixture(t);
  f.manifest.elections[0].folder = '../BG/2022.10.02';
  f.saveManifest();
  assert.throws(() => importShtaboData(f.source, f.project), /Unsafe source folder/);
  f.manifest.elections[0].folder = '2022.10.02';
  f.manifest.elections.push({...f.manifest.elections[0]});
  f.saveManifest();
  assert.throws(() => importShtaboData(f.source, f.project), /Duplicate source date or folder/);
  f.manifest.elections.at(-1).date = '2021-07-11';
  f.saveManifest();
  assert.throws(() => importShtaboData(f.source, f.project), /Duplicate source date or folder/);
});

test('requires a source and manifest and rejects duplicate catalog dates', t => {
  assert.throws(() => importShtaboData(), /Usage:/);
  const f = fixture(t);
  fs.unlinkSync(path.join(f.source, 'manifest.json'));
  assert.throws(() => importShtaboData(f.source, f.project), /ENOENT/);
  f.saveManifest();
  fs.writeFileSync(f.catalog, JSON.stringify([{date: '2024.10.27'}, {date: '2024.10.27'}]));
  assert.throws(() => importShtaboData(f.source, f.project), /duplicate catalog date/);
});
