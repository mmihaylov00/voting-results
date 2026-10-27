const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {readFileWithHeaders} = require('./compile-data');

function* rows(file) {
  const {headers, body} = readFileWithHeaders(file);
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const values = line.split(';');
    yield Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
  }
}

function addVotes(expected, key, values, date) {
  const totals = expected.get(key) || [0, 0, 0];
  values.forEach((raw, i) => {
    const value = Number(raw || 0);
    assert(Number.isSafeInteger(value) && value >= 0, `${date}: invalid raw vote ${key}`);
    totals[i] += value;
  });
  expected.set(key, totals);
}

function checkVotes(sections, prefix, expected, date) {
  for (let i = 0; i < sections.count; i++) {
    for (let j = sections[`${prefix}Offset`][i]; j < sections[`${prefix}Offset`][i + 1]; j++) {
      const candidate = prefix === 'candidateVotes' ? `:${sections.candidateVotesCandidateId[j]}` : '';
      const key = `${sections.sectionId[i]}:${sections[`${prefix}PartyId`][j]}${candidate}`;
      const actual = ['Total', 'Paper', 'Machine'].map(field => sections[`${prefix}${field}`][j]);
      assert.deepEqual(actual, expected.get(key) || [0, 0, 0], `${date}: raw ${prefix} ${key}`);
      expected.delete(key);
    }
  }
  assert.equal(expected.size, 0, `${date}: missing compiled ${prefix}: ${expected.keys().next().value}`);
}

function verifyCompiledData(projectDir = path.join(__dirname, '..')) {
  const readJson = file => JSON.parse(fs.readFileSync(path.join(projectDir, file), 'utf8'));
  const catalog = readJson('src/assets/elections.json');
  const mapping = readJson('src/assets/compact-mapping.json');
  const manifest = readJson('public/data/compiled/manifest.json');
  const byDate = new Map(catalog.map(election => [election.date, election]));
  assert.equal(byDate.size, catalog.length, 'Duplicate catalog dates');
  assert.deepEqual(Object.keys(manifest.files).sort(), [...byDate.keys()].sort(), 'Manifest dates');
  const groups = {
    topParty: ['PartyId', 'Name', 'Total', 'PercentBp'],
    partyVotes: ['PartyId', 'Total', 'Paper', 'Machine'],
    candidateVotes: ['CandidateId', 'CandidateName', 'PartyId', 'Total', 'Paper', 'Machine'],
    risk: ['Code', 'Category', 'Severity', 'Details'],
    candidateRisk: ['Code', 'Category', 'Severity', 'Details'],
  };
  const regionFields = ['total', 'voted', 'discardedVotes', 'noVotes', 'totalPaper', 'totalMachine'];
  for (const election of catalog) {
    const {date} = election;
    const sourcePath = name => path.join(projectDir, 'public/data', date, `${name}.txt`);
    for (const name of ['sections', 'protocols', 'votes', 'cik_parties']) {
      assert(fs.existsSync(sourcePath(name)) || fs.existsSync(`${sourcePath(name)}.gz`), `${date}: missing source ${name}`);
    }
    const readPair = kind => {
      const files = manifest.files[date];
      const paths = ['Gz', 'Br'].map(extension => {
        const name = files[`${kind}${extension}`];
        assert(name && path.basename(name) === name, `${date}: invalid ${kind}${extension} filename`);
        return path.join(projectDir, 'public/data/compiled', name);
      });
      const gzip = zlib.gunzipSync(fs.readFileSync(paths[0]));
      assert(gzip.equals(zlib.brotliDecompressSync(fs.readFileSync(paths[1]))), `${date}: ${kind} gzip/Brotli differ`);
      return JSON.parse(gzip.toString('utf8'));
    };
    const summary = readPair('summary');
    const full = readPair('full');
    assert.equal(full.version, 2, `${date}: payload version`);
    assert.deepEqual(full.regions, summary.regions, `${date}: full/summary regions`);
    const parties = {'0': 'Други'};
    for (const row of rows(sourcePath('cik_parties'))) parties[row.partyId] = row.partyName;
    parties['0'] = 'Други';
    assert.deepEqual(full.parties, parties, `${date}: full party/candidate names`);
    assert.deepEqual(summary.parties, parties, `${date}: summary party/candidate names`);
    const sections = full.sections;
    const sourceSections = new Map([...rows(sourcePath('sections'))].map(row => [row.sectionId, row.regionId]));
    const ids = new Set(sourceSections.keys());
    assert.equal(sections.count, ids.size, `${date}: section count`);
    assert.deepEqual(new Set(sections.sectionId), ids, `${date}: section IDs`);
    const flattened = new Set();
    for (const [prefix, suffixes] of Object.entries(groups)) {
      const offsets = sections[`${prefix}Offset`];
      assert.equal(offsets.length, sections.count + 1, `${date}: ${prefix} offset count`);
      assert.equal(offsets[0], 0, `${date}: ${prefix} first offset`);
      offsets.forEach((offset, i) => assert(Number.isSafeInteger(offset) && offset >= 0 && (!i || offset >= offsets[i - 1]), `${date}: ${prefix} offset ${i}`));
      flattened.add(`${prefix}Offset`);
      for (const suffix of suffixes) {
        const name = `${prefix}${suffix}`;
        flattened.add(name);
        assert.equal(sections[name].length, offsets.at(-1), `${date}: ${name} length`);
      }
    }
    for (const [name, values] of Object.entries(sections)) {
      if (Array.isArray(values) && !flattened.has(name)) assert.equal(values.length, sections.count, `${date}: ${name} length`);
    }
    const rawVotes = new Map();
    const {headers, body} = readFileWithHeaders(sourcePath('votes'));
    const blocks = headers.flatMap((header, i) => header === 'partyId' ? [[i, ...['total', 'paper', 'machine'].map(field => headers.indexOf(field, i + 1))]] : []);
    assert(blocks.length, `${date}: missing raw ballot headers`);
    blocks.forEach((block, i) => assert(block.slice(1).every(index => index > block[0] && index < (blocks[i + 1]?.[0] ?? headers.length)), `${date}: malformed raw ballot headers`));
    const start = blocks[0][0];
    const stride = blocks.length > 1 ? blocks[1][0] - start : 4;
    const offsets = blocks[0].slice(1).map(index => index - start);
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const values = line.split(';').map(value => value.trim());
      const section = values[headers.indexOf('sectionId')];
      assert(ids.has(section), `${date}: raw votes for unknown section ${section}`);
      for (let block = start; block < values.length; block += stride) {
        if (!values[block]) continue;
        assert(offsets.every(offset => block + offset < values.length), `${date}: incomplete raw ballot block`);
        addVotes(rawVotes, `${section}:${values[block]}`, offsets.map(offset => values[block + offset]), date);
      }
    }
    checkVotes(sections, 'partyVotes', rawVotes, date);
    const exists = name => fs.existsSync(sourcePath(name)) || fs.existsSync(`${sourcePath(name)}.gz`);
    const localCandidates = exists('local_candidates') ? [...rows(sourcePath('local_candidates'))] : [];
    const localBallots = new Set(localCandidates.map(row => `${row.regionId}:${row.partyId}`));
    if (exists('local_candidates') && exists('preferences')) {
      const candidates = new Set(localCandidates.filter(row => row.candidateName).map(row => `${row.regionId}:${row.partyId}:${row.candidateId}`));
      const preferences = new Map();
      for (const row of rows(sourcePath('preferences'))) {
        const candidate = `${sourceSections.get(row.sectionId)}:${row.partyId}:${row.preference}`;
        if (!candidates.has(candidate) || !row.preference || row.preference === 'Без') continue;
        const paper = Number(row.paper || 0), machine = Number(row.machine || 0);
        if (paper + machine === 0) continue;
        addVotes(preferences, `${row.sectionId}:${row.partyId}:${row.preference}`, [paper + machine, paper, machine], date);
      }
      checkVotes(sections, 'candidateVotes', preferences, date);
    }
    if (election.type === 'presidential') {
      assert.equal(sections.candidateVotesCandidateId.length, 0, `${date}: presidential preferences`);
      assert.equal(sections.candidateRiskCode.length, 0, `${date}: presidential preference risks`);
    }
    const protocols = new Map([...rows(sourcePath('protocols'))].map(row => [row.sectionId, row]));
    const aggregates = new Map();
    for (let i = 0; i < sections.count; i++) {
      const row = protocols.get(sections.sectionId[i]);
      assert(row, `${date}: missing protocol ${sections.sectionId[i]}`);
      const number = name => {
        const value = Number(row[name] || 0);
        assert(Number.isSafeInteger(value) && value >= 0, `${date}: invalid protocol ${name}`);
        return value;
      };
      const expected = {
        total: number('totalA') + number('totalB'), voted: number('voted'), discardedVotes: number('discardedVotes'),
        noVotesPaper: number('noVotesPaper'), noVotesMachine: number('noVotesMachine'),
        totalPaper: number('protocolPaperVotes'), totalMachine: number('protocolMachineVotes'),
      };
      expected.noVotes = expected.noVotesPaper + expected.noVotesMachine;
      expected.protocolPaperVotes = expected.totalPaper;
      expected.protocolMachineVotes = expected.totalMachine;
      for (const [field, value] of Object.entries(expected)) assert.equal(sections[field][i], value, `${date}: ${sections.sectionId[i]} ${field}`);
      const regionId = sections.regionId[i];
      assert.equal(regionId, sourceSections.get(sections.sectionId[i]), `${date}: section region ${sections.sectionId[i]}`);
      if (!aggregates.has(regionId)) aggregates.set(regionId, {...Object.fromEntries(regionFields.map(field => [field, 0])), partyVotes: {}});
      const aggregate = aggregates.get(regionId);
      for (const field of regionFields) aggregate[field] += sections[field][i];
      for (let j = sections.partyVotesOffset[i]; j < sections.partyVotesOffset[i + 1]; j++) {
        const party = sections.partyVotesPartyId[j];
        assert(parties[party] || localBallots.has(`${regionId}:${party}`), `${date}: unknown ballot ${party}`);
        aggregate.partyVotes[party] = (aggregate.partyVotes[party] || 0) + sections.partyVotesTotal[j];
      }
    }
    assert.equal(summary.regions.length, aggregates.size, `${date}: region count`);
    for (const region of summary.regions) {
      const aggregate = aggregates.get(region.id);
      assert(aggregate, `${date}: unknown region ${region.id}`);
      for (const field of regionFields) assert.equal(region[mapping.region[field]], aggregate[field], `${date}: region ${region.id} ${field}`);
      assert.deepEqual(region.partyVotes, aggregate.partyVotes, `${date}: region ${region.id} ballot totals`);
      for (const comparisons of Object.values(region.comparisons || {})) {
        assert(Array.isArray(comparisons), `${date}: region comparison array`);
        for (const comparison of comparisons) assert(comparison.d !== date && byDate.get(comparison.d)?.type === election.type, `${date}: comparison across election types: ${comparison.d}`);
      }
    }
    if (election.provisional) {
      const metadata = election.provisional;
      const source = JSON.parse(fs.readFileSync(path.join(projectDir, 'public/data', date, 'source-results.json'), 'utf8'));
      assert.equal(metadata.sourceUrl, source.sourceUrl, `${date}: provisional source URL`);
      assert.equal(metadata.updatedAt, source.national.updatedAt, `${date}: provisional source timestamp`);
      assert.equal(metadata.processedPercent, source.national.processedPercent, `${date}: provisional coverage`);
      assert.equal(metadata.reportedSections, sections.count, `${date}: reported section count`);
      assert.equal(metadata.totalSections - sections.count, source.unprocessedSections.length, `${date}: unprocessed section count`);
      assert.equal(new Set(source.unprocessedSections).size, source.unprocessedSections.length, `${date}: duplicate unprocessed sections`);
      for (const id of source.unprocessedSections) assert(!ids.has(id), `${date}: unprocessed section assigned results: ${id}`);
      const nationalVotes = {};
      let noVotes = 0;
      for (const region of summary.regions) {
        assert.equal(source.regions[region.id].updatedAt, metadata.updatedAt, `${date}: regional snapshot timestamp`);
        assert.deepEqual(region.partyVotes, source.regions[region.id].votes, `${date}: published regional candidate votes`);
        assert.equal(region[mapping.region.noVotes], source.regions[region.id].noVotes, `${date}: published regional no-support votes`);
        noVotes += region[mapping.region.noVotes];
        for (const [party, votes] of Object.entries(region.partyVotes)) nationalVotes[party] = (nationalVotes[party] || 0) + votes;
      }
      assert.deepEqual(nationalVotes, source.national.votes, `${date}: published national candidate votes`);
      assert.equal(noVotes, source.national.noVotes, `${date}: published national no-support votes`);
    }
    console.log(`${date} ${election.type}: ${sections.count} sections, ${sections.voted.reduce((sum, value) => sum + value, 0)} voted - OK`);
  }
}

if (require.main === module) verifyCompiledData();
module.exports = {verifyCompiledData};
