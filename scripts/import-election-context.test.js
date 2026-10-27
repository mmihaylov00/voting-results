const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeDemographics, normalizePolls, normalizeVoteFlows, importElectionContext } = require('./import-election-context');

const date = '2026.04.19';
const demographic = () => ({ election: '2026_04_19', parties: [{ partyNum: 1, nickName: 'Партия' }], rows: [{ metric: 'eduTertiary', rs: [0.5] }] });
const registry = [{ id: 'AR', name_bg: 'Агенция', website: 'https://example.com/' }];
const publications = [{ id: 'poll-1', agencyId: 'AR', electionDate: '2026-04-19', source: 'https://example.com/poll', fieldwork: 'Apr 13-15 2026', methodology: { bg: 'Интервю' } }];
const election = () => ({ electionDate: '2026-04-19', agencies: [{
  agencyId: 'AR', pollId: 'poll-1', fieldworkEnd: '2026-04-15', daysBefore: 4, respondents: 1000, mae: 1.5,
  normalization: { applied: false, redistributed: 0 },
  errors: [{ key: 'А', polled: 11, polledRaw: 11, actual: 10, error: 1 }, { key: 'Б', polled: 18, polledRaw: 18, actual: 20, error: -2 }],
}] });

test('validates the election and every demographic correlation before import', () => {
  assert.equal(normalizeDemographics(demographic(), date).rows[0].correlations[0], 0.5);
  for (const r of [NaN, Infinity, -1.01, 1.01]) {
    const data = demographic(); data.rows[0].rs[0] = r;
    assert.throws(() => normalizeDemographics(data, date), /correlation/);
  }
  assert.throws(() => normalizeDemographics(demographic(), '2024.10.27'), /Wrong demographic election/);
  const data = demographic(); data.rows[0].rs.push(0.1);
  assert.throws(() => normalizeDemographics(data, date), /correlation/);
});

test('keeps publication links, original values, sample and normalization metadata', () => {
  const result = normalizePolls(election(), registry, publications, date).agencies[0];
  assert.equal(result.sourceUrl, publications[0].source);
  assert.equal(result.respondents, 1000);
  assert.equal(result.daysBefore, 4);
  assert.equal(result.mae, 1.5);
  assert.equal(result.errors[0].published, 11);
  assert.equal(result.normalized, false);
});

test('deduplicates identical party rows before recomputing MAE', () => {
  const data = election();
  data.agencies[0].errors.push({ ...data.agencies[0].errors[0] });
  data.agencies[0].mae = 1.33;
  const result = normalizePolls(data, registry, publications, date).agencies[0];
  assert.equal(result.errors.length, 2);
  assert.equal(result.deduplicated, 1);
  assert.equal(result.mae, 1.5);
});

test('rejects conflicting rows, wrong dates, unsafe sources and inconsistent scoring', () => {
  const conflicting = election();
  conflicting.agencies[0].errors.push({ key: 'А', polled: 11.5, polledRaw: 11.5, actual: 10, error: 1.5 });
  assert.throws(() => normalizePolls(conflicting, registry, publications, date), /Conflicting/);
  const badDate = election(); badDate.agencies[0].fieldworkEnd = '2026-04-20';
  assert.throws(() => normalizePolls(badDate, registry, publications, date), /dates/);
  const badScore = election(); badScore.agencies[0].mae = 5;
  assert.throws(() => normalizePolls(badScore, registry, publications, date), /MAE/);
  assert.throws(() => normalizePolls(election(), registry, [{ ...publications[0], source: 'javascript:alert(1)' }], date), /publication/);
});

test('preserves existing snapshots if any download or validation fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'election-context-test-'));
  try {
    await fs.mkdir(path.join(root, 'src/assets'), { recursive: true });
    await fs.mkdir(path.join(root, 'public/data/context/polls'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/assets/elections.json'), JSON.stringify([{ date, type: 'governmental' }]));
    const existing = path.join(root, `public/data/context/polls/${date}.json`);
    await fs.writeFile(existing, 'existing');
    const fetcher = async url => {
      if (url.endsWith('/accuracy.json')) return new Response(JSON.stringify({ generatedAt: '2026-10-22T00:00:00Z', elections: [election()] }));
      if (url.endsWith('/agencies.json')) return new Response(JSON.stringify(registry));
      if (url.endsWith('/polls.json')) return new Response(JSON.stringify(publications));
      return new Response('unavailable', { status: 503 });
    };
    await assert.rejects(importElectionContext(root, fetcher), /HTTP 503/);
    assert.equal(await fs.readFile(existing, 'utf8'), 'existing');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('all committed snapshots contain unique scored parties and valid correlations', async () => {
  const root = path.join(__dirname, '../public/data/context');
  for (const file of await fs.readdir(path.join(root, 'polls'))) {
    const data = JSON.parse(await fs.readFile(path.join(root, 'polls', file), 'utf8'));
    for (const agency of data.agencies) {
      assert.equal(new Set(agency.errors.map(row => row.party)).size, agency.errors.length);
      const mae = agency.errors.reduce((sum, row) => sum + Math.abs(row.error), 0) / agency.errors.length;
      assert.ok(Math.abs(mae - agency.mae) < 0.011);
      assert.match(agency.sourceUrl, /^https?:\/\//);
    }
  }
  for (const file of await fs.readdir(path.join(root, 'demographics'))) {
    const data = JSON.parse(await fs.readFile(path.join(root, 'demographics', file), 'utf8'));
    assert.match(data.source.sha256, /^[a-f0-9]{64}$/);
    for (const row of data.rows) {
      assert.equal(row.correlations.length, data.parties.length);
      assert.ok(row.correlations.every(r => Number.isFinite(r) && Math.abs(r) <= 1));
    }
  }
});

const flow = () => ({
  from: '2024_10_27', to: '2026_04_19', scope: 'national',
  matrix: {
    fromNodes: [{ id: 'a', label: 'А', votes: 100 }, { id: '__abstain__', label: 'Не гласували', votes: 200, pseudo: true }],
    toNodes: [{ id: 'b', label: 'Б', votes: 300 }],
    flows: [{ from: 'a', to: 'b', votes: 80 }, { from: '__abstain__', to: 'b', votes: 210 }],
  },
  diagnostics: { sectionsMatched: 100, sectionsDropped: 2, rasResidual: 0.003 },
});

test('preserves estimated flows, matched coverage and imperfect model balancing', () => {
  const result = normalizeVoteFlows(flow(), date, '2024_10_27');
  assert.equal(result.from, '2024.10.27');
  assert.equal(result.sectionsMatched, 100);
  assert.equal(result.sectionsDropped, 2);
  assert.equal(result.maxNodeExcess, 0.05);
  assert.equal(result.flows[1].votes, 210);
  assert.equal(result.fromNodes[1].pseudo, true);
});

test('rejects wrong vote-flow pairs, negative estimates, orphan or duplicate links and invalid mass', () => {
  assert.throws(() => normalizeVoteFlows(flow(), date, '2023_04_02'), /pair/);
  for (const mutation of [
    data => { data.matrix.flows[0].votes = -1; },
    data => { data.matrix.flows[0].from = 'unknown'; },
    data => { data.matrix.flows.push({ ...data.matrix.flows[0] }); },
    data => { data.matrix.flows[0].votes = 1000; },
    data => { data.diagnostics.sectionsMatched = 0; },
  ]) {
    const data = flow(); mutation(data);
    assert.throws(() => normalizeVoteFlows(data, date, '2024_10_27'));
  }
});

test('every committed flow snapshot resolves its links and records its source and coverage', async () => {
  const root = path.join(__dirname, '../public/data/context/flows');
  for (const file of await fs.readdir(root)) {
    const data = JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
    const sources = new Set(data.fromNodes.map(node => node.id));
    const targets = new Set(data.toNodes.map(node => node.id));
    assert.ok(data.from < data.date);
    assert.ok(data.sectionsMatched > 0);
    assert.match(data.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(data.flows.every(link => sources.has(link.from) && targets.has(link.to) && link.votes > 0));
    assert.equal(new Set(data.flows.map(link => JSON.stringify([link.from, link.to]))).size, data.flows.length);
  }
});
