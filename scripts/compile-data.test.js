const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {readFileWithHeaders, comparableDates, candidateIdentity, compilationElections} = require('./compile-data');

test('a single-date compile loads only matching election history and rejects unknown dates', () => {
  const catalog = [
    {date: '2026.10.25', type: 'presidential'},
    {date: '2026.04.19', type: 'governmental'},
    {date: '2021.11.14', type: 'presidential'},
  ];
  assert.deepEqual(compilationElections(catalog, '2026.10.25'), [catalog[0], catalog[2]]);
  assert.equal(compilationElections(catalog), catalog);
  assert.throws(() => compilationElections(catalog, '2026.10.26'), /Unknown election/);
});

test('historical preference identities follow names instead of recycled ballot numbers', () => {
  const current = {partyName: 'ГЕРБ-СДС', candidateName: 'Иван Иванов', partyId: '18', candidateId: '101'};
  const previous = {partyName: 'ГЕРБ', candidateName: 'ИВАН ИВАНОВ', partyId: '2', candidateId: '108'};
  assert.equal(candidateIdentity(current), candidateIdentity(previous));
  assert.notEqual(candidateIdentity(current), candidateIdentity({...current, candidateName: 'Петър Петров'}));
  assert.notEqual(candidateIdentity(current), candidateIdentity({...current, partyName: 'БСП'}));
});

test('comparisons stay within an election type and risk history uses only earlier matching rounds', () => {
  const catalog = [
    {date: '2021.11.21', type: 'presidential', round: 2},
    {date: '2022.10.02', type: 'governmental'},
    {date: '2021.11.14', type: 'presidential', round: 1},
    {date: '2016.11.13', type: 'presidential', round: 2},
    {date: '2016.11.06', type: 'presidential', round: 1},
    {date: '2021.07.11', type: 'governmental'},
  ];
  assert.deepEqual(comparableDates(catalog, '2021.11.14'), ['2021.11.21', '2016.11.13', '2016.11.06']);
  assert.deepEqual(comparableDates(catalog, '2021.11.14', true), ['2016.11.06']);
  assert.deepEqual(comparableDates(catalog, '2021.07.11', true), []);
  assert.deepEqual(comparableDates(catalog, '2022.10.02', true), ['2021.07.11']);
  assert.throws(() => comparableDates(catalog, '2026.10.01'), /Unknown election/);
  assert.deepEqual(comparableDates([
    ...catalog, {date: '2026.10.25', type: 'presidential', round: 1, provisional: {}},
  ], '2021.11.14'), comparableDates(catalog, '2021.11.14'));
});

test('compressed canonical files parse identically and missing input fails', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'election-compiler-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'votes.txt');
  const contents = 'sectionId;partyId;total;paper;machine\r\n010001;1;15;10;5\r\n';
  fs.writeFileSync(file, contents);
  const plain = readFileWithHeaders(file);
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(contents));
  fs.unlinkSync(file);
  assert.deepEqual(readFileWithHeaders(file), plain);
  assert.deepEqual(plain.headers, ['sectionId', 'partyId', 'total', 'paper', 'machine']);
  fs.unlinkSync(`${file}.gz`);
  assert.throws(() => readFileWithHeaders(file), /ENOENT/);
});
