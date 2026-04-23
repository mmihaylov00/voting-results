/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const elections = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/assets/elections.json'), 'utf8')
);
const compactMapping = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/assets/compact-mapping.json'), 'utf8')
);

const baseDataDir = path.join(__dirname, '../public/data');
const outputDir = path.join(baseDataDir, 'compiled');
const buildTimestamp = new Date().toISOString().replace(/[-:TZ.]/g, '');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, {recursive: true});
}

const runStart = process.hrtime.bigint();

function nowNs() {
  return process.hrtime.bigint();
}

function formatSeconds(ns) {
  return (Number(ns) / 1e9).toFixed(2);
}

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

function timeAction(label, fn) {
  const start = nowNs();
  const result = fn();
  const end = nowNs();
  console.log(`${label} (${formatSeconds(end - start)}s)`);
  return result;
}

function readFileWithHeaders(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex === -1) {
    throw new Error(`Missing header row in ${filePath}`);
  }

  let headerLine = text.slice(0, newlineIndex);
  if (headerLine.endsWith('\r')) headerLine = headerLine.slice(0, -1);
  const headers = headerLine.split(';').map((h) => h.trim());
  const body = text.slice(newlineIndex + 1);
  return {headers, body};
}

function buildHeaderIndex(headers) {
  const map = Object.create(null);
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (!key) continue;
    if (map[key] === undefined) map[key] = i;
  }
  return map;
}

function requireHeaderIndex(headerMap, name, label) {
  const idx = headerMap[name];
  if (idx === undefined) {
    throw new Error(`Missing header "${name}" in ${label}`);
  }
  return idx;
}

function findHeaderIndexes(headers, name) {
  const out = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === name) out.push(i);
  }
  return out;
}

function findHeaderIndexBetween(headers, name, start, end) {
  for (let i = start; i < end; i++) {
    if (headers[i] === name) return i;
  }
  return -1;
}

/**
 * Faster than text.split('\n') for big files (less allocation).
 * Handles both \n and \r\n.
 */
function forEachLine(text, fn) {
  let start = 0;
  const len = text.length;
  while (start < len) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = len;

    let lineEnd = end;
    // strip \r for CRLF
    if (lineEnd > start && text.charCodeAt(lineEnd - 1) === 13) lineEnd--;

    if (lineEnd > start) fn(text.slice(start, lineEnd));
    start = end + 1;
  }
}

function parseLongSafe(s) {
  if (!s) return 0;
  // Avoid trim() allocation unless needed
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizePartyName(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('ПРОДЪЛЖАВАМЕ')) return 'ПП-ДБ';
  if (n.includes('ГЕРБ')) return 'ГЕРБ-СДС';
  if (n.includes('ВЪЗРАЖДАНЕ')) return 'ВЪЗРАЖДАНЕ';
  if (n.includes('ДПС')) return 'ДПС';
  if (n.includes('БСП')) return 'БСП';
  if (n.includes('ТАКЪВ НАРОД')) return 'ИТН';
  if (n.includes('ВЕЛИЧИЕ')) return 'ВЕЛИЧИЕ';
  if (n.includes('МЕЧ')) return 'МЕЧ';
  if (n.includes('ПРОГРЕСИВНА')) return 'ПБ';
  return name;
}

function calculateVariance(values) {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;

  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    sq += d * d;
  }
  return sq / n;
}

function calculateGini(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += sortedValues[i];
  if (sum === 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < n; i++) weightedSum += (i + 1) * sortedValues[i];

  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}

function parseParties(text, headers) {
  const headerMap = buildHeaderIndex(headers);
  const partyIdIdx = requireHeaderIndex(headerMap, 'partyId', 'cik_parties');
  const partyNameIdx = requireHeaderIndex(headerMap, 'partyName', 'cik_parties');
  const parties = Object.create(null);
  forEachLine(text, (line) => {
    // Avoid trim: split first, then minimal cleanup
    const parts = line.split(';');
    if (parts.length <= Math.max(partyIdIdx, partyNameIdx)) return;
    const partyId = (parts[partyIdIdx] || '').trim();
    const partyName = (parts[partyNameIdx] || '').trim();
    if (partyId) parties[partyId] = partyName;
  });
  parties['0'] = 'Други';
  return parties;
}

function buildPartyNormalization(parties) {
  const normByPid = Object.create(null);
  for (const pid in parties) {
    normByPid[pid] = normalizePartyName(parties[pid] || pid);
  }
  return normByPid;
}

function compactPartyVotesMap(partyVotes, mapping) {
  if (!partyVotes) return partyVotes;
  const out = Object.create(null);
  for (const pid in partyVotes) {
    const pv = partyVotes[pid];
    const compact = {...pv};
    compact[mapping.total] = pv.total;
    compact[mapping.paper] = pv.paper;
    compact[mapping.machine] = pv.machine;
    delete compact.total;
    delete compact.paper;
    delete compact.machine;
    out[pid] = compact;
  }
  return out;
}

function compactCandidateVotesMap(candidateVotes, mapping) {
  if (!candidateVotes) return candidateVotes;
  const out = Object.create(null);
  for (const key in candidateVotes) {
    const cv = candidateVotes[key];
    const compact = {...cv};
    compact[mapping.total] = cv.total;
    compact[mapping.paper] = cv.paper;
    compact[mapping.machine] = cv.machine;
    delete compact.total;
    delete compact.paper;
    delete compact.machine;
    out[key] = compact;
  }
  return out;
}

function compactTopParties(topParties, mapping) {
  if (!topParties) return topParties;
  return topParties.map((tp) => {
    const compact = {...tp};
    compact[mapping.percentBp] = tp.percentBp;
    delete compact.percentBp;
    return compact;
  });
}

function compactSection(section, mapping) {
  const out = {...section};
  out[mapping.section.total] = section.total;
  out[mapping.section.voted] = section.voted;
  out[mapping.section.discardedVotes] = section.discardedVotes;
  out[mapping.section.noVotes] = section.noVotes;
  if (section.noVotesPaper !== undefined) out[mapping.section.noVotesPaper] = section.noVotesPaper;
  if (section.noVotesMachine !== undefined) out[mapping.section.noVotesMachine] = section.noVotesMachine;
  if (section.totalPaper !== undefined) out[mapping.section.totalPaper] = section.totalPaper;
  if (section.totalMachine !== undefined) out[mapping.section.totalMachine] = section.totalMachine;
  out[mapping.section.activityBp] = section.activityBp;
  delete out.total;
  delete out.voted;
  delete out.discardedVotes;
  delete out.noVotes;
  delete out.noVotesPaper;
  delete out.noVotesMachine;
  delete out.totalPaper;
  delete out.totalMachine;
  delete out.activityBp;

  out.partyVotes = compactPartyVotesMap(section.partyVotes, mapping.partyVotes);
  if (section.candidateVotes) {
    out.candidateVotes = compactCandidateVotesMap(section.candidateVotes, mapping.candidateVotes);
  }
  out.topParties = compactTopParties(section.topParties, mapping.topParties);
  return out;
}

function compactRegion(region, mapping) {
  const out = {...region};
  out[mapping.region.total] = region.total;
  out[mapping.region.voted] = region.voted;
  if (region.discardedVotes !== undefined) out[mapping.region.discardedVotes] = region.discardedVotes;
  if (region.noVotes !== undefined) out[mapping.region.noVotes] = region.noVotes;
  if (region.totalPaper !== undefined) out[mapping.region.totalPaper] = region.totalPaper;
  if (region.totalMachine !== undefined) out[mapping.region.totalMachine] = region.totalMachine;
  if (region.avgTurnoutBp !== undefined) out[mapping.region.avgTurnoutBp] = region.avgTurnoutBp;
  if (region.partyPercentsBp !== undefined) out[mapping.region.partyPercentsBp] = region.partyPercentsBp;
  delete out.total;
  delete out.voted;
  delete out.discardedVotes;
  delete out.noVotes;
  delete out.totalPaper;
  delete out.totalMachine;
  delete out.avgTurnoutBp;
  delete out.partyPercentsBp;

  out.topParties = compactTopParties(region.topParties, mapping.topParties);
  return out;
}

function getDictId(dictArr, dictMap, value) {
  const key = value || '';
  const existing = dictMap.get(key);
  if (existing !== undefined) return existing;
  const id = dictArr.length;
  dictArr.push(key);
  dictMap.set(key, id);
  return id;
}

const SECTION_TYPE_CODES = {
  City: 0,
  Village: 1,
  Mobile: 2,
  Other: 3
};

function buildColumnarSections(sections) {
  const cityDict = [];
  const cityIndex = new Map();
  const sectionDict = [];
  const sectionIndex = new Map();

  const col = {
    count: sections.length,
    dicts: {
      cityName: cityDict,
      sectionName: sectionDict
    },

    sectionId: [],
    regionId: [],
    cityNameId: [],
    sectionNameId: [],
    sectionType: [],

    total: [],
    voted: [],
    discardedVotes: [],
    noVotes: [],
    noVotesPaper: [],
    noVotesMachine: [],
    totalPaper: [],
    totalMachine: [],
    activityBp: [],
    riskScore: [],
    hasProtocolError: [],
    protocolErrorDiff: [],
    protocolPaperVotes: [],
    protocolMachineVotes: [],
    votesToFirst: [],

    topPartyOffset: [0],
    topPartyPartyId: [],
    topPartyName: [],
    topPartyTotal: [],
    topPartyPercentBp: [],

    partyVotesOffset: [0],
    partyVotesPartyId: [],
    partyVotesTotal: [],
    partyVotesPaper: [],
    partyVotesMachine: [],

    candidateVotesOffset: [0],
    candidateVotesCandidateId: [],
    candidateVotesCandidateName: [],
    candidateVotesPartyId: [],
    candidateVotesTotal: [],
    candidateVotesPaper: [],
    candidateVotesMachine: [],

    riskOffset: [0],
    riskCode: [],
    riskCategory: [],
    riskSeverity: [],
    riskDetails: [],

    candidateRiskOffset: [0],
    candidateRiskCode: [],
    candidateRiskCategory: [],
    candidateRiskSeverity: [],
    candidateRiskDetails: []
  };

  for (const s of sections) {
    col.sectionId.push(s.sectionId || '');
    col.regionId.push(s.regionId || '');
    col.cityNameId.push(getDictId(cityDict, cityIndex, s.cityName || ''));
    col.sectionNameId.push(getDictId(sectionDict, sectionIndex, s.sectionName || ''));
    col.sectionType.push(SECTION_TYPE_CODES[s.sectionType] ?? SECTION_TYPE_CODES.Other);

    col.total.push(s.total || 0);
    col.voted.push(s.voted || 0);
    col.discardedVotes.push(s.discardedVotes || 0);
    col.noVotes.push(s.noVotes || 0);
    col.noVotesPaper.push(s.noVotesPaper || 0);
    col.noVotesMachine.push(s.noVotesMachine || 0);
    col.totalPaper.push(s.totalPaper || 0);
    col.totalMachine.push(s.totalMachine || 0);
    col.activityBp.push(s.activityBp || 0);
    col.riskScore.push(s.riskScore || 0);
    col.hasProtocolError.push(s.hasProtocolError ? 1 : 0);
    col.protocolErrorDiff.push(s.protocolErrorDiff || 0);
    col.protocolPaperVotes.push(s.protocolPaperVotes || 0);
    col.protocolMachineVotes.push(s.protocolMachineVotes || 0);
    col.votesToFirst.push(s.votesToFirst || 0);

    const tps = s.topParties || [];
    for (const tp of tps) {
      col.topPartyPartyId.push(tp.partyId || '');
      col.topPartyName.push(tp.name || '');
      col.topPartyTotal.push(tp.total || 0);
      col.topPartyPercentBp.push(tp.percentBp || 0);
    }
    col.topPartyOffset.push(col.topPartyPartyId.length);

    const pvs = s.partyVotes || Object.create(null);
    for (const pid of Object.keys(pvs)) {
      const pv = pvs[pid];
      col.partyVotesPartyId.push(pid);
      col.partyVotesTotal.push(pv.total || 0);
      col.partyVotesPaper.push(pv.paper || 0);
      col.partyVotesMachine.push(pv.machine || 0);
    }
    col.partyVotesOffset.push(col.partyVotesPartyId.length);

    const cvs = s.candidateVotes || Object.create(null);
    for (const key of Object.keys(cvs)) {
      const cv = cvs[key];
      col.candidateVotesCandidateId.push(cv.candidateId || '');
      col.candidateVotesCandidateName.push(cv.candidateName || '');
      col.candidateVotesPartyId.push(cv.partyId || '');
      col.candidateVotesTotal.push(cv.total || 0);
      col.candidateVotesPaper.push(cv.paper || 0);
      col.candidateVotesMachine.push(cv.machine || 0);
    }
    col.candidateVotesOffset.push(col.candidateVotesCandidateId.length);

    const risks = s.riskIndicators || [];
    for (const r of risks) {
      col.riskCode.push(r.code || '');
      col.riskCategory.push(r.category || '');
      col.riskSeverity.push(r.severity || '');
      col.riskDetails.push(r.details ? JSON.stringify(r.details) : '');
    }
    col.riskOffset.push(col.riskCode.length);

    const candidateRisks = s.candidateRiskIndicators || [];
    for (const r of candidateRisks) {
      col.candidateRiskCode.push(r.code || '');
      col.candidateRiskCategory.push(r.category || '');
      col.candidateRiskSeverity.push(r.severity || '');
      col.candidateRiskDetails.push(r.details ? JSON.stringify(r.details) : '');
    }
    col.candidateRiskOffset.push(col.candidateRiskCode.length);
  }

  return col;
}

function parseSections(text, headers) {
  const headerMap = buildHeaderIndex(headers);
  const sectionIdIdx = requireHeaderIndex(headerMap, 'sectionId', 'sections');
  const regionIdIdx = requireHeaderIndex(headerMap, 'regionId', 'sections');
  const regionNameIdx = requireHeaderIndex(headerMap, 'regionName', 'sections');
  const cityNameIdx = requireHeaderIndex(headerMap, 'cityName', 'sections');
  const sectionNameIdx = requireHeaderIndex(headerMap, 'sectionName', 'sections');
  const sections = Object.create(null);

  forEachLine(text, (raw) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(';');
    if (parts.length <= sectionNameIdx) return;

    const sectionId = (parts[sectionIdIdx] || '').trim();
    if (!sectionId) return;

    const regionId = (parts[regionIdIdx] || '').trim();
    const regionName = (parts[regionNameIdx] || '').trim();
    const cityName = (parts[cityNameIdx] || '').trim();

    // Cheap cleanup: remove spaces before punctuation
    let sectionName = (parts[sectionNameIdx] || '').trim().replace(/\s+([,.:;!?])/g, '$1');

    // Try to drop leading "гр." / "с." part if present
    const lower = sectionName.toLowerCase();
    if (lower.startsWith('гр.') || lower.startsWith('с.')) {
      // Original logic used cityName.length; keep behavior but safer
      const cut = (cityName ? cityName.length : 0) + 2;
      if (cut > 0 && cut < sectionName.length) sectionName = sectionName.substring(cut);
    }

    let sectionType = 'Other';
    const sn = sectionName.toLowerCase();
    const cn = cityName.toLowerCase();
    if (sn.includes('подвижна') || sn.includes('пск')) {
      sectionType = 'Mobile';
    } else if (cn.startsWith('гр.')) {
      sectionType = 'City';
    } else if (cn.startsWith('с.')) {
      sectionType = 'Village';
    }

    sections[sectionId] = {
      sectionId,
      regionId,
      regionName,
      cityName,
      sectionName,
      sectionType,

      total: 0,
      voted: 0,
      discardedVotes: 0,
      noVotes: 0,
      noVotesPaper: 0,
      noVotesMachine: 0,

      protocolPaperVotes: 0,
      protocolMachineVotes: 0,
      protocolErrorDiff: 0,
      hasProtocolError: false,

      // votes
      partyVotes: Object.create(null), // pid -> { total, paper, machine, ...comparisons }
      partyVotesNorm: Object.create(null), // normalizedName -> { total, paper, machine } (for fast comparisons)

      topParties: [],
      activityBp: 0,

      // risks
      riskScore: 0
    };
  });

  return sections;
}

function applyProtocols(sections, text, headers) {
  const headerMap = buildHeaderIndex(headers);
  const sectionIdIdx = requireHeaderIndex(headerMap, 'sectionId', 'protocols');
  const totalAIdx = requireHeaderIndex(headerMap, 'totalA', 'protocols');
  const totalBIdx = requireHeaderIndex(headerMap, 'totalB', 'protocols');
  const votedIdx = requireHeaderIndex(headerMap, 'voted', 'protocols');
  const discardedVotesIdx = requireHeaderIndex(headerMap, 'discardedVotes', 'protocols');
  const noVotesPaperIdx = requireHeaderIndex(headerMap, 'noVotesPaper', 'protocols');
  const noVotesMachineIdx = requireHeaderIndex(headerMap, 'noVotesMachine', 'protocols');
  const protocolPaperVotesIdx = requireHeaderIndex(headerMap, 'protocolPaperVotes', 'protocols');
  const protocolMachineVotesIdx = requireHeaderIndex(headerMap, 'protocolMachineVotes', 'protocols');

  forEachLine(text, (raw) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(';');
    if (parts.length <= sectionIdIdx) return;

    const sectionId = (parts[sectionIdIdx] || '').trim();
    const section = sections[sectionId];
    if (!section) return;

    section.total = parseLongSafe(parts[totalAIdx]) + parseLongSafe(parts[totalBIdx]);
    section.voted = parseLongSafe(parts[votedIdx]);
    section.discardedVotes = parseLongSafe(parts[discardedVotesIdx]);
    section.noVotesPaper = parseLongSafe(parts[noVotesPaperIdx]);
    section.noVotesMachine = parseLongSafe(parts[noVotesMachineIdx]);
    section.protocolPaperVotes = parseLongSafe(parts[protocolPaperVotesIdx]);
    section.protocolMachineVotes = parseLongSafe(parts[protocolMachineVotesIdx]);

    section.noVotes = (section.noVotesPaper || 0) + (section.noVotesMachine || 0);
    section.protocolErrorDiff =
      section.voted - (section.protocolPaperVotes || 0) - (section.protocolMachineVotes || 0);
    section.hasProtocolError = section.protocolErrorDiff !== 0;
  });
}

function applyVotes(sections, text, headers, normByPid) {
  const headerMap = buildHeaderIndex(headers);
  const sectionIdIdx = requireHeaderIndex(headerMap, 'sectionId', 'votes');
  const partyIdIndexes = findHeaderIndexes(headers, 'partyId');
  if (partyIdIndexes.length === 0) {
    throw new Error('Missing partyId headers in votes');
  }

  const firstPartyIdx = partyIdIndexes[0];
  const step = partyIdIndexes.length > 1 ? partyIdIndexes[1] - partyIdIndexes[0] : 4;
  const blockEnd = Math.min(headers.length, firstPartyIdx + step);
  const totalIdx = findHeaderIndexBetween(headers, 'total', firstPartyIdx + 1, blockEnd);
  const paperIdx = findHeaderIndexBetween(headers, 'paper', firstPartyIdx + 1, blockEnd);
  const machineIdx = findHeaderIndexBetween(headers, 'machine', firstPartyIdx + 1, blockEnd);

  if (totalIdx === -1 || paperIdx === -1 || machineIdx === -1) {
    throw new Error('Missing total/paper/machine headers in votes');
  }

  const totalOffset = totalIdx - firstPartyIdx;
  const paperOffset = paperIdx - firstPartyIdx;
  const machineOffset = machineIdx - firstPartyIdx;

  forEachLine(text, (raw) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(';');
    if (parts.length <= sectionIdIdx) return;

    const sectionId = (parts[sectionIdIdx] || '').trim();
    const section = sections[sectionId];
    if (!section) return;

    for (let i = firstPartyIdx; i + machineOffset < parts.length; i += step) {
      const partyId = (parts[i] || '').trim();
      if (!partyId) continue;

      const total = parseLongSafe(parts[i + totalOffset]);
      const paper = parseLongSafe(parts[i + paperOffset]);
      const machine = parseLongSafe(parts[i + machineOffset]);

      let pv = section.partyVotes[partyId];
      if (!pv) pv = section.partyVotes[partyId] = {total: 0, paper: 0, machine: 0};
      pv.total += total;
      pv.paper += paper;
      pv.machine += machine;

      const norm = normByPid[partyId] || normalizePartyName(partyId);
      let nv = section.partyVotesNorm[norm];
      if (!nv) nv = section.partyVotesNorm[norm] = {total: 0, paper: 0, machine: 0};
      nv.total += total;
      nv.paper += paper;
      nv.machine += machine;
    }
  });
}

function parseLocalCandidates(text, headers) {
  const headerMap = buildHeaderIndex(headers);
  const regionIdIdx = requireHeaderIndex(headerMap, 'regionId', 'local_candidates');
  const partyIdIdx = requireHeaderIndex(headerMap, 'partyId', 'local_candidates');
  const candidateIdIdx = requireHeaderIndex(headerMap, 'candidateId', 'local_candidates');
  const candidateNameIdx = requireHeaderIndex(headerMap, 'candidateName', 'local_candidates');
  const candidates = Object.create(null); // regionId -> partyId -> candidateId -> { candidateId, candidateName }
  forEachLine(text, (raw) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(';');
    if (parts.length <= Math.max(regionIdIdx, partyIdIdx, candidateIdIdx, candidateNameIdx)) return;

    const regionId = (parts[regionIdIdx] || '').trim();
    const partyId = (parts[partyIdIdx] || '').trim();
    const candidateId = (parts[candidateIdIdx] || '').trim();
    const candidateName = (parts[candidateNameIdx] || '').trim();

    if (!regionId || !partyId || !candidateId || !candidateName) return;

    let r = candidates[regionId];
    if (!r) r = candidates[regionId] = Object.create(null);

    let p = r[partyId];
    if (!p) p = r[partyId] = Object.create(null);

    p[candidateId] = {candidateId, candidateName};
  });
  return candidates;
}

function applyPreferences(sections, text, headers, candidatesByRegion, parties) {
  const headerMap = buildHeaderIndex(headers);
  const sectionIdIdx = requireHeaderIndex(headerMap, 'sectionId', 'preferences');
  const partyIdIdx = requireHeaderIndex(headerMap, 'partyId', 'preferences');
  const preferenceIdx = requireHeaderIndex(headerMap, 'preference', 'preferences');
  const paperIdx = requireHeaderIndex(headerMap, 'paper', 'preferences');
  const machineIdx = requireHeaderIndex(headerMap, 'machine', 'preferences');

  forEachLine(text, (raw) => {
    const line = raw.trim();
    if (!line) return;

    const parts = line.split(';');
    if (parts.length <= Math.max(sectionIdIdx, partyIdIdx, preferenceIdx, paperIdx, machineIdx)) return;

    const sectionId = (parts[sectionIdIdx] || '').trim();
    const partyId = (parts[partyIdIdx] || '').trim();
    const preferenceVote = (parts[preferenceIdx] || '').trim();
    const paperVotes = parseLongSafe(parts[paperIdx]);
    const machineVotes = parseLongSafe(parts[machineIdx]);
    const totalVotes = paperVotes + machineVotes;

    if (preferenceVote === 'Без' || !preferenceVote || totalVotes === 0) return;

    const section = sections[sectionId];
    if (!section) return;

    const regionId = section.regionId;
    const regionCandidates = candidatesByRegion[regionId];
    if (!regionCandidates) return;
    const partyCandidates = regionCandidates[partyId];
    if (!partyCandidates) return;
    const candidate = partyCandidates[preferenceVote];
    if (!candidate) return;

    const partyName = parties[partyId] || partyId;

    if (!section.candidateVotes) section.candidateVotes = Object.create(null);

    const key = `${partyId}_${preferenceVote}`;
    let cv = section.candidateVotes[key];
    if (!cv) {
      cv = section.candidateVotes[key] = {
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        partyId,
        partyName,
        total: 0,
        paper: 0,
        machine: 0
      };
    }

    cv.total += totalVotes;
    cv.paper += paperVotes;
    cv.machine += machineVotes;
  });
}

/**
 * Build fast indexes + region aggregates.
 * Adds:
 *  - byId: Map(sectionId -> section)
 *  - byRegion: Map(regionId -> [sections])
 *  - regionAgg: Map(regionId -> aggregated totals + party totals)
 */
function buildIndexes(sections) {
  const byId = new Map();
  const byRegion = new Map();
  const regionAgg = new Map();

  for (const s of sections) {
    byId.set(s.sectionId, s);

    let arr = byRegion.get(s.regionId);
    if (!arr) byRegion.set(s.regionId, (arr = []));
    arr.push(s);

    let agg = regionAgg.get(s.regionId);
    if (!agg) {
      agg = {
        voted: 0,
        total: 0,
        discardedVotes: 0,
        noVotes: 0,
        totalPaper: 0,
        totalMachine: 0,
        partyTotals: Object.create(null),
        partyTotalsNorm: Object.create(null)
      };
      regionAgg.set(s.regionId, agg);
    }

    agg.voted += s.voted;
    agg.total += s.total;
    agg.discardedVotes += s.discardedVotes;
    agg.noVotes += s.noVotes;
    agg.totalPaper += s.totalPaper || 0;
    agg.totalMachine += s.totalMachine || 0;

    // Raw PID totals (kept because you later iterate region.partyVotes keys)
    for (const pid in s.partyVotes) {
      const v = s.partyVotes[pid];
      agg.partyTotals[pid] = (agg.partyTotals[pid] || 0) + (v.total || 0);
    }

    // Normalized totals for fast cross-date comparisons
    for (const norm in s.partyVotesNorm) {
      const v = s.partyVotesNorm[norm];
      agg.partyTotalsNorm[norm] = (agg.partyTotalsNorm[norm] || 0) + (v.total || 0);
    }
  }

  return {byId, byRegion, regionAgg};
}
function aggregateR61ForRegion(regionSections) {
  // candidateKey = `${partyId}_${candidateId}`
  const agg = new Map();

  for (const s of regionSections) {
    const list = s.candidateRiskIndicators;
    if (!list) continue;

    for (const r of list) {
      if (r.code !== 'R6.1') continue;

      const d = r.details;
      if (!d || !d.partyId || !d.candidateId) continue;

      const candidateKey = `${d.partyId}_${d.candidateId}`;

      let a = agg.get(candidateKey);
      if (!a) {
        a = {
          partyId: d.partyId,
          partyName: d.partyName,
          candidateId: d.candidateId,
          candidateName: d.candidateName,
          count: 0,
          sumSectionShare: 0,
          sumMunicipalityShare: 0
        };
        agg.set(candidateKey, a);
      }

      a.count += 1;
      a.sumSectionShare += d.sectionShare || 0;
      a.sumMunicipalityShare += d.municipalityShare || 0;
    }
  }

  // return Map(candidateKey -> aggregatedRisk)
  const out = new Map();

  for (const [candidateKey, a] of agg.entries()) {
    const avgSectionShare = a.count ? a.sumSectionShare / a.count : 0;
    const avgMunicipalityShare = a.count ? a.sumMunicipalityShare / a.count : 0;

    const severity =
      avgMunicipalityShare > 0 && avgSectionShare > avgMunicipalityShare * 2 ? 'high' : 'medium';

    out.set(candidateKey, {
      code: 'R6.1',
      category: 'R6',
      severity,
      details: {
        partyId: a.partyId,
        candidateId: a.candidateId,
        avgSectionShare,
        avgMunicipalityShare,
        sectionsTriggered: a.count
      }
    });
  }

  return out;
}


function buildRegionCandidateAggregates(byRegion) {
  const candidateAggByRegion = new Map(); // regionId -> key -> { total,paper,machine,sections,partyId }
  const partyPrefAggByRegion = new Map(); // regionId -> partyId -> { totalPartyVotes,totalPreferences }

  for (const [regionId, regionSections] of byRegion.entries()) {
    const candAgg = Object.create(null);
    const partyPrefAgg = Object.create(null);

    for (const rs of regionSections) {
      // party totals denominator
      for (const partyId in (rs.partyVotes || {})) {
        const pv = rs.partyVotes[partyId];
        let p = partyPrefAgg[partyId];
        if (!p) p = partyPrefAgg[partyId] = {totalPartyVotes: 0, totalPreferences: 0};
        p.totalPartyVotes += pv.total || 0;
      }

      const cvMap = rs.candidateVotes;
      if (!cvMap) continue;

      for (const key in cvMap) {
        const cv = cvMap[key];
        let a = candAgg[key];
        if (!a) {
          a = candAgg[key] = {total: 0, paper: 0, machine: 0, sections: 0, partyId: cv.partyId};
        }
        a.total += cv.total;
        a.paper += cv.paper;
        a.machine += cv.machine;
        a.sections += 1;

        const p = partyPrefAgg[cv.partyId] || (partyPrefAgg[cv.partyId] = {totalPartyVotes: 0, totalPreferences: 0});
        p.totalPreferences += cv.total;
      }
    }

    candidateAggByRegion.set(regionId, candAgg);
    partyPrefAggByRegion.set(regionId, partyPrefAgg);
  }

  return {candidateAggByRegion, partyPrefAggByRegion};
}

// Precompute date lookups (avoid repeated elections.find / dates.filter)
const dates = elections.map((e) => e.date);
const dateNameByDate = Object.fromEntries(elections.map((e) => [e.date, e.name]));
const otherDatesByDate = Object.fromEntries(dates.map((dt) => [dt, dates.filter((d) => d !== dt)]));
const previousDateByDate = Object.fromEntries(
  dates.map((dt, idx) => [dt, idx < dates.length - 1 ? dates[idx + 1] : null])
);
// For risk baseline, you were taking latest 3 other dates (by lexicographic sort). Keep same behavior but cached.
const histDatesByDate = Object.fromEntries(
  dates.map((dt) => {
    const hist = otherDatesByDate[dt].slice().sort().reverse().slice(0, 3);
    return [dt, hist];
  })
);

logSection('Load Raw Data');
const rawData = Object.create(null);

for (const {date} of elections) {
  console.log(`\n-- ${date} --`);
  const baseUrl = path.join(baseDataDir, date);

  const input = timeAction('Read input files', () => {
    const sectionsPath = path.join(baseUrl, 'sections.txt');
    const protocolsPath = path.join(baseUrl, 'protocols.txt');
    const votesPath = path.join(baseUrl, 'votes.txt');
    const partiesPath = path.join(baseUrl, 'cik_parties.txt');

    return {
      sections: readFileWithHeaders(sectionsPath),
      protocols: fs.existsSync(protocolsPath) ? readFileWithHeaders(protocolsPath) : { headers: [], body: '' },
      votes: fs.existsSync(votesPath) ? readFileWithHeaders(votesPath) : { headers: [], body: '' },
      parties: readFileWithHeaders(partiesPath)
    };
  });

  const parties = timeAction('Parse parties', () =>
    parseParties(input.parties.body, input.parties.headers)
  );
  const normByPid = timeAction('Normalize parties', () => buildPartyNormalization(parties));

  const sectionsMap = timeAction('Parse sections', () =>
    parseSections(input.sections.body, input.sections.headers)
  );

  if (input.protocols.body) {
    timeAction('Apply protocols', () =>
      applyProtocols(sectionsMap, input.protocols.body, input.protocols.headers)
    );
  } else {
    console.log('Apply protocols: skipped (0.00s)');
  }

  if (input.votes.body) {
    timeAction('Apply votes', () =>
      applyVotes(sectionsMap, input.votes.body, input.votes.headers, normByPid)
    );
  } else {
    console.log('Apply votes: skipped (0.00s)');
  }

  // Parse local candidates and preferences if files exist
  const localCandidatesPath = path.join(baseUrl, 'local_candidates.txt');
  const preferencesPath = path.join(baseUrl, 'preferences.txt');
  if (fs.existsSync(localCandidatesPath)) {
    const localCandidates = readFileWithHeaders(localCandidatesPath);
    const candidatesByRegion = timeAction('Parse local candidates', () =>
      parseLocalCandidates(localCandidates.body, localCandidates.headers)
    );

    if (fs.existsSync(preferencesPath)) {
      const preferences = readFileWithHeaders(preferencesPath);
      timeAction('Apply preferences', () =>
        applyPreferences(
          sectionsMap,
          preferences.body,
          preferences.headers,
          candidatesByRegion,
          parties
        )
      );
    } else {
      console.log('Apply preferences: skipped (0.00s)');
      // If no preferences but we have local candidates, at least attach them with 0 votes
      // so they show up in the UI
      timeAction('Attach candidates (0 votes)', () => {
        for (const sectionId in sectionsMap) {
          const section = sectionsMap[sectionId];
          const regionId = section.regionId;
          const regionCandidates = candidatesByRegion[regionId];
          if (!regionCandidates) continue;

          for (const partyId in regionCandidates) {
            const partyCandidates = regionCandidates[partyId];
            const partyName = parties[partyId] || partyId;

            for (const candidateId in partyCandidates) {
              const candidate = partyCandidates[candidateId];
              if (!section.candidateVotes) section.candidateVotes = Object.create(null);
              const key = `${partyId}_${candidateId}`;
              if (!section.candidateVotes[key]) {
                section.candidateVotes[key] = {
                  candidateId: candidate.candidateId,
                  candidateName: candidate.candidateName,
                  partyId,
                  partyName,
                  total: 0,
                  paper: 0,
                  machine: 0
                };
              }
            }
          }
        }
      });
    }
  } else {
    console.log('Local candidates: skipped (0.00s)');
  }

  const sections = Object.values(sectionsMap);

  // Finalize per-section derived fields + topParties (avoid extra normalization work)
  timeAction('Finalize sections', () => {
    for (const section of sections) {
      section.totalPaper = section.protocolPaperVotes || 0;
      section.totalMachine = section.protocolMachineVotes || 0;
      const activityRatio = section.total > 0 ? section.voted / section.total : 0;
      section.activityBp = Math.round(activityRatio * 10000);

      // Build top parties by raw pid (as before), but normalize name once here.
      const tps = [];
      for (const partyId in section.partyVotes) {
        if (partyId === '0') continue;
        const votes = section.partyVotes[partyId];
        if (!votes || votes.total <= 0) continue;

        const originalName = parties[partyId] || partyId;
        const name = normalizePartyName(originalName);

        tps.push({
          name,
          partyId,
          total: votes.total,
          percentBp: section.voted > 0 ? Math.round((votes.total / section.voted) * 10000) : 0
        });
      }

      tps.sort((a, b) => b.total - a.total);
      section.topParties = tps.slice(0, 3);
    }
  });

  // Build fast indexes + region aggregates
  const idx = timeAction('Build indexes', () => buildIndexes(sections));

  rawData[date] = {
    sections,
    parties,
    normByPid,
    ...idx
  };
}

logSection('Finalize Outputs');

const manifest = {
  timestamp: buildTimestamp,
  files: Object.create(null),
};

for (const date of dates) {
  console.log(`\n-- ${date} --`);

  const current = rawData[date];
  const targetSections = current.sections;
  const parties = current.parties;

  // Initialize risk score if missing
  timeAction('Init risk scores', () => {
    for (const s of targetSections) {
      s.riskScore = s.riskScore || 0;
    }
  });

  // ----- Regions list (use current.regionAgg + current.byRegion for sections list) -----
  const regions = timeAction('Build regions list', () =>
    Array.from(current.regionAgg.entries())
      .map(([id, agg]) => {
        // Top parties for region
        const topParties = [];
        for (const pid in agg.partyTotals) {
          if (pid === '0') continue;
          const total = agg.partyTotals[pid];
          if (!total) continue;

          const originalName = parties[pid] || pid;
          const name = normalizePartyName(originalName);

          topParties.push({
            name,
            total,
            percentBp: agg.voted > 0 ? Math.round((total / agg.voted) * 10000) : 0
          });
        }
        topParties.sort((a, b) => b.total - a.total);
        const top3 = topParties.slice(0, 3);

        const region = {
          id,
          name: (current.byRegion.get(id)?.[0]?.regionName) || '',
          total: agg.total,
          voted: agg.voted,
          partyVotes: agg.partyTotals,
          topParties: top3,
          discardedVotes: agg.discardedVotes,
          noVotes: agg.noVotes,
          totalPaper: agg.totalPaper,
          totalMachine: agg.totalMachine,
          avgTurnoutBp: agg.total > 0 ? Math.round((agg.voted / agg.total) * 10000) : 0,
          partyPercentsBp: (() => {
            const partyPercents = Object.create(null);
            for (const pid in agg.partyTotals) {
              partyPercents[pid] = agg.voted > 0 ? Math.round((agg.partyTotals[pid] / agg.voted) * 10000) : 0;
            }
            return partyPercents;
          })(),
          comparisons: Object.create(null)
        };

        // Comparisons vs other dates (use other.regionAgg, O(1))
        for (const d of otherDatesByDate[date]) {
          const other = rawData[d];
          const otherAgg = other.regionAgg.get(id);
          if (!otherAgg) continue;

          (region.comparisons.voted ||= []).push({v: otherAgg.voted, d});
          (region.comparisons.total ||= []).push({v: otherAgg.total, d});
          (region.comparisons.discardedVotes ||= []).push({v: otherAgg.discardedVotes, d});
          (region.comparisons.noVotes ||= []).push({v: otherAgg.noVotes, d});
          (region.comparisons.totalPaper ||= []).push({v: otherAgg.totalPaper, d});
          (region.comparisons.totalMachine ||= []).push({v: otherAgg.totalMachine, d});
          (region.comparisons.activityPercent ||= []).push({
            v: otherAgg.total > 0 ? Math.round((otherAgg.voted / otherAgg.total) * 10000) : 0,
            d
          });

          // Party comparisons for regions:
          // Previously: normalize by name and scan all other sections partyVotes.
          // Now: use otherAgg.partyTotalsNorm[normalized] directly.
          const otherAggNorm = otherAgg.partyTotalsNorm;
          const currentPartiesMap = current.parties; // for normalized target
          for (const pid in region.partyVotes) {
            const normalizedTarget = normalizePartyName(currentPartiesMap[pid] || pid);
            const otherPartyTotal = otherAggNorm[normalizedTarget] || 0;
            (region.comparisons[`party_${pid}`] ||= []).push({v: otherPartyTotal, d});
          }

          // Top parties comparisons for regions removed
        }

        return region;
      })
      .sort((a, b) => {
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);
        if (!Number.isNaN(idA) && !Number.isNaN(idB)) return idA - idB;
        return a.id.localeCompare(b.id);
      })
  );

  // ----- Section comparisons (use byId instead of find) -----
  timeAction('Build section comparisons', () => {
    for (const s of targetSections) {
      s.comparisons = Object.create(null);

      for (const d of otherDatesByDate[date]) {
        const other = rawData[d];
        const otherSection = other.byId.get(s.sectionId);
        if (!otherSection) continue;

        (s.comparisons.voted ||= []).push({v: otherSection.voted, d});
        (s.comparisons.total ||= []).push({v: otherSection.total, d});
        (s.comparisons.discardedVotes ||= []).push({v: otherSection.discardedVotes, d});
        (s.comparisons.noVotes ||= []).push({v: otherSection.noVotes, d});
        (s.comparisons.totalPaper ||= []).push({v: otherSection.totalPaper || 0, d});
        (s.comparisons.totalMachine ||= []).push({v: otherSection.totalMachine || 0, d});
        (s.comparisons.activityPercent ||= []).push({v: otherSection.activityBp || 0, d});
        (s.comparisons.noVotesPaper ||= []).push({v: otherSection.noVotesPaper || 0, d});
        (s.comparisons.noVotesMachine ||= []).push({v: otherSection.noVotesMachine || 0, d});
        (s.comparisons.noVotesPercent ||= []).push({
          v: otherSection.voted > 0 ? Math.round((otherSection.noVotes / otherSection.voted) * 10000) : 0,
          d
        });

        // Party comparisons for sections:
        // Previously: for each pid in s.partyVotes, scan otherSection.partyVotes with normalization.
        // Now: use otherSection.partyVotesNorm[normalized] (O(#parties in s)).
        const currentPartiesMap = current.parties;
        const otherNormMap = otherSection.partyVotesNorm || Object.create(null);

        for (const pid in s.partyVotes) {
          const normalizedTarget = normalizePartyName(currentPartiesMap[pid] || pid);
          const otherBucket = otherNormMap[normalizedTarget];
          if (!otherBucket) continue;

          const otherTotal = otherBucket.total || 0;
          const otherPaper = otherBucket.paper || 0;
          const otherMachine = otherBucket.machine || 0;

          const sv = s.partyVotes[pid];
          (sv.comparisons ||= []).push({v: otherTotal, d});

          const otherPercent = otherSection.voted > 0 ? otherTotal / otherSection.voted : 0;
          (sv.percentComparisons ||= []).push({v: Math.round(otherPercent * 10000), d});

          (sv.paperComparisons ||= []).push({v: otherPaper, d});
          (sv.machineComparisons ||= []).push({v: otherMachine, d});
        }

        // Top parties comparisons for sections removed
      }
    }
  });

  console.log(`Computing enhanced risks for ${date}...`);

  // ----- Compute region statistics for risk detection (single pass) -----
  const {regionStatsMapFinal, candidateAggByRegion, partyPrefAggByRegion} = timeAction(
    'Compute region stats + candidate aggregates',
    () => {
      const regionStatsMap = new Map();

      for (const s of targetSections) {
        let stats = regionStatsMap.get(s.regionId);
        if (!stats) {
          stats = {
            sections: [],
            turnoutChanges: [],
            paperTotals: 0,
            machineTotals: 0,
            invalidTotals: 0,
            votedTotals: 0,
            partyPaperTotals: Object.create(null),
            partyTotals: Object.create(null)
          };
          regionStatsMap.set(s.regionId, stats);
        }
        stats.sections.push(s);

        // turnout change (current vs most recent comparison entry you have)
        if (s.comparisons?.activityPercent && s.comparisons.activityPercent.length > 0) {
          const currentTurnout = (s.activityBp || 0) / 10000;
          const previousTurnout = (s.comparisons.activityPercent[0].v || 0) / 10000;
          if (previousTurnout > 0) stats.turnoutChanges.push((currentTurnout - previousTurnout) / previousTurnout);
        }

        stats.paperTotals += s.totalPaper || 0;
        stats.machineTotals += s.totalMachine || 0;
        stats.invalidTotals += s.discardedVotes;
        stats.votedTotals += s.voted;

        for (const pid in s.partyVotes) {
          const votes = s.partyVotes[pid];
          if (!stats.partyTotals[pid]) {
            stats.partyTotals[pid] = 0;
            stats.partyPaperTotals[pid] = 0;
          }
          stats.partyTotals[pid] += votes.total || 0;
          stats.partyPaperTotals[pid] += votes.paper || 0;
        }
      }

      const regionStatsMapFinal = Object.create(null);
      for (const [key, data] of regionStatsMap.entries()) {
        let avgTurnoutChange = 0;
        if (data.turnoutChanges.length > 0) {
          let sum = 0;
          for (const c of data.turnoutChanges) sum += c;
          avgTurnoutChange = sum / data.turnoutChanges.length;
        }

        const variance = data.turnoutChanges.length > 1 ? calculateVariance(data.turnoutChanges) : 0;
        const turnoutChangeStdDev = Math.sqrt(variance);

        const paperMachineRatio = data.machineTotals > 0 ? data.paperTotals / data.machineTotals : 0;
        const invalidRate = data.votedTotals > 0 ? data.invalidTotals / data.votedTotals : 0;

        const partyPaperRatios = Object.create(null);
        for (const pid in data.partyTotals) {
          partyPaperRatios[pid] = data.partyTotals[pid] > 0 ? data.partyPaperTotals[pid] / data.partyTotals[pid] : 0;
        }

        regionStatsMapFinal[key] = {
          avgTurnoutChange,
          turnoutChangeStdDev,
          paperMachineRatio,
          partyPaperRatios,
          invalidRate
        };
      }

      // Precompute region candidate aggregates ONCE per region (big O(n^2) killer)
      const {candidateAggByRegion, partyPrefAggByRegion} = buildRegionCandidateAggregates(current.byRegion);

      return {regionStatsMapFinal, candidateAggByRegion, partyPrefAggByRegion};
    }
  );

  // ----- Enhanced risks per section -----
  const histDates = histDatesByDate[date];

  // Track R4.4, R5.1, and R6.1 risks per candidate to ensure uniqueness
  const r44ByCandidate = new Map(); // key: `${regionKey}_${partyId}_${candidateId}`
  const r51ByCandidate = new Map(); // key: `${regionKey}_${partyId}_${candidateId}`
  const r61ByCandidate = new Map(); // key: `${regionKey}_${partyId}_${candidateId}`

  timeAction('Compute enhanced section risks', () => {
    for (const section of targetSections) {
      const regionKey = section.regionId;
      const regStats = regionStatsMapFinal[regionKey] || {
        avgTurnoutChange: 0,
        turnoutChangeStdDev: 0,
        paperMachineRatio: 0,
        partyPaperRatios: Object.create(null),
        invalidRate: 0
      };

      // Historical sections: use byId lookups (O(1))
      const historicalSections = [];
      for (const d of histDates) {
        const hs = rawData[d].byId.get(section.sectionId);
        if (hs) historicalSections.push(hs);
      }

      // Neighboring sections: use byRegion once (no global filter)
      const regionSections = current.byRegion.get(regionKey) || [];
      const riskIndicators = [];

    // Baseline from historical sections (same logic, faster loops)
    let baseline = null;
    if (historicalSections.length > 0) {
      let totalVotes = 0;
      let totalElectors = 0;
      let totalInvalid = 0;
      let totalPaper = 0;
      let totalMachine = 0;

      const partyVoteSharesRaw = Object.create(null);

      for (const hs of historicalSections) {
        totalVotes += hs.voted;
        totalElectors += hs.total;
        totalInvalid += hs.discardedVotes;
        totalPaper += hs.totalPaper || 0;
        totalMachine += hs.totalMachine || 0;

        for (const pid in hs.partyVotes) {
          partyVoteSharesRaw[pid] = (partyVoteSharesRaw[pid] || 0) + (hs.partyVotes[pid].total || 0);
        }
      }

      let totalPartyVotes = 0;
      for (const pid in partyVoteSharesRaw) totalPartyVotes += partyVoteSharesRaw[pid];

      const partyVoteShares = Object.create(null);
      for (const pid in partyVoteSharesRaw) {
        partyVoteShares[pid] = totalPartyVotes > 0 ? partyVoteSharesRaw[pid] / totalPartyVotes : 0;
      }

      baseline = {
        avgTurnout: totalElectors > 0 ? totalVotes / totalElectors : 0,
        avgInvalidRate: totalVotes > 0 ? totalInvalid / totalVotes : 0,
        avgPaperMachineRatio: totalMachine > 0 ? totalPaper / totalMachine : 0,
        partyVoteShares
      };
    }

    // R1.1: Turnout anomaly
    if (baseline && section.comparisons?.voted && section.comparisons.voted.length > 0) {
      const currentTurnout = (section.activityBp || 0) / 10000;
      const previousTurnout = baseline.avgTurnout;
      const turnoutChange = previousTurnout > 0 ? (currentTurnout - previousTurnout) / previousTurnout : 0;
      const deviation = turnoutChange - regStats.avgTurnoutChange;
      const stdDevs = regStats.turnoutChangeStdDev > 0 ? Math.abs(deviation) / regStats.turnoutChangeStdDev : 0;

      if (stdDevs > 2) {
        riskIndicators.push({
          code: 'R1.1',
          category: 'R1',
          severity: stdDevs > 3 ? 'high' : 'medium',
          details: {
            turnoutChange,
            stdDevs
          }
        });
      }
    }

    // R1.2: Party turnout capture
    if (baseline && section.comparisons?.voted && section.comparisons.voted.length > 0) {
      const currentVoted = section.voted;
      const previousVoted = section.comparisons.voted[0].v || 0;
      const voteIncrease = currentVoted - previousVoted;

      if (voteIncrease > 0 && previousVoted > 0) {
        let maxCapture = 0;
        let capturingParty = null;

        const previousSection = historicalSections.length > 0 ? historicalSections[0] : null;

        for (const pid in section.partyVotes) {
          const votes = section.partyVotes[pid];
          let previousVotes = 0;

          if (previousSection && previousSection.partyVotes[pid]) {
            previousVotes = previousSection.partyVotes[pid].total || 0;
          } else {
            previousVotes = (baseline.partyVoteShares[pid] || 0) * previousVoted;
          }

          const currentVotes = votes.total || 0;
          const partyIncrease = currentVotes - previousVotes;
          const captureRatio = voteIncrease > 0 ? Math.min(1.0, Math.max(0, partyIncrease / voteIncrease)) : 0;

          if (captureRatio > maxCapture) {
            maxCapture = captureRatio;
            capturingParty = pid;
          }
        }

        if (maxCapture >= 0.6 && maxCapture <= 1.0 && capturingParty) {
          const partyName =
            section.topParties.find((tp) => tp.partyId === capturingParty)?.name || capturingParty;

          const historicalShare = baseline.partyVoteShares[capturingParty] || 0;
          const currentShare = section.voted > 0 ? (section.partyVotes[capturingParty]?.total || 0) / section.voted : 0;

          if (historicalShare < 0.3 && currentShare > 0.5) {
            riskIndicators.push({
              code: 'R1.2',
              category: 'R1',
              severity: maxCapture > 0.8 ? 'high' : 'medium',
              details: {
                partyId: capturingParty,
                captureRatio: maxCapture
              }
            });
          }
        }
      }
    }

    // R1.3: Vote share rigidity
    if (historicalSections.length >= 2) {
      const partySharesByPid = Object.create(null);

      for (const hs of historicalSections) {
        for (const pid in hs.partyVotes) {
          const votes = hs.partyVotes[pid];
          (partySharesByPid[pid] ||= []).push(hs.voted > 0 ? (votes.total || 0) / hs.voted : 0);
        }
      }

      let maxRigidParty = null;
      let maxRigidShare = 0;
      let minRigidVariance = Infinity;

      for (const pid in partySharesByPid) {
        const shares = partySharesByPid[pid];
        if (shares.length < 2) continue;
        let sum = 0;
        for (const x of shares) sum += x;
        const avgShare = sum / shares.length;
        const variance = calculateVariance(shares);

        if (avgShare > 0.6 && variance < 0.01 && avgShare > maxRigidShare) {
          maxRigidParty = pid;
          maxRigidShare = avgShare;
          minRigidVariance = variance;
        }
      }

      if (maxRigidParty && regionSections.length > 1) {
        const neighborShares = [];
        for (const ns of regionSections) {
          if (ns.sectionId === section.sectionId) continue;
          const pv = ns.partyVotes[maxRigidParty];
          if (pv && ns.voted > 0) neighborShares.push((pv.total || 0) / ns.voted);
        }

        if (neighborShares.length > 0) {
          let sum = 0;
          for (const x of neighborShares) sum += x;
          const neighborAvg = sum / neighborShares.length;
          let v = 0;
          for (const x of neighborShares) {
            const d = x - neighborAvg;
            v += d * d;
          }
          const neighborVariance = v / neighborShares.length;

          if (neighborVariance > minRigidVariance * 3) {
            const partyName =
              section.topParties.find((tp) => tp.partyId === maxRigidParty)?.name || maxRigidParty;

            riskIndicators.push({
              code: 'R1.3',
              category: 'R1',
              severity: 'medium',
              details: {
                partyId: maxRigidParty
              }
            });
          }
        }
      }
    }

    // R2.1: Paper/machine deviation
    if (section.totalPaper && section.totalMachine && section.voted >= 50) {
      const sectionPaperPercent = section.totalPaper / section.voted;
      const regionPaperPercent =
        regStats.paperMachineRatio > 0 ? regStats.paperMachineRatio / (1 + regStats.paperMachineRatio) : 0;

      const deviation = Math.abs(sectionPaperPercent - regionPaperPercent);
      const deviationPercent = regionPaperPercent > 0 ? (deviation / regionPaperPercent) * 100 : 0;

      let isSudden = false;
      if (baseline) {
        const baselinePaperPercent =
          baseline.avgPaperMachineRatio > 0 ? baseline.avgPaperMachineRatio / (1 + baseline.avgPaperMachineRatio) : 0;
        const baselineDeviation = Math.abs(sectionPaperPercent - baselinePaperPercent);
        isSudden = baselinePaperPercent > 0 ? baselineDeviation > baselinePaperPercent * 0.3 : false;
      }

      if (deviationPercent > 30 || isSudden) {
        riskIndicators.push({
          code: 'R2.1',
          category: 'R2',
          severity: deviationPercent > 50 || isSudden ? 'high' : 'medium',
          details: {
            sectionPaperPercent,
            regionPaperPercent
          }
        });
      }
    }

    // R2.2: Party-specific paper dominance (only top 3 parties, only when paper is low)
    let maxR22Deviation = 0;
    let maxR22Party = null;
    let maxR22SectionRatio = 0;
    let maxR22RegionRatio = 0;

    const top3PartyIds = new Set(section.topParties.slice(0, 3).map((tp) => tp.partyId));

    for (const pid in section.partyVotes) {
      if (!top3PartyIds.has(pid)) continue;
      if (pid === '0') continue;

      const votes = section.partyVotes[pid];
      if (!votes || votes.total < 10) continue;

      const paperVotes = votes.paper ?? 0;
      const machineVotes = votes.machine ?? 0;
      if (paperVotes === 0 && machineVotes === 0) continue;

      const sectionPaperRatio = votes.total > 0 ? paperVotes / votes.total : 0;
      const regionPaperRatio = regStats.partyPaperRatios[pid];

      if (regionPaperRatio === undefined) continue;
      if (regionPaperRatio === 0 && sectionPaperRatio === 0) continue;

      if (sectionPaperRatio >= regionPaperRatio) continue;

      const deviation = regionPaperRatio - sectionPaperRatio;
      if (deviation > maxR22Deviation) {
        maxR22Deviation = deviation;
        maxR22Party = pid;
        maxR22SectionRatio = sectionPaperRatio;
        maxR22RegionRatio = regionPaperRatio;
      }
    }

    if (maxR22Party && maxR22Deviation > 0.3) {
      const partyName = section.topParties.find((tp) => tp.partyId === maxR22Party)?.name || parties[maxR22Party] || `Партия ${maxR22Party}`;
      const sectionPercent = Math.round(maxR22SectionRatio * 100);
      const regionPercent = Math.round(maxR22RegionRatio * 100);

      riskIndicators.push({
        code: 'R2.2',
        category: 'R2',
        severity: maxR22Deviation > 0.5 ? 'high' : 'medium',
        details: {
          partyId: maxR22Party,
          sectionPaperRatio: maxR22SectionRatio,
          regionPaperRatio: maxR22RegionRatio
        }
      });
    }

    // R2.3: Asymmetric technology advantage
    if (section.totalPaper && section.totalMachine && section.topParties.length >= 2) {
      const top1 = section.topParties[0];
      const top2 = section.topParties[1];

      const pv1 = section.partyVotes[top1.partyId];
      const pv2 = section.partyVotes[top2.partyId];

      const party1PaperRatio = pv1 && pv1.total > 0 ? (pv1.paper || 0) / pv1.total : 0;
      const party2PaperRatio = pv2 && pv2.total > 0 ? (pv2.paper || 0) / pv2.total : 0;

      const asymmetry = Math.abs(party1PaperRatio - party2PaperRatio);
      if (asymmetry > 0.4) {
        riskIndicators.push({
          code: 'R2.3',
          category: 'R2',
          severity: asymmetry > 0.6 ? 'high' : 'medium',
          details: {
            party1Id: top1.partyId,
            party2Id: top2.partyId,
            party1PaperRatio,
            party2PaperRatio
          }
        });
      }
    }

    // R3.1: Invalid vote anomaly
    if (baseline) {
      const currentInvalidRate = section.voted > 0 ? section.discardedVotes / section.voted : 0;
      const baselineInvalidRate = baseline.avgInvalidRate;
      const change = baselineInvalidRate > 0 ? (currentInvalidRate - baselineInvalidRate) / baselineInvalidRate : 0;

      if (change > 0.5 && currentInvalidRate > regStats.invalidRate * 1.5) {
        riskIndicators.push({
          code: 'R3.1',
          category: 'R3',
          severity: change > 1.0 ? 'high' : 'medium',
          details: {
            currentInvalidRate,
            baselineInvalidRate
          }
        });
      }
    }

    // R3.2: Party-correlated invalid spike
    if (baseline && section.comparisons?.discardedVotes) {
      const currentInvalid = section.discardedVotes;
      const previousInvalid = section.comparisons.discardedVotes[0]?.v || 0;
      const invalidIncrease = currentInvalid - previousInvalid;

      if (invalidIncrease > 0) {
        const losingParties = [];
        for (const pid in section.partyVotes) {
          const votes = section.partyVotes[pid];
          const previousShare = baseline.partyVoteShares[pid] || 0;
          const currentShare = section.voted > 0 ? (votes.total || 0) / section.voted : 0;
          const loss = previousShare - currentShare;

          if (loss > 0.05) {
            const partyName = section.topParties.find((tp) => tp.partyId === pid)?.name || pid;
            losingParties.push({pid, loss, name: partyName});
          }
        }

        if (losingParties.length > 0 && invalidIncrease > section.voted * 0.05) {
          losingParties.sort((a, b) => b.loss - a.loss);
          riskIndicators.push({
            code: 'R3.2',
            category: 'R3',
            severity: 'medium',
            details: {
              invalidIncrease,
              partyId: losingParties[0].pid
            }
          });
        }
      }
    }

    // R4.1: Vote swing
    if (historicalSections.length > 0 && section.topParties.length > 0) {
      const currentTopParty = section.topParties[0];
      const historicalShares = [];

      for (const hs of historicalSections) {
        const pv = hs.partyVotes[currentTopParty.partyId];
        if (pv && hs.voted > 0) historicalShares.push((pv.total || 0) / hs.voted);
      }

      if (historicalShares.length >= 2) {
        let sum = 0;
        for (const x of historicalShares) sum += x;
        const avgHistoricalShare = sum / historicalShares.length;
        const variance = calculateVariance(historicalShares);

        const currentShare = (currentTopParty.percentBp || 0) / 10000;
        const swing = Math.abs(currentShare - avgHistoricalShare);

        if (variance < 0.01 && swing > 0.15 && avgHistoricalShare > 0) {
          riskIndicators.push({
            code: 'R4.1',
            category: 'R4',
            severity: swing > 0.25 ? 'high' : 'medium',
            details: {
              partyId: currentTopParty.partyId,
              swing,
              avgHistoricalShare,
              currentShare
            }
          });
        }
      }
    }

    // R4.2: Fragmentation shock (Herfindahl)
    if (historicalSections.length > 0) {
      const calculateHerfindahl = (sec) => {
        let sum = 0;
        for (const pid in sec.partyVotes) {
          const votes = sec.partyVotes[pid];
          const share = sec.voted > 0 ? (votes.total || 0) / sec.voted : 0;
          sum += share * share;
        }
        return sum;
      };

      const currentHerfindahl = calculateHerfindahl(section);

      let sumH = 0;
      const hsH = [];
      for (const hs of historicalSections) {
        const h = calculateHerfindahl(hs);
        hsH.push(h);
        sumH += h;
      }
      const avgHistorical = hsH.length > 0 ? sumH / hsH.length : 0;
      const change = Math.abs(currentHerfindahl - avgHistorical);

      if (change > 0.15) {
        const isFragmentation = currentHerfindahl < avgHistorical;
        riskIndicators.push({
          code: 'R4.2',
          category: 'R4',
          severity: change > 0.25 ? 'high' : 'medium',
          details: {
            currentHerfindahl,
            avgHistorical,
            isFragmentation
          }
        });
      }
    }

    // R4.3: Swing section (compare top party with ПП-ДБ)
    if (section.topParties.length >= 1) {
      const top1 = section.topParties[0];
      let ppdb = section.topParties.find((tp) => tp.name.includes('ПП-ДБ') || tp.name.includes('ПРОДЪЛЖАВАМЕ'));

      if (!ppdb) {
        // find ppdb party id among partyVotes
        let ppdbPartyId = null;
        for (const pid in section.partyVotes) {
          const partyName = parties[pid] || '';
          if (partyName.includes('ПП-ДБ') || partyName.includes('ПРОДЪЛЖАВАМЕ')) {
            ppdbPartyId = pid;
            break;
          }
        }

        if (ppdbPartyId && section.partyVotes[ppdbPartyId] && section.voted > 0) {
          const ppdbVotes = section.partyVotes[ppdbPartyId];
          const ppdbPercent = section.voted > 0 ? (ppdbVotes.total || 0) / section.voted : 0;
          ppdb = {
            partyId: ppdbPartyId,
            name: parties[ppdbPartyId] || 'ПП-ДБ',
            percentBp: Math.round(ppdbPercent * 10000)
          };
        }
      }

      if (ppdb && ppdb.partyId !== top1.partyId) {
        const margin = ((top1.percentBp || 0) - (ppdb.percentBp || 0)) / 10000;
        if (margin < 0.05 && margin > 0) {
          riskIndicators.push({
            code: 'R4.3',
            category: 'R4',
            severity: 'low',
            details: {
              topPartyId: top1.partyId,
              ppdbPartyId: ppdb.partyId,
              margin
            }
          });
        }
      }
    }

    // ===== CANDIDATE-RELATED RISKS (use precomputed region aggregates) =====
    const regionCandidateStats = candidateAggByRegion.get(regionKey);
    const regionPartyPreferenceStats = partyPrefAggByRegion.get(regionKey);

    // Note: R2.4 is now calculated at region level after all sections are processed

    // R2.5: Party list vs candidate preference inversion
    if (section.candidateVotes && section.partyVotes) {
      for (const partyId in section.partyVotes) {
        const partyVotes = section.partyVotes[partyId];
        const partyTotal = partyVotes.total || 0;
        if (partyTotal < 20) continue;

        const partyPaperRatio = partyTotal > 0 ? (partyVotes.paper || 0) / partyTotal : 0;
        const partyMachineRatio = partyTotal > 0 ? (partyVotes.machine || 0) / partyTotal : 0;

        if (partyMachineRatio > 0.6) {
          for (const key in section.candidateVotes) {
            const candidate = section.candidateVotes[key];
            if (candidate.partyId !== partyId) continue;

            const candidateTotal = candidate.paper + candidate.machine;
            if (candidateTotal < 10) continue;

            const candidatePaperRatio = candidateTotal > 0 ? candidate.paper / candidateTotal : 0;
            if (candidatePaperRatio > 0.6 && (candidatePaperRatio - partyPaperRatio) > 0.3) {
              riskIndicators.push({
                code: 'R2.5',
                category: 'R2',
                severity: 'medium',
                details: {
                  candidateId: candidate.candidateId,
                  partyId: candidate.partyId,
                  sectionId: section.sectionId,
                  candidatePaperRatio,
                  partyMachineRatio
                }
              });
            }
          }
        }
      }
    }

    // R4.4: Candidate volatility mismatch (unique per candidate)
    if (historicalSections.length >= 2 && section.candidateVotes) {
      for (const key in section.candidateVotes) {
        const candidate = section.candidateVotes[key];
        const partyId = candidate.partyId;
        const candidateKey = `${regionKey}_${partyId}_${candidate.candidateId}`;

        // Check if R4.4 already exists for this candidate
        if (r44ByCandidate.has(candidateKey)) continue;

        const partyShares = [];
        const candidateShares = [];
        let candidateHistoryCount = 0;

        for (const hs of historicalSections) {
          const pv = hs.partyVotes[partyId];
          partyShares.push(pv && hs.voted > 0 ? (pv.total || 0) / hs.voted : 0);

          const cv = hs.candidateVotes?.[key];
          if (cv && pv && (pv.total || 0) > 0) {
            candidateShares.push((cv.total || 0) / (pv.total || 1));
            if ((cv.total || 0) > 0) candidateHistoryCount++;
          } else {
            candidateShares.push(0);
          }
        }

        const partyVariance = calculateVariance(partyShares);
        const candidateVariance = calculateVariance(candidateShares);

        if (candidateHistoryCount >= 2 && partyVariance > 0.01 && candidateVariance < partyVariance * 0.3) {
          const r44Risk = {
            code: 'R4.4',
            category: 'R4',
            severity: 'medium',
            details: {
              candidateId: candidate.candidateId,
              partyId: candidate.partyId,
              sectionId: section.sectionId
            }
          };
          riskIndicators.push(r44Risk);
          r44ByCandidate.set(candidateKey, r44Risk);
        }
      }
    }

    // R5.1: Preference participation rate anomaly
    if (section.candidateVotes && regionPartyPreferenceStats) {
      for (const key in section.candidateVotes) {
        const candidate = section.candidateVotes[key];
        const partyId = candidate.partyId;
        const partyVotes = section.partyVotes[partyId];
        if (!partyVotes || partyVotes.total < 10) continue;

        const sectionPreferenceRate = candidate.total / partyVotes.total;
        const regionStats = regionPartyPreferenceStats[partyId];
        if (!regionStats || regionStats.totalPartyVotes < 50) continue;

        const regionPreferenceRate = regionStats.totalPreferences / regionStats.totalPartyVotes;

        if (sectionPreferenceRate > regionPreferenceRate * 1.5 && sectionPreferenceRate > 0.1) {
          const candidateKey = `${regionKey}_${candidate.partyId}_${candidate.candidateId}`;

          // Check if R5.1 already exists for this candidate in this region
          if (!r51ByCandidate.has(candidateKey)) {
            const r51Risk = {
              code: 'R5.1',
              category: 'R5',
              severity: sectionPreferenceRate > regionPreferenceRate * 2 ? 'high' : 'medium',
              details: {
                candidateId: candidate.candidateId,
                partyId: candidate.partyId,
                sectionId: section.sectionId,
                sectionPreferenceRate,
                regionPreferenceRate
              }
            };
            riskIndicators.push(r51Risk);
            r51ByCandidate.set(candidateKey, r51Risk);
          }
        }
      }
    }

    // Note: R5.2 is now calculated at region level after all sections are processed

    // R6.1: Candidate concentration dominance (use region aggregates instead of per-section recompute)
    if (section.candidateVotes && regionCandidateStats) {
      for (const key in section.candidateVotes) {
        const candidate = section.candidateVotes[key];
        const partyId = candidate.partyId;
        const partyVotes = section.partyVotes[partyId];
        if (!partyVotes || partyVotes.total < 10) continue;

        const sectionShare = candidate.total / partyVotes.total;

        // Municipality share using precomputed totals:
        const agg = regionCandidateStats[key];
        // Need total municipality party votes for this candidate's party:
        let municipalityPartyVotes = 0;
        for (const rs of regionSections) {
          const pv = rs.partyVotes?.[partyId];
          if (pv) municipalityPartyVotes += pv.total || 0;
        }
        const municipalityShare = municipalityPartyVotes > 0 ? (agg?.total || 0) / municipalityPartyVotes : 0;

        // Compare to other candidates of same party in this section
        let otherCandidatesTotal = 0;
        for (const k in section.candidateVotes) {
          if (k === key) continue;
          const c = section.candidateVotes[k];
          if (c.partyId === partyId) otherCandidatesTotal += c.total;
        }
        const otherCandidatesShare = partyVotes.total > 0 ? otherCandidatesTotal / partyVotes.total : 0;

        if (sectionShare > municipalityShare * 1.5 && sectionShare > otherCandidatesShare * 2) {
          const candidateKey = `${regionKey}_${candidate.partyId}_${candidate.candidateId}`;

          // Check if R6.1 already exists for this candidate in this region
          if (!r61ByCandidate.has(candidateKey)) {
            const r61Risk = {
              code: 'R6.1',
              category: 'R6',
              severity: sectionShare > municipalityShare * 2 ? 'high' : 'medium',
              details: {
                candidateId: candidate.candidateId,
                partyId: candidate.partyId,
                sectionId: section.sectionId,
                sectionShare,
                municipalityShare,
                otherCandidatesShare
              }
            };
            riskIndicators.push(r61Risk);
            r61ByCandidate.set(candidateKey, r61Risk);
          }
        }
      }
    }

    // R6.2: Candidate-section exclusivity (Gini across region sections) – still O(#sections in region),
    // but avoids global filtering and is only per candidate present in this section.
    if (section.candidateVotes) {
      for (const key in section.candidateVotes) {
        const candidate = section.candidateVotes[key];

        const totals = [];
        for (const rs of regionSections) {
          const cv = rs.candidateVotes?.[key];
          if (cv && cv.total > 0) totals.push(cv.total);
        }
        if (totals.length < 2) continue;

        totals.sort((a, b) => a - b);
        let total = 0;
        for (const x of totals) total += x;
        if (total < 20) continue;

        const gini = calculateGini(totals);
        if (gini > 0.7) {
          riskIndicators.push({
            code: 'R6.2',
            category: 'R6',
            severity: gini > 0.85 ? 'high' : 'medium',
            details: {
              candidateId: candidate.candidateId,
              partyId: candidate.partyId,
              sectionId: section.sectionId,
              sectionsWithCandidate: totals.length,
              regionSectionsCount: regionSections.length,
              gini
            }
          });
        }
      }
    }

    // Update section with risk indicators
    // Filter out candidate-specific risks (R5.1, R6.1, R6.2, R4.4, R2.4, R5.2) from section risks
    const sectionRiskIndicators = riskIndicators.filter((r) => r.code !== 'R5.1' && r.code !== 'R6.1' && r.code !== 'R6.2' && r.code !== 'R4.4' && r.code !== 'R2.4' && r.code !== 'R5.2');

    if (sectionRiskIndicators.length > 0) {
      section.riskIndicators = sectionRiskIndicators;

      section.riskScore = (section.riskScore || 0) + sectionRiskIndicators.length;
    }

    // Store all candidate risks (including R5.1, R6.1, R6.2, R4.4, R2.4, R5.2) separately
    const candidateRiskIndicators = riskIndicators.filter((r) =>
      r.code === 'R5.1' || r.code === 'R6.1' || r.code === 'R6.2' || r.code === 'R4.4' || r.code === 'R2.4' || r.code === 'R5.2' || (r.details && r.details.candidateId)
    );
      if (candidateRiskIndicators.length > 0) {
        section.candidateRiskIndicators = candidateRiskIndicators;
      }
    }
  });

  // Calculate R2.4 at region level for candidates (after all sections processed)
  timeAction('Compute R2.4 candidate risks (region)', () => {
    const r24ByCandidate = new Map(); // key: `${regionKey}_${partyId}_${candidateId}`
    for (const [regionKey, regionSections] of current.byRegion.entries()) {
      // Aggregate candidate votes across all sections in the region
      const regionCandidateVotes = new Map(); // key: `${partyId}_${candidateId}` -> {paper, machine, candidateName, partyName, candidateId, partyId}

      for (const section of regionSections) {
        if (!section.candidateVotes) continue;

        for (const key in section.candidateVotes) {
          const candidate = section.candidateVotes[key];
          const candidateKey = `${candidate.partyId}_${candidate.candidateId}`;

          if (!regionCandidateVotes.has(candidateKey)) {
            regionCandidateVotes.set(candidateKey, {
              paper: 0,
              machine: 0,
              candidateName: candidate.candidateName,
              partyName: candidate.partyName,
              candidateId: candidate.candidateId,
              partyId: candidate.partyId
            });
          }

          const agg = regionCandidateVotes.get(candidateKey);
          agg.paper += candidate.paper;
          agg.machine += candidate.machine;
        }
      }

      // Calculate R2.4 for each candidate at region level
      for (const [candidateKey, candidate] of regionCandidateVotes.entries()) {
        const candidateTotal = candidate.paper + candidate.machine;
        if (candidateTotal < 10) continue;

        const paperShare = candidate.paper / candidateTotal;
        const machineShare = candidate.machine / candidateTotal;
        const divergence = Math.abs(paperShare - machineShare);

        if (divergence > 0.3 && paperShare > 0.7) {
          const r24Key = `${regionKey}_${candidate.partyId}_${candidate.candidateId}`;
          if (r24ByCandidate.has(r24Key)) continue; // Already added

          const r24Risk = {
            code: 'R2.4',
            category: 'R2',
            severity: divergence > 0.5 ? 'high' : 'medium',
            details: {
              candidateId: candidate.candidateId,
              partyId: candidate.partyId,
              paperShare,
              machineShare
              // No sectionId since this is region-level
            }
          };

          // Add R2.4 to candidateRiskIndicators for all sections where this candidate appears
          for (const section of regionSections) {
            if (!section.candidateVotes) continue;
            const sectionCandidateKey = `${candidate.partyId}_${candidate.candidateId}`;
            const sectionCandidate = section.candidateVotes[sectionCandidateKey];

            if (sectionCandidate && sectionCandidate.total > 0) {
              if (!section.candidateRiskIndicators) {
                section.candidateRiskIndicators = [];
              }
              // Add with sectionId for this specific section
              section.candidateRiskIndicators.push({
                ...r24Risk,
                details: {
                  ...r24Risk.details,
                  sectionId: section.sectionId
                }
              });
            }
          }

          r24ByCandidate.set(r24Key, r24Risk);
        }
      }
    }
  });

  // Calculate R5.2 at region level for candidates (after all sections processed)
  timeAction('Compute R5.2 candidate risks (region)', () => {
    const r52ByCandidate = new Map(); // key: `${regionKey}_${partyId}_${candidateId}`
    for (const [regionKey, regionSections] of current.byRegion.entries()) {
      // Aggregate candidate and party votes across all sections in the region for current date
      const regionCandidateVotes = new Map(); // key: `${partyId}_${candidateId}` -> {total, candidateName, partyName, candidateId, partyId}
      const regionPartyVotes = new Map(); // key: partyId -> total

      for (const section of regionSections) {
        // Aggregate party votes
        if (section.partyVotes) {
          for (const partyId in section.partyVotes) {
            const votes = section.partyVotes[partyId];
            const currentTotal = regionPartyVotes.get(partyId) || 0;
            regionPartyVotes.set(partyId, currentTotal + (votes.total || 0));
          }
        }

        // Aggregate candidate votes
        if (section.candidateVotes) {
          for (const key in section.candidateVotes) {
            const candidate = section.candidateVotes[key];
            const candidateKey = `${candidate.partyId}_${candidate.candidateId}`;

            if (!regionCandidateVotes.has(candidateKey)) {
              regionCandidateVotes.set(candidateKey, {
                total: 0,
                candidateName: candidate.candidateName,
                partyName: candidate.partyName,
                candidateId: candidate.candidateId,
                partyId: candidate.partyId
              });
            }

            const agg = regionCandidateVotes.get(candidateKey);
            agg.total += candidate.total;
          }
        }
      }

      // Get historical data for this region
      const historicalRegionData = [];
      for (const d of histDates) {
        const historicalByRegion = rawData[d].byRegion;
        const historicalRegionSections = historicalByRegion.get(regionKey) || [];

        // Aggregate historical candidate and party votes for this region
        const histCandidateVotes = new Map();
        const histPartyVotes = new Map();

        for (const hs of historicalRegionSections) {
          // Aggregate historical party votes
          if (hs.partyVotes) {
            for (const partyId in hs.partyVotes) {
              const votes = hs.partyVotes[partyId];
              const currentTotal = histPartyVotes.get(partyId) || 0;
              histPartyVotes.set(partyId, currentTotal + (votes.total || 0));
            }
          }

          // Aggregate historical candidate votes
          if (hs.candidateVotes) {
            for (const key in hs.candidateVotes) {
              const candidate = hs.candidateVotes[key];
              const candidateKey = `${candidate.partyId}_${candidate.candidateId}`;

              if (!histCandidateVotes.has(candidateKey)) {
                histCandidateVotes.set(candidateKey, {
                  total: 0,
                  candidateId: candidate.candidateId,
                  partyId: candidate.partyId
                });
              }

              const agg = histCandidateVotes.get(candidateKey);
              agg.total += candidate.total;
            }
          }
        }

        historicalRegionData.push({
          candidateVotes: histCandidateVotes,
          partyVotes: histPartyVotes
        });
      }

      // Calculate R5.2 for each candidate at region level
      for (const [candidateKey, candidate] of regionCandidateVotes.entries()) {
        if (candidate.total < 10) continue;
        if (historicalRegionData.length < 2) continue;

        const partyId = candidate.partyId;
        const currentPartyTotal = regionPartyVotes.get(partyId) || 0;
        if (currentPartyTotal === 0) continue;

        const currentRate = candidate.total / currentPartyTotal;

        // Calculate historical rates
        const historicalRates = [];
        for (const histData of historicalRegionData) {
          const histCandidate = histData.candidateVotes.get(candidateKey);
          const histPartyTotal = histData.partyVotes.get(partyId) || 0;

          if (histCandidate && histPartyTotal > 0) {
            historicalRates.push(histCandidate.total / histPartyTotal);
          } else {
            historicalRates.push(0);
          }
        }

        let sum = 0;
        for (const r of historicalRates) sum += r;
        const avgHistoricalRate = historicalRates.length > 0 ? sum / historicalRates.length : 0;
        if (avgHistoricalRate === 0) continue;

        const historicalStdDev = Math.sqrt(calculateVariance(historicalRates));
        const threshold = avgHistoricalRate + 3 * historicalStdDev;

        if (avgHistoricalRate < 0.05 && avgHistoricalRate > 0 && currentRate > threshold && currentRate > 0.1) {
          const r52Key = `${regionKey}_${candidate.partyId}_${candidate.candidateId}`;
          if (r52ByCandidate.has(r52Key)) continue; // Already added

          const r52Risk = {
            code: 'R5.2',
            category: 'R5',
            severity: currentRate > threshold * 2 ? 'high' : 'medium',
            details: {
              candidateId: candidate.candidateId,
              partyId: candidate.partyId,
              avgHistoricalRate,
              currentRate
              // No sectionId since this is region-level
            }
          };

          // Add R5.2 to candidateRiskIndicators for all sections where this candidate appears
          for (const section of regionSections) {
            if (!section.candidateVotes) continue;
            const sectionCandidateKey = `${candidate.partyId}_${candidate.candidateId}`;
            const sectionCandidate = section.candidateVotes[sectionCandidateKey];

            if (sectionCandidate && sectionCandidate.total > 0) {
              if (!section.candidateRiskIndicators) {
                section.candidateRiskIndicators = [];
              }
              // Add with sectionId for this specific section
              section.candidateRiskIndicators.push({
                ...r52Risk,
                details: {
                  ...r52Risk.details,
                  sectionId: section.sectionId
                }
              });
            }
          }

          r52ByCandidate.set(r52Key, r52Risk);
        }
      }
    }
  });

// ---- Candidate-level aggregation (unique R6.1 per candidate) ----
  const candidates = timeAction('Aggregate candidates', () => {
    const candidatesMap = new Map(); // candidateKey (partyId_candidateId) -> candidate object

    for (const [regionKey, regionSections] of current.byRegion.entries()) {
      const r61Agg = aggregateR61ForRegion(regionSections);

      // gather candidate meta from candidateVotes
      const meta = new Map(); // candidateKey -> {regionId, candidateId, candidateName, partyId, partyName}

      for (const s of regionSections) {
        const cv = s.candidateVotes;
        if (!cv) continue;

        for (const k in cv) {
          const c = cv[k];
          const candidateKey = `${c.partyId}_${c.candidateId}`;
          if (!meta.has(candidateKey)) {
            meta.set(candidateKey, {
              // regionId is kept, but candidateKey is GLOBAL, so you can pick first or store list
              regionId: regionKey,
              candidateId: c.candidateId,
              candidateName: c.candidateName,
              partyId: c.partyId,
              partyName: c.partyName
            });
          }
        }
      }

      for (const [candidateKey, m] of meta.entries()) {
        const r61 = r61Agg.get(candidateKey);

        // If no R6.1 for this region, still create candidate entry (optional).
        // If you only want candidates that have R6.1, then: if (!r61) continue;
        const riskIndicators = [];
        if (r61) riskIndicators.push(r61);

        const existing = candidatesMap.get(candidateKey);
        if (!existing) {
          candidatesMap.set(candidateKey, {
            ...m,
            riskIndicators
          });
          continue;
        }

        // Merge (dedupe) riskIndicators; for R6.1 we also merge/average properly
        for (const ri of riskIndicators) {
          if (ri.code !== 'R6.1') {
            // generic dedupe by code
            if (!existing.riskIndicators.some(x => x.code === ri.code)) {
              existing.riskIndicators.push(ri);
            }
            continue;
          }

          const prev = existing.riskIndicators.find(x => x.code === 'R6.1');
          if (!prev) {
            existing.riskIndicators.push(ri);
            continue;
          }

          // Weighted merge of R6.1 averages across regions
          const aCount = prev.details?.sectionsTriggered || 1;
          const bCount = ri.details?.sectionsTriggered || 1;

          const aAvgS = prev.details?.avgSectionShare || 0;
          const bAvgS = ri.details?.avgSectionShare || 0;

          const aAvgM = prev.details?.avgMunicipalityShare || 0;
          const bAvgM = ri.details?.avgMunicipalityShare || 0;

          const mergedCount = aCount + bCount;
          const mergedAvgSectionShare = mergedCount ? (aAvgS * aCount + bAvgS * bCount) / mergedCount : 0;
          const mergedAvgMunicipalityShare = mergedCount ? (aAvgM * aCount + bAvgM * bCount) / mergedCount : 0;

          // update prev in-place
          prev.details.sectionsTriggered = mergedCount;
          prev.details.avgSectionShare = mergedAvgSectionShare;
          prev.details.avgMunicipalityShare = mergedAvgMunicipalityShare;

          prev.severity =
            mergedAvgMunicipalityShare > 0 && mergedAvgSectionShare > mergedAvgMunicipalityShare * 2 ? 'high' : 'medium';
        }
      }
    }

    return Array.from(candidatesMap.values());
  });

  const summaryPayload = timeAction('Build summary payload', () => ({
    version: 2,
    parties,
    regions: regions.map((r) => compactRegion(r, compactMapping))
  }));

  const fullPayload = timeAction('Build full payload (columnar)', () => ({
    version: 2,
    parties,
    regions: regions.map((r) => compactRegion(r, compactMapping)),
    sections: buildColumnarSections(targetSections)
  }));

  const summaryJson = timeAction('Serialize summary JSON', () => JSON.stringify(summaryPayload));
  const fullJson = timeAction('Serialize full JSON', () => JSON.stringify(fullPayload));

  timeAction('Validate JSON', () => {
    let parsed = null;
    try {
      parsed = JSON.parse(summaryJson);
    } catch (err) {
      throw new Error(`Invalid summary JSON output for ${date}: ${err && err.message ? err.message : err}`);
    }
    if (!parsed || !parsed.parties || !parsed.regions) {
      throw new Error(`Missing top-level keys in summary output for ${date}`);
    }

    try {
      parsed = JSON.parse(fullJson);
    } catch (err) {
      throw new Error(`Invalid full JSON output for ${date}: ${err && err.message ? err.message : err}`);
    }
    if (!parsed || !parsed.sections || !parsed.parties || !parsed.regions) {
      throw new Error(`Missing top-level keys in full output for ${date}`);
    }
  });

  timeAction('Write compressed outputs', () => {
    const summaryRaw = Buffer.byteLength(summaryJson);
    const summaryGz = zlib.gzipSync(summaryJson, {level: 9});
    const summaryGzBytes = summaryGz.length;
    const summaryRatio = summaryRaw > 0 ? (summaryGzBytes / summaryRaw).toFixed(3) : '0.000';
    console.log(`Summary size ${date}: rawBytes=${summaryRaw} gzipBytes=${summaryGzBytes} ratio=${summaryRatio}`);
    const summaryGzName = `${date}.summary.${buildTimestamp}.json.gz`;
    fs.writeFileSync(path.join(outputDir, summaryGzName), summaryGz);
    const summaryBr = zlib.brotliCompressSync(Buffer.from(summaryJson), {
      params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11},
    });
    const summaryBrName = `${date}.summary.${buildTimestamp}.json.br`;
    fs.writeFileSync(path.join(outputDir, summaryBrName), summaryBr);

    const fullRaw = Buffer.byteLength(fullJson);
    const fullGz = zlib.gzipSync(fullJson, {level: 9});
    const fullGzBytes = fullGz.length;
    const fullRatio = fullRaw > 0 ? (fullGzBytes / fullRaw).toFixed(3) : '0.000';
    console.log(`Full size ${date}: rawBytes=${fullRaw} gzipBytes=${fullGzBytes} ratio=${fullRatio}`);
    const fullGzName = `${date}.full.${buildTimestamp}.json.gz`;
    fs.writeFileSync(path.join(outputDir, fullGzName), fullGz);
    const fullBr = zlib.brotliCompressSync(Buffer.from(fullJson), {
      params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11},
    });
    const fullBrName = `${date}.full.${buildTimestamp}.json.br`;
    fs.writeFileSync(path.join(outputDir, fullBrName), fullBr);

    manifest.files[date] = {
      summaryGz: summaryGzName,
      summaryBr: summaryBrName,
      fullGz: fullGzName,
      fullBr: fullBrName
    };
  });
}

logSection('Cleanup');
timeAction('Remove intermediate .json files', () => {
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }
});

timeAction('Write manifest', () => {
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
});

console.log(`Done in ${formatSeconds(nowNs() - runStart)}s`);
