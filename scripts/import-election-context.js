const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DATA_ORIGIN = 'https://storage.googleapis.com/data-electionsbg-com';
const REPOSITORY = 'https://github.com/atanasster/electionsbg';
const METRICS = new Set(['ethnicBulgarian', 'ethnicTurkish', 'ethnicRoma', 'religionChristian', 'religionMuslim', 'religionNoneOrUndecl', 'eduTertiary', 'eduSecondary', 'eduPrimaryOrLower', 'ageUnder15', 'age15_29', 'age30_44', 'age45_64', 'age65plus', 'genderFemale', 'employmentRate', 'unemploymentRate', 'activityRate']);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

const percentage = value => Number.isFinite(value) && value >= 0 && value <= 100;
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const httpUrl = value => typeof value === 'string' && /^https?:\/\//.test(value) && (() => {
  try { const url = new URL(value); return !url.username && !url.password; } catch { return false; }
})();

function normalizeDemographics(data, date) {
  requireValue(data?.election === date.replaceAll('.', '_'), `Wrong demographic election: ${date}`);
  requireValue(Array.isArray(data.parties) && data.parties.length > 0 && Array.isArray(data.rows) && data.rows.length > 0, `Missing demographics: ${date}`);
  const parties = data.parties.map(party => {
    requireValue(Number.isSafeInteger(party.partyNum) && party.partyNum > 0 && typeof party.nickName === 'string' && party.nickName.trim(), 'Invalid demographic party');
    return { id: String(party.partyNum), name: party.nickName };
  });
  requireValue(new Set(parties.map(party => party.id)).size === parties.length, 'Duplicate demographic party');
  const rows = data.rows.map(row => {
    requireValue(METRICS.has(row.metric) && Array.isArray(row.rs) && row.rs.length === parties.length
      && row.rs.every(r => Number.isFinite(r) && r >= -1 && r <= 1), 'Invalid demographic correlation');
    return { metric: row.metric, correlations: row.rs };
  });
  requireValue(new Set(rows.map(row => row.metric)).size === rows.length, 'Duplicate demographic metric');
  return { date, parties, rows };
}

function normalizePolls(election, agencies, polls, date) {
  requireValue(election?.electionDate === date.replaceAll('.', '-') && Array.isArray(election.agencies), `Missing polling coverage: ${date}`);
  const registry = new Map(agencies.map(agency => [agency.id, agency]));
  const publications = new Map(polls.map(poll => [poll.id, poll]));
  const rows = election.agencies.map(entry => {
    const agency = registry.get(entry.agencyId);
    const poll = publications.get(entry.pollId);
    requireValue(agency && typeof agency.name_bg === 'string' && poll?.agencyId === agency.id
      && poll.electionDate === election.electionDate && httpUrl(poll.source), 'Missing polling publication');
    requireValue(isoDate(entry.fieldworkEnd) && entry.fieldworkEnd <= election.electionDate
      && entry.daysBefore === (Date.parse(election.electionDate) - Date.parse(entry.fieldworkEnd)) / 86400000, 'Invalid polling dates');
    requireValue(entry.respondents === null || Number.isSafeInteger(entry.respondents) && entry.respondents > 0, 'Invalid polling sample');
    requireValue(Array.isArray(entry.errors) && entry.errors.length > 0 && percentage(entry.mae), 'Invalid polling accuracy');
    const comparisons = entry.errors.map(error => {
      requireValue(typeof error.key === 'string' && error.key.trim() && percentage(error.polled) && percentage(error.polledRaw) && percentage(error.actual)
        && Number.isFinite(error.error) && Math.abs(error.polled - error.actual - error.error) < 0.021, 'Invalid polling comparison');
      return { party: error.key, polled: error.polled, published: error.polledRaw, actual: error.actual, error: error.error };
    });
    requireValue(Math.abs(comparisons.reduce((sum, error) => sum + Math.abs(error.error), 0) / comparisons.length - entry.mae) < 0.011, 'Polling MAE does not match its comparisons');
    const unique = new Map();
    for (const comparison of comparisons) {
      const previous = unique.get(comparison.party);
      requireValue(!previous || JSON.stringify(previous) === JSON.stringify(comparison), 'Conflicting polling party rows');
      unique.set(comparison.party, comparison);
    }
    const errors = [...unique.values()];
    const mae = Math.round(errors.reduce((sum, error) => sum + Math.abs(error.error), 0) / errors.length * 100) / 100;
    requireValue(typeof entry.normalization?.applied === 'boolean' && percentage(entry.normalization.redistributed), 'Invalid polling normalization');
    return {
      id: agency.id, name: agency.name_bg, website: httpUrl(agency.website) ? agency.website : null,
      pollId: entry.pollId, sourceUrl: poll.source, fieldwork: poll.fieldwork, fieldworkEnd: entry.fieldworkEnd,
      daysBefore: entry.daysBefore, respondents: entry.respondents, mae, deduplicated: comparisons.length - errors.length,
      normalized: entry.normalization.applied, redistributed: entry.normalization.redistributed,
      methodology: typeof poll.methodology?.bg === 'string' && poll.methodology.bg !== 'N/A' ? poll.methodology.bg : null,
      errors,
    };
  }).sort((left, right) => left.mae - right.mae || left.name.localeCompare(right.name, 'bg'));
  requireValue(new Set(rows.map(row => row.id)).size === rows.length, 'Duplicate polling agency');
  return { date, agencies: rows };
}

function normalizeVoteFlows(data, date, from) {
  requireValue(isoDate(from.replaceAll('_', '-')) && from < date.replaceAll('.', '_')
    && data?.from === from && data.to === date.replaceAll('.', '_') && data.scope === 'national', 'Invalid vote-flow election pair');
  const normalizeNodes = nodes => {
    requireValue(Array.isArray(nodes) && nodes.length > 0, 'Missing vote-flow nodes');
    const result = nodes.map(node => {
      requireValue(typeof node.id === 'string' && node.id && typeof node.label === 'string' && node.label.trim()
        && Number.isSafeInteger(node.votes) && node.votes >= 0, 'Invalid vote-flow node');
      return { id: node.id, name: node.label, votes: node.votes, pseudo: node.pseudo === true || node.id.startsWith('__') };
    });
    requireValue(new Set(result.map(node => node.id)).size === result.length, 'Duplicate vote-flow node');
    return result;
  };
  const fromNodes = normalizeNodes(data.matrix?.fromNodes);
  const toNodes = normalizeNodes(data.matrix?.toNodes);
  const sources = new Map(fromNodes.map(node => [node.id, node]));
  const targets = new Map(toNodes.map(node => [node.id, node]));
  requireValue(Array.isArray(data.matrix.flows) && data.matrix.flows.length > 0, 'Missing vote flows');
  const pairs = new Set();
  const fromTotals = new Map();
  const toTotals = new Map();
  const flows = data.matrix.flows.map(flow => {
    const key = JSON.stringify([flow.from, flow.to]);
    requireValue(sources.has(flow.from) && targets.has(flow.to) && !pairs.has(key)
      && Number.isSafeInteger(flow.votes) && flow.votes > 0, 'Invalid or duplicate vote-flow edge');
    pairs.add(key);
    fromTotals.set(flow.from, (fromTotals.get(flow.from) ?? 0) + flow.votes);
    toTotals.set(flow.to, (toTotals.get(flow.to) ?? 0) + flow.votes);
    return { from: flow.from, to: flow.to, votes: flow.votes };
  });
  // Published edges are rounded and thresholded; unconverged models can also exceed node labels.
  let maxNodeExcess = 0;
  for (const [nodes, totals] of [[fromNodes, fromTotals], [toNodes, toTotals]]) {
    const marginalTotal = nodes.reduce((sum, node) => sum + node.votes, 0);
    requireValue(flows.reduce((sum, flow) => sum + flow.votes, 0) <= marginalTotal * 1.01 + flows.length, 'Vote-flow mass exceeds its marginal total');
    for (const node of nodes) {
      const excess = (totals.get(node.id) ?? 0) - node.votes;
      if (excess > flows.length && node.votes > 0) maxNodeExcess = Math.max(maxNodeExcess, excess / node.votes);
    }
  }
  const diagnostics = data.diagnostics;
  requireValue(diagnostics && Number.isSafeInteger(diagnostics.sectionsMatched) && diagnostics.sectionsMatched > 0
    && Number.isSafeInteger(diagnostics.sectionsDropped) && diagnostics.sectionsDropped >= 0
    && Number.isFinite(diagnostics.rasResidual) && diagnostics.rasResidual >= 0 && diagnostics.rasResidual < 0.01, 'Invalid vote-flow diagnostics');
  return {
    date, from: from.replaceAll('_', '.'), fromNodes, toNodes, flows,
    sectionsMatched: diagnostics.sectionsMatched, sectionsDropped: diagnostics.sectionsDropped,
    residual: diagnostics.rasResidual, maxNodeExcess,
  };
}

async function fetchSource(relativePath, fetcher = fetch) {
  const url = DATA_ORIGIN + relativePath;
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cannot fetch ${url}: HTTP ${response.status}`);
  const text = await response.text();
  return { data: JSON.parse(text), source: { url, sha256: createHash('sha256').update(text).digest('hex') } };
}

async function importElectionContext(projectDir = path.join(__dirname, '..'), fetcher = fetch) {
  const catalog = JSON.parse(await fs.readFile(path.join(projectDir, 'src/assets/elections.json'), 'utf8'));
  const elections = catalog.filter(election => election.type === 'governmental');
  requireValue(elections.length > 0 && elections.every(election => isoDate(election.date.replaceAll('.', '-'))), 'Invalid election catalog');
  const [accuracy, agencies, polls, transitions] = await Promise.all(['/polls/accuracy.json', '/polls/agencies.json', '/polls/polls.json', '/transitions/index.json'].map(file => fetchSource(file, fetcher)));
  requireValue(Array.isArray(accuracy.data.elections) && Array.isArray(agencies.data) && Array.isArray(polls.data), 'Invalid polling corpus');
  requireValue(Number.isFinite(Date.parse(accuracy.data.generatedAt)), 'Invalid polling update timestamp');
  requireValue(Array.isArray(transitions.data.pairs) && Number.isFinite(Date.parse(transitions.data.generatedAt)), 'Invalid vote-flow index');
  const retrievedAt = new Date().toISOString();
  const provenance = { publisher: 'Наясно', repository: REPOSITORY, retrievedAt };
  const outputs = await Promise.all(elections.map(async election => {
    const pairs = transitions.data.pairs.filter(pair => pair.to === election.date.replaceAll('.', '_'));
    requireValue(pairs.length === 1 && typeof pairs[0].from === 'string' && isoDate(pairs[0].from.replaceAll('_', '-')), `Missing or ambiguous vote-flow pair: ${election.date}`);
    const pair = pairs[0];
    const [demographic, flow] = await Promise.all([
      fetchSource(`/${election.date.replaceAll('.', '_')}/dashboard/demographic_cleavages.json`, fetcher),
      fetchSource(`/transitions/${pair.from}_${pair.to}/national.json`, fetcher),
    ]);
    return [
      [`demographics/${election.date}.json`, {
        ...normalizeDemographics(demographic.data, election.date),
        source: { ...provenance, ...demographic.source }, censusDate: '2021-09-07', censusSourceUrl: 'https://census2021.bg/',
      }],
      [`polls/${election.date}.json`, {
        ...normalizePolls(accuracy.data.elections.find(entry => entry.electionDate === election.date.replaceAll('.', '-')), agencies.data, polls.data, election.date),
        source: { ...provenance, ...accuracy.source }, generatedAt: accuracy.data.generatedAt,
        inputs: [accuracy.source, agencies.source, polls.source],
      }],
      [`flows/${election.date}.json`, {
        ...normalizeVoteFlows(flow.data, election.date, pair.from),
        source: { ...provenance, ...flow.source }, generatedAt: transitions.data.generatedAt,
      }],
    ];
  }));
  // Validate the entire download before replacing any existing snapshot.
  const destination = path.join(projectDir, 'public/data/context');
  for (const [file, payload] of outputs.flat()) {
    const target = path.join(destination, file);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.writeFile(temporary, `${JSON.stringify(payload)}\n`);
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  return elections.length;
}

if (require.main === module) {
  importElectionContext().then(count => console.log(`Imported geography, polling and vote-flow context for ${count} parliamentary elections.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { normalizeDemographics, normalizePolls, normalizeVoteFlows, importElectionContext };
