const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const elections = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/assets/elections.json'), 'utf8'));
const baseDataDir = path.join(__dirname, '../public/data');
const outputDir = path.join(baseDataDir, 'compiled');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function parseLongSafe(s) {
  if (!s) return 0;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? 0 : n;
}

function normalizePartyName(name) {
  const n = name.toUpperCase();
  if (n.includes('ПРОДЪЛЖАВАМЕ')) return 'ПП-ДБ';
  if (n.includes('ГЕРБ')) return 'ГЕРБ-СДС';
  if (n.includes('ВЪЗРАЖДАНЕ')) return 'ВЪЗРАЖДАНЕ';
  if (n.includes('ДПС')) return 'ДПС';
  if (n.includes('БСП')) return 'БСП';
  if (n.includes('ТАКЪВ НАРОД')) return 'ИТН';
  if (n.includes('ВЕЛИЧИЕ')) return 'ВЕЛИЧИЕ';
  if (n.includes('МЕЧ')) return 'МЕЧ';
  return name;
}

function parseParties(text) {
  const parties = {};
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 2) continue;
    const partyId = parts[0].trim();
    const partyName = parts[1].trim();
    if (partyId) {
      parties[partyId] = partyName;
    }
  }
  parties['0'] = 'Други';
  return parties;
}

function parseSections(text) {
  const sections = {};
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length <= 5) continue;

    const sectionId = parts[0].trim();
    const regionId = parts[1].trim();
    const regionName = parts[2].trim();
    const cityName = parts[4].trim();
    let sectionName = parts[5].trim().replace(/\s+([,.!? ])/g, '$1');

    if (sectionName.toLowerCase().startsWith('гр.') || sectionName.toLowerCase().startsWith('с.')) {
      sectionName = sectionName.substring(cityName.length + 2);
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

    if (sectionId) {
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
        partyVotes: {},
        topParties: [],
        activityPercent: 0
      };
    }
  }
  return sections;
}

function applyProtocols(sections, text) {
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length <= 9) continue;

    const sectionId = parts[1].trim();
    const section = sections[sectionId];
    if (!section) continue;

    if (parts.length == 21) {
      // 2024.06
      section.total = parseLongSafe(parts[7]) + parseLongSafe(parts[10]);
      section.voted = parseLongSafe(parts[11]);
      section.discardedVotes = parseLongSafe(parts[15]);
      section.noVotesPaper = parseLongSafe(parts[16]);
      section.noVotesMachine = parseLongSafe(parts[19]);
      section.protocolPaperVotes = parseLongSafe(parts[14]);
      section.protocolMachineVotes = parseLongSafe(parts[18]);
    } else if (parts.length == 25) {
      // 2023.04
      section.total = parseLongSafe(parts[7]) + parseLongSafe(parts[8]);
      section.voted = parseLongSafe(parts[9]);
      section.discardedVotes = parseLongSafe(parts[15]);
      section.noVotesPaper = parseLongSafe(parts[22]);
      section.noVotesMachine = parseLongSafe(parts[23]);
      section.protocolPaperVotes = parseLongSafe(parts[12]);
      section.protocolMachineVotes = parseLongSafe(parts[13]);
    } else {
      // 2024.10
      section.total = parseLongSafe(parts[7]) + parseLongSafe(parts[8]);
      section.voted = parseLongSafe(parts[9]);
      section.discardedVotes = parseLongSafe(parts[13]);
      section.noVotesPaper = parseLongSafe(parts[14]);
      section.noVotesMachine = parseLongSafe(parts[17]);
      section.protocolPaperVotes = parseLongSafe(parts[12]);
      section.protocolMachineVotes = parseLongSafe(parts[16]);
    }
    section.noVotes = (section.noVotesPaper || 0) + (section.noVotesMachine || 0);
    section.protocolErrorDiff = section.voted - (section.protocolPaperVotes || 0) - (section.protocolMachineVotes || 0);
    section.hasProtocolError = section.protocolErrorDiff != 0;
  }
}

function applyVotes(sections, text) {
  const lines = text.split('\n');
  let step;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 4) continue;

    const sectionId = parts[1].trim();
    const section = sections[sectionId];
    if (!section) continue;

    if (!step) {
      if (+parts[3] === +parts[3+5] - 1 && +parts[3+5] === +parts[3+10] - 1) {
        step = 5;
      } else {
        step = 4;
      }
    }

    for (let i = 3; i + 3 < parts.length; i += step) {
      const partyId = parts[i].trim();
      const total = parseLongSafe(parts[i + 1]);
      const paper = parseLongSafe(parts[i + 2]);
      const machine = parseLongSafe(parts[i + 3]);

      if (!section.partyVotes[partyId]) {
        section.partyVotes[partyId] = { total: 0, paper: 0, machine: 0 };
      }
      section.partyVotes[partyId].total += total;
      section.partyVotes[partyId].paper += paper;
      section.partyVotes[partyId].machine += machine;
    }
  }
}

function parseLocalCandidates(text) {
  const candidates = {}; // regionId -> { partyId -> { candidateId -> { candidateId, candidateName } } }
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 6) continue;

    const regionId = parts[0].trim();
    const partyId = parts[2].trim();
    const candidateId = parts[4].trim();
    const candidateName = parts[5].trim();

    if (!regionId || !partyId || !candidateId || !candidateName) continue;

    if (!candidates[regionId]) {
      candidates[regionId] = {};
    }
    if (!candidates[regionId][partyId]) {
      candidates[regionId][partyId] = {};
    }
    candidates[regionId][partyId][candidateId] = {
      candidateId,
      candidateName
    };
  }
  return candidates;
}

function applyPreferences(sections, text, candidatesByRegion, parties) {
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 7) continue;

    const sectionId = parts[1].trim();
    const partyId = parts[2].trim();
    const preferenceVote = parts[3].trim();
    const paperVotes = parseLongSafe(parts[5]);
    const machineVotes = parseLongSafe(parts[6]);
    const totalVotes = paperVotes + machineVotes;

    if (preferenceVote === 'Без' || !preferenceVote || totalVotes === 0) continue;

    const section = sections[sectionId];
    if (!section) continue;

    const regionId = section.regionId;
    const candidates = candidatesByRegion[regionId];
    if (!candidates || !candidates[partyId] || !candidates[partyId][preferenceVote]) continue;

    const candidate = candidates[partyId][preferenceVote];
    const partyName = parties[partyId] || partyId;

    if (!section.candidateVotes) {
      section.candidateVotes = {};
    }
    const key = `${partyId}_${preferenceVote}`;
    if (!section.candidateVotes[key]) {
      section.candidateVotes[key] = {
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        partyId: partyId,
        partyName: partyName,
        total: 0,
        paper: 0,
        machine: 0
      };
    }
    section.candidateVotes[key].total += totalVotes;
    section.candidateVotes[key].paper += paperVotes;
    section.candidateVotes[key].machine += machineVotes;
  }
}

console.log('Loading raw data...');
const rawData = {};
for (const { date } of elections) {
  console.log(`Processing ${date}...`);
  const baseUrl = path.join(baseDataDir, date);
  const sectionsText = fs.readFileSync(path.join(baseUrl, 'sections.txt'), 'utf8');
  const protocolsText = fs.readFileSync(path.join(baseUrl, 'protocols.txt'), 'utf8');
  const votesText = fs.readFileSync(path.join(baseUrl, 'votes.txt'), 'utf8');
  const partiesText = fs.readFileSync(path.join(baseUrl, 'cik_parties.txt'), 'utf8');

  const parties = parseParties(partiesText);
  const sectionsMap = parseSections(sectionsText);
  applyProtocols(sectionsMap, protocolsText);
  applyVotes(sectionsMap, votesText);

  // Parse local candidates and preferences if files exist
  const localCandidatesPath = path.join(baseUrl, 'local_candidates.txt');
  const preferencesPath = path.join(baseUrl, 'preferences.txt');
  if (fs.existsSync(localCandidatesPath) && fs.existsSync(preferencesPath)) {
    const localCandidatesText = fs.readFileSync(localCandidatesPath, 'utf8');
    const preferencesText = fs.readFileSync(preferencesPath, 'utf8');
    const candidatesByRegion = parseLocalCandidates(localCandidatesText);
    applyPreferences(sectionsMap, preferencesText, candidatesByRegion, parties);
  }

  const sections = Object.values(sectionsMap);
  for (const section of sections) {
    section.totalPaper = section.protocolPaperVotes || 0;
    section.totalMachine = section.protocolMachineVotes || 0;
    section.activityPercent = section.total > 0 ? section.voted / section.total : 0;

    section.topParties = Object.entries(section.partyVotes)
      .filter(([id, _]) => id !== '0')
      .map(([partyId, votes]) => {
        let name = parties[partyId] || partyId;
        if (name.includes('ПРОДЪЛЖАВАМЕ')) {
          name = 'ПП-ДБ';
        }
        return {
          name,
          partyId,
          total: votes.total,
          percent: section.voted > 0 ? votes.total / section.voted : 0,
          comparisons: []
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total);

    section.topParties = section.topParties.slice(0, 3);

    // Calculate top 3 candidates
    if (section.candidateVotes) {
      section.topCandidates = Object.values(section.candidateVotes)
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map(c => ({
          candidateName: c.candidateName,
          partyId: c.partyId,
          partyName: c.partyName,
          total: c.total
        }));
    } else {
      section.topCandidates = [];
    }
  }
  rawData[date] = { sections, parties };
}

console.log('Calculating comparisons and aggregating regions...');

const dates = elections.map(e => e.date);

for (const date of dates) {
  console.log(`Finalizing ${date}...`);
  const targetSections = rawData[date].sections;
  const parties = rawData[date].parties;

  // Calculate Region averages (turnout and party percentages)
  const regionMap = new Map();
  targetSections.forEach(s => {
    const regionKey = s.regionId;
    if (!regionMap.has(regionKey)) {
      regionMap.set(regionKey, { voted: 0, total: 0, partyVotes: {} });
    }
    const r = regionMap.get(regionKey);
    r.voted += s.voted;
    r.total += s.total;
    Object.entries(s.partyVotes).forEach(([pid, votes]) => {
      r.partyVotes[pid] = (r.partyVotes[pid] || 0) + votes.total;
    });
  });

  const regionStats = {};
  regionMap.forEach((data, id) => {
    regionStats[id] = {
      avgTurnout: data.total > 0 ? data.voted / data.total : 0,
      partyPercents: {}
    };
    Object.entries(data.partyVotes).forEach(([pid, total]) => {
      regionStats[id].partyPercents[pid] = data.voted > 0 ? total / data.voted : 0;
    });
  });

  // Set region stats for sections (used by enhanced risk detection)
  targetSections.forEach(s => {
    const regionKey = s.regionId;
    const stats = regionStats[regionKey];
    s.municipalityAvgTurnout = stats.avgTurnout;
    s.municipalityPartyPercents = stats.partyPercents;
    // Initialize risks array (will be populated by enhanced risk detection)
    s.risks = [];
    s.riskScore = 0;
  });

  const regionsMap = new Map();

  targetSections.forEach(s => {
    if (!regionsMap.has(s.regionId)) {
      regionsMap.set(s.regionId, {
        name: s.regionName,
        partyVotes: {},
        voted: 0,
        total: 0,
        discardedVotes: 0,
        noVotes: 0,
        totalPaper: 0,
        totalMachine: 0,
        sections: []
      });
    }
    const reg = regionsMap.get(s.regionId);
    reg.sections.push(s);
    reg.voted += s.voted;
    reg.total += s.total;
    reg.discardedVotes += s.discardedVotes;
    reg.noVotes += s.noVotes;
    reg.totalPaper += s.totalPaper || 0;
    reg.totalMachine += s.totalMachine || 0;
    Object.entries(s.partyVotes).forEach(([pid, v]) => {
      reg.partyVotes[pid] = (reg.partyVotes[pid] || 0) + v.total;
    });
  });

  const regions = Array.from(regionsMap.entries()).map(([id, data]) => {
    const topParties = Object.entries(data.partyVotes)
      .filter(([pid, _]) => pid !== '0')
      .map(([pid, total]) => {
        let name = parties[pid] || pid;
        if (name.includes('ПРОДЪЛЖАВАМЕ')) {
          name = 'ПП-ДБ';
        }
        return {
          name,
          total,
          percent: data.voted > 0 ? total / data.voted : 0,
          comparisons: []
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const region = {
      id,
      name: data.name,
      total: data.total,
      voted: data.voted,
      partyVotes: data.partyVotes,
      topParties,
      discardedVotes: data.discardedVotes,
      noVotes: data.noVotes,
      totalPaper: data.totalPaper,
      totalMachine: data.totalMachine,
      comparisons: {}
    };

    // Add comparisons
    dates.filter(d => d !== date).forEach(d => {
      const otherSections = rawData[d].sections.filter(s => s.regionId === id);
      const otherVoted = otherSections.reduce((sum, s) => sum + s.voted, 0);
      const otherTotal = otherSections.reduce((sum, s) => sum + s.total, 0);
      const otherDiscarded = otherSections.reduce((sum, s) => sum + s.discardedVotes, 0);
      const otherNoVotes = otherSections.reduce((sum, s) => sum + s.noVotes, 0);
      const otherPaper = otherSections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);
      const otherMachine = otherSections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);
      const dateName = elections.find(ed => ed.date === d).name;

      region.comparisons['voted'] = region.comparisons['voted'] || [];
      region.comparisons['voted'].push({ value: otherVoted, date: d, dateName });

      region.comparisons['total'] = region.comparisons['total'] || [];
      region.comparisons['total'].push({ value: otherTotal, date: d, dateName });

      region.comparisons['discardedVotes'] = region.comparisons['discardedVotes'] || [];
      region.comparisons['discardedVotes'].push({ value: otherDiscarded, date: d, dateName });

      region.comparisons['noVotes'] = region.comparisons['noVotes'] || [];
      region.comparisons['noVotes'].push({ value: otherNoVotes, date: d, dateName });

      region.comparisons['totalPaper'] = region.comparisons['totalPaper'] || [];
      region.comparisons['totalPaper'].push({ value: otherPaper, date: d, dateName });

      region.comparisons['totalMachine'] = region.comparisons['totalMachine'] || [];
      region.comparisons['totalMachine'].push({ value: otherMachine, date: d, dateName });

      region.comparisons['activityPercent'] = region.comparisons['activityPercent'] || [];
      region.comparisons['activityPercent'].push({ value: otherTotal > 0 ? otherVoted / otherTotal : 0, date: d, dateName });

      // Party comparisons for regions
      const currentPartiesMap = rawData[date].parties;
      const otherPartiesMap = rawData[d].parties;

      Object.keys(region.partyVotes).forEach(pid => {
        const normalizedTarget = normalizePartyName(currentPartiesMap[pid] || pid);

        let otherPartyTotal = 0;
        otherSections.forEach(os => {
          Object.entries(os.partyVotes).forEach(([otherPid, otherVotes]) => {
            if (normalizePartyName(otherPartiesMap[otherPid] || otherPid) === normalizedTarget) {
              otherPartyTotal += otherVotes.total;
            }
          });
        });

        region.comparisons[`party_${pid}`] = region.comparisons[`party_${pid}`] || [];
        region.comparisons[`party_${pid}`].push({ value: otherPartyTotal, date: d, dateName });
      });

      // Top Parties Comparisons for regions
      region.topParties.forEach(tp => {
        const normalizedTarget = normalizePartyName(tp.name);
        let otherTotal = 0;
        otherSections.forEach(os => {
          Object.entries(os.partyVotes).forEach(([pid, votes]) => {
            if (normalizePartyName(otherPartiesMap[pid] || pid) === normalizedTarget) {
              otherTotal += votes.total;
            }
          });
        });

        tp.comparisons = tp.comparisons || [];
        tp.comparisons.push({ value: otherTotal, date: d, dateName });
      });
    });

    return region;
  }).sort((a, b) => {
    const idA = parseInt(a.id, 10);
    const idB = parseInt(b.id, 10);
    if (!isNaN(idA) && !isNaN(idB)) {
      return idA - idB;
    }
    return a.id.localeCompare(b.id);
  });

  // Section Comparisons
  targetSections.forEach(s => {
    s.comparisons = {};
    dates.filter(d => d !== date).forEach(d => {
      const otherSection = rawData[d].sections.find(os => os.sectionId === s.sectionId);
      const dateName = elections.find(ed => ed.date === d).name;
      if (otherSection) {
        s.comparisons['voted'] = s.comparisons['voted'] || [];
        s.comparisons['voted'].push({ value: otherSection.voted, date: d, dateName });

        s.comparisons['total'] = s.comparisons['total'] || [];
        s.comparisons['total'].push({ value: otherSection.total, date: d, dateName });

        s.comparisons['discardedVotes'] = s.comparisons['discardedVotes'] || [];
        s.comparisons['discardedVotes'].push({ value: otherSection.discardedVotes, date: d, dateName });

        s.comparisons['noVotes'] = s.comparisons['noVotes'] || [];
        s.comparisons['noVotes'].push({ value: otherSection.noVotes, date: d, dateName });

        s.comparisons['totalPaper'] = s.comparisons['totalPaper'] || [];
        s.comparisons['totalPaper'].push({ value: otherSection.totalPaper || 0, date: d, dateName });

        s.comparisons['totalMachine'] = s.comparisons['totalMachine'] || [];
        s.comparisons['totalMachine'].push({ value: otherSection.totalMachine || 0, date: d, dateName });

        s.comparisons['activityPercent'] = s.comparisons['activityPercent'] || [];
        s.comparisons['activityPercent'].push({ value: otherSection.activityPercent, date: d, dateName });

        s.comparisons['noVotesPaper'] = s.comparisons['noVotesPaper'] || [];
        s.comparisons['noVotesPaper'].push({ value: otherSection.noVotesPaper || 0, date: d, dateName });

        s.comparisons['noVotesMachine'] = s.comparisons['noVotesMachine'] || [];
        s.comparisons['noVotesMachine'].push({ value: otherSection.noVotesMachine || 0, date: d, dateName });

        s.comparisons['noVotesPercent'] = s.comparisons['noVotesPercent'] || [];
        s.comparisons['noVotesPercent'].push({ value: otherSection.voted > 0 ? otherSection.noVotes / otherSection.voted : 0, date: d, dateName });

        // Party comparisons for sections
        const currentPartiesMap = rawData[date].parties;
        const otherPartiesMap = rawData[d].parties;

        Object.keys(s.partyVotes).forEach(pid => {
          const normalizedTarget = normalizePartyName(currentPartiesMap[pid] || pid);

          let otherTotal = 0;
          let otherPaper = 0;
          let otherMachine = 0;
          let matchFound = false;

          Object.entries(otherSection.partyVotes).forEach(([otherPid, otherVotes]) => {
            if (normalizePartyName(otherPartiesMap[otherPid] || otherPid) === normalizedTarget) {
              otherTotal += otherVotes.total;
              otherPaper += otherVotes.paper;
              otherMachine += otherVotes.machine;
              matchFound = true;
            }
          });

          if (matchFound) {
            s.partyVotes[pid].comparisons = s.partyVotes[pid].comparisons || [];
            s.partyVotes[pid].comparisons.push({ value: otherTotal, date: d, dateName });

            s.partyVotes[pid].percentComparisons = s.partyVotes[pid].percentComparisons || [];
            const otherPercent = otherSection.voted > 0 ? otherTotal / otherSection.voted : 0;
            s.partyVotes[pid].percentComparisons.push({ value: otherPercent, date: d, dateName });

            s.partyVotes[pid].paperComparisons = s.partyVotes[pid].paperComparisons || [];
            s.partyVotes[pid].paperComparisons.push({ value: otherPaper, date: d, dateName });

            s.partyVotes[pid].machineComparisons = s.partyVotes[pid].machineComparisons || [];
            s.partyVotes[pid].machineComparisons.push({ value: otherMachine, date: d, dateName });
          }
        });

        // Top Parties Comparisons for sections
        s.topParties.forEach(tp => {
          const normalizedTarget = normalizePartyName(tp.name);
          let otherTotal = 0;
          Object.entries(otherSection.partyVotes).forEach(([pid, votes]) => {
            if (normalizePartyName(otherPartiesMap[pid] || pid) === normalizedTarget) {
              otherTotal += votes.total;
            }
          });
          tp.comparisons = tp.comparisons || [];
          tp.comparisons.push({ value: otherTotal, date: d, dateName });
        });
      }
    });
  });

  console.log(`Computing enhanced risks for ${date}...`);

  // Compute region statistics for risk detection
  const regionStatsMap = new Map();
  targetSections.forEach(s => {
    const regionKey = s.regionId;
    if (!regionStatsMap.has(regionKey)) {
      regionStatsMap.set(regionKey, {
        sections: [],
        turnoutChanges: [],
        paperTotals: 0,
        machineTotals: 0,
        invalidTotals: 0,
        votedTotals: 0,
        partyPaperTotals: {},
        partyTotals: {}
      });
    }
    const stats = regionStatsMap.get(regionKey);
    stats.sections.push(s);

    // Calculate turnout change
    if (s.comparisons?.['activityPercent'] && s.comparisons['activityPercent'].length > 0) {
      const current = s.activityPercent;
      const previous = s.comparisons['activityPercent'][0].value;
      if (previous > 0) {
        stats.turnoutChanges.push((current - previous) / previous);
      }
    }

    stats.paperTotals += s.totalPaper || 0;
    stats.machineTotals += s.totalMachine || 0;
    stats.invalidTotals += s.discardedVotes;
    stats.votedTotals += s.voted;

    Object.entries(s.partyVotes).forEach(([pid, votes]) => {
      if (!stats.partyPaperTotals[pid]) {
        stats.partyPaperTotals[pid] = 0;
        stats.partyTotals[pid] = 0;
      }
      stats.partyPaperTotals[pid] += votes.paper || 0;
      stats.partyTotals[pid] += votes.total;
    });
  });

  // Convert to final region stats format
  const regionStatsMapFinal = {};
  regionStatsMap.forEach((data, key) => {
    const avgTurnoutChange = data.turnoutChanges.length > 0
      ? data.turnoutChanges.reduce((sum, c) => sum + c, 0) / data.turnoutChanges.length
      : 0;

    const variance = data.turnoutChanges.length > 1
      ? data.turnoutChanges.reduce((sum, c) => sum + Math.pow(c - avgTurnoutChange, 2), 0) / data.turnoutChanges.length
      : 0;
    const turnoutChangeStdDev = Math.sqrt(variance);

    const paperMachineRatio = data.machineTotals > 0 ? data.paperTotals / data.machineTotals : 0;
    const invalidRate = data.votedTotals > 0 ? data.invalidTotals / data.votedTotals : 0;

    const partyPaperRatios = {};
    Object.keys(data.partyTotals).forEach(pid => {
      partyPaperRatios[pid] = data.partyTotals[pid] > 0
        ? data.partyPaperTotals[pid] / data.partyTotals[pid]
        : 0;
    });

    regionStatsMapFinal[key] = {
      avgTurnoutChange,
      turnoutChangeStdDev,
      paperMachineRatio,
      partyPaperRatios,
      invalidRate
    };
  });

  // Compute enhanced risks for each section
  // Note: 'parties' map is available in this scope from earlier in the script
  targetSections.forEach(section => {
    const regionKey = section.regionId;
    const regStats = regionStatsMapFinal[regionKey] || {
      avgTurnoutChange: 0,
      turnoutChangeStdDev: 0,
      paperMachineRatio: 0,
      partyPaperRatios: {},
      invalidRate: 0
    };

    // Get historical sections (from other dates)
    const historicalSections = dates
      .filter(d => d !== date)
      .sort()
      .reverse()
      .slice(0, 3)
      .map(d => rawData[d].sections.find(os => os.sectionId === section.sectionId))
      .filter(s => s !== undefined);

    // Get neighboring sections (same region)
    const neighboringSections = targetSections.filter(s =>
      s.regionId === section.regionId && s.sectionId !== section.sectionId
    );

    // Compute baseline
    let baseline = null;
    if (historicalSections.length > 0) {
      const totalVotes = historicalSections.reduce((sum, s) => sum + s.voted, 0);
      const totalElectors = historicalSections.reduce((sum, s) => sum + s.total, 0);
      const totalInvalid = historicalSections.reduce((sum, s) => sum + s.discardedVotes, 0);
      const totalPaper = historicalSections.reduce((sum, s) => sum + (s.totalPaper || 0), 0);
      const totalMachine = historicalSections.reduce((sum, s) => sum + (s.totalMachine || 0), 0);

      const partyVoteShares = {};
      historicalSections.forEach(s => {
        Object.entries(s.partyVotes).forEach(([pid, votes]) => {
          if (!partyVoteShares[pid]) partyVoteShares[pid] = 0;
          partyVoteShares[pid] += votes.total;
        });
      });

      const totalPartyVotes = Object.values(partyVoteShares).reduce((sum, v) => sum + v, 0);
      Object.keys(partyVoteShares).forEach(pid => {
        partyVoteShares[pid] = totalPartyVotes > 0 ? partyVoteShares[pid] / totalPartyVotes : 0;
      });

      baseline = {
        avgTurnout: totalElectors > 0 ? totalVotes / totalElectors : 0,
        avgInvalidRate: totalVotes > 0 ? totalInvalid / totalVotes : 0,
        avgPaperMachineRatio: totalMachine > 0 ? totalPaper / totalMachine : 0,
        partyVoteShares
      };
    }

    const riskIndicators = [];

    // R1.1: Turnout anomaly
    if (baseline && section.comparisons?.['voted'] && section.comparisons['voted'].length > 0) {
      const currentTurnout = section.activityPercent;
      const previousTurnout = baseline.avgTurnout;
      const turnoutChange = previousTurnout > 0 ? (currentTurnout - previousTurnout) / previousTurnout : 0;
      const deviation = turnoutChange - regStats.avgTurnoutChange;
      const stdDevs = regStats.turnoutChangeStdDev > 0 ? Math.abs(deviation) / regStats.turnoutChangeStdDev : 0;

      if (stdDevs > 2) {
        riskIndicators.push({
          code: 'R1.1',
          category: 'R1',
          severity: stdDevs > 3 ? 'high' : 'medium',
          message: `Аномалия в активността: ${(turnoutChange * 100).toFixed(1)}% промяна (${stdDevs.toFixed(1)}σ от средното)`
        });
      }
    }

      // R1.2: Party turnout capture
      if (baseline && section.comparisons?.['voted'] && section.comparisons['voted'].length > 0) {
        const currentVoted = section.voted;
        const previousVoted = section.comparisons['voted'][0].value || 0;
        const voteIncrease = currentVoted - previousVoted;

        if (voteIncrease > 0 && previousVoted > 0) {
          let maxCapture = 0;
          let capturingParty = null;

          // Get actual previous votes from historical section if available
          const previousSection = historicalSections.length > 0 ? historicalSections[0] : null;

          Object.entries(section.partyVotes).forEach(([pid, votes]) => {
            // Try to get actual previous votes from historical section first
            let previousVotes = 0;
            if (previousSection && previousSection.partyVotes[pid]) {
              previousVotes = previousSection.partyVotes[pid].total || 0;
            } else {
              // Fallback to baseline estimate
              previousVotes = (baseline.partyVoteShares[pid] || 0) * previousVoted;
            }

            const currentVotes = votes.total;
            const partyIncrease = currentVotes - previousVotes;

            // Calculate capture ratio, but cap it at 1.0 (100%) to handle edge cases
            // where previous estimate might be wrong or party had negative votes before
            const captureRatio = voteIncrease > 0 ? Math.min(1.0, Math.max(0, partyIncrease / voteIncrease)) : 0;

            if (captureRatio > maxCapture) {
              maxCapture = captureRatio;
              capturingParty = pid;
            }
          });

          // Only flag if capture is significant (>= 60%) and reasonable (<= 100%)
          if (maxCapture >= 0.6 && maxCapture <= 1.0 && capturingParty) {
            const partyName = section.topParties.find(tp => tp.partyId === capturingParty)?.name || capturingParty;
            const historicalShare = baseline.partyVoteShares[capturingParty] || 0;
            const currentShare = section.voted > 0 ? section.partyVotes[capturingParty]?.total / section.voted : 0;

            if (historicalShare < 0.3 && currentShare > 0.5) {
              riskIndicators.push({
                code: 'R1.2',
                category: 'R1',
                severity: maxCapture > 0.8 ? 'high' : 'medium',
                message: `Една партия улавя ${(maxCapture * 100).toFixed(0)}% от новите гласове: ${partyName}`
              });
            }
          }
        }
      }

    // R1.3: Vote share rigidity
    if (historicalSections.length >= 2) {
      const partyVariances = {};
      historicalSections.forEach(s => {
        Object.entries(s.partyVotes).forEach(([pid, votes]) => {
          if (!partyVariances[pid]) partyVariances[pid] = [];
          const share = s.voted > 0 ? votes.total / s.voted : 0;
          partyVariances[pid].push(share);
        });
      });

      let maxRigidParty = null;
      let maxRigidShare = 0;
      let minRigidVariance = Infinity;

      Object.entries(partyVariances).forEach(([pid, shares]) => {
        if (shares.length < 2) return;
        const avgShare = shares.reduce((sum, s) => sum + s, 0) / shares.length;
        const variance = shares.reduce((sum, s) => sum + Math.pow(s - avgShare, 2), 0) / shares.length;

        if (avgShare > 0.6 && variance < 0.01 && avgShare > maxRigidShare) {
          maxRigidParty = pid;
          maxRigidShare = avgShare;
          minRigidVariance = variance;
        }
      });

      if (maxRigidParty && neighboringSections.length > 0) {
        const neighborShares = neighboringSections
          .map(ns => ns.partyVotes[maxRigidParty] ? ns.partyVotes[maxRigidParty].total / (ns.voted || 1) : 0)
          .filter(s => s > 0);

        if (neighborShares.length > 0) {
          const neighborAvg = neighborShares.reduce((sum, v) => sum + v, 0) / neighborShares.length;
          const neighborVariance = neighborShares.reduce((sum, v) => sum + Math.pow(v - neighborAvg, 2), 0) / neighborShares.length;

          if (neighborVariance > minRigidVariance * 3) {
            const partyName = section.topParties.find(tp => tp.partyId === maxRigidParty)?.name || maxRigidParty;
            riskIndicators.push({
              code: 'R1.3',
              category: 'R1',
              severity: 'medium',
              message: `Ниска волатилност на ${partyName} спрямо съседните секции`
            });
          }
        }
      }
    }

    // R2.1: Paper/machine deviation
    // Only flag if section has meaningful vote count (at least 50 votes)
    if (section.totalPaper && section.totalMachine && section.voted >= 50) {
      const sectionPaperPercent = section.totalPaper / section.voted;
      const regionPaperPercent = regStats.paperMachineRatio > 0
        ? regStats.paperMachineRatio / (1 + regStats.paperMachineRatio)
        : 0;
      const deviation = Math.abs(sectionPaperPercent - regionPaperPercent);
      const deviationPercent = regionPaperPercent > 0 ? (deviation / regionPaperPercent) * 100 : 0;

      let isSudden = false;
      if (baseline) {
        const baselinePaperPercent = baseline.avgPaperMachineRatio > 0
          ? baseline.avgPaperMachineRatio / (1 + baseline.avgPaperMachineRatio)
          : 0;
        const baselineDeviation = Math.abs(sectionPaperPercent - baselinePaperPercent);
        isSudden = baselineDeviation > baselinePaperPercent * 0.3;
      }

      if (deviationPercent > 30 || isSudden) {
        riskIndicators.push({
          code: 'R2.1',
          category: 'R2',
          severity: deviationPercent > 50 || isSudden ? 'high' : 'medium',
          message: `Отклонение в съотношението хартия/машина: ${(sectionPaperPercent * 100).toFixed(1)}% хартиени (регион: ${(regionPaperPercent * 100).toFixed(1)}%)`
        });
      }
    }

    // R2.2: Party-specific paper dominance (only flag low paper % for top 3 parties)
    // Only check top 3 parties and only flag when paper percentage is low (high machine percentage)
    let maxR22Deviation = 0;
    let maxR22Party = null;
    let maxR22Message = null;
    let maxR22SectionRatio = 0;
    let maxR22RegionRatio = 0;

    // Get party names map for better display
    const partyNamesMap = {};
    section.topParties.forEach(tp => {
      partyNamesMap[tp.partyId] = tp.name;
    });

    // Only check top 3 parties
    const top3PartyIds = new Set(section.topParties.slice(0, 3).map(tp => tp.partyId));

    // Check only top 3 parties
    Object.entries(section.partyVotes).forEach(([pid, votes]) => {
      // Skip if not in top 3
      if (!top3PartyIds.has(pid)) return;

      // Skip if party has no votes or too few votes (need at least 10 for meaningful analysis)
      if (!votes || votes.total === 0 || votes.total < 10) return;

      // Skip party ID "0" (no votes party) as it's not meaningful for this analysis
      if (pid === '0') return;

      // Get paper and machine values (handle undefined/null)
      const paperVotes = votes.paper ?? 0;
      const machineVotes = votes.machine ?? 0;

      // Skip if we don't have paper/machine breakdown (both are 0 or undefined)
      // Note: A party can have 0 paper (all machine) or 0 machine (all paper), which is valid
      if (paperVotes === 0 && machineVotes === 0) return;

      // Calculate paper ratio for this party in this section
      const sectionPaperRatio = votes.total > 0 ? paperVotes / votes.total : 0;

      // Get region average for this party
      const regionPaperRatio = regStats.partyPaperRatios[pid] ?? 0;

      // Skip if we don't have region data (can't compare)
      if (regionPaperRatio === 0 && !regStats.partyPaperRatios.hasOwnProperty(pid)) return;

      // Skip if both are 0 (no meaningful data)
      if (regionPaperRatio === 0 && sectionPaperRatio === 0) return;

      // Only flag when paper percentage is LOW (meaning machine percentage is high)
      // This means sectionPaperRatio should be significantly lower than regionPaperRatio
      if (sectionPaperRatio >= regionPaperRatio) return;

      const deviation = regionPaperRatio - sectionPaperRatio; // Positive when section has less paper than region

      // Track the party with the highest deviation (section has much less paper than region average)
      if (deviation > maxR22Deviation) {
        maxR22Deviation = deviation;
        maxR22Party = pid;
        maxR22SectionRatio = sectionPaperRatio;
        maxR22RegionRatio = regionPaperRatio;
      }
    });

    // Only flag if the highest deviation meets the significance threshold (30%+ difference)
    if (maxR22Party && maxR22Deviation > 0.3) {
      const partyName = partyNamesMap[maxR22Party] || (parties && parties[maxR22Party]) || `Партия ${maxR22Party}`;
      const sectionPercent = Math.round(maxR22SectionRatio * 100);
      const regionPercent = Math.round(maxR22RegionRatio * 100);
      maxR22Message = `${partyName}: ${sectionPercent}% хартиени (регион: ${regionPercent}%)`;
    }

    if (maxR22Party && maxR22Message) {
      riskIndicators.push({
        code: 'R2.2',
        category: 'R2',
        severity: maxR22Deviation > 0.5 ? 'high' : 'medium',
        message: maxR22Message
      });
    }

    // R2.3: Asymmetric technology advantage
    if (section.totalPaper && section.totalMachine && section.topParties.length >= 2) {
      const top1 = section.topParties[0];
      const top2 = section.topParties[1];
      const party1PaperRatio = section.partyVotes[top1.partyId]?.total > 0 ?
        (section.partyVotes[top1.partyId].paper || 0) / section.partyVotes[top1.partyId].total : 0;
      const party2PaperRatio = section.partyVotes[top2.partyId]?.total > 0 ?
        (section.partyVotes[top2.partyId].paper || 0) / section.partyVotes[top2.partyId].total : 0;
      const asymmetry = Math.abs(party1PaperRatio - party2PaperRatio);

      if (asymmetry > 0.4) {
        riskIndicators.push({
          code: 'R2.3',
          category: 'R2',
          severity: asymmetry > 0.6 ? 'high' : 'medium',
          message: `Асиметрия: ${top1.name} ${(party1PaperRatio * 100).toFixed(0)}% хартия, ${top2.name} ${(party2PaperRatio * 100).toFixed(0)}% хартия`
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
          message: `Скачване в невалидните гласове: ${(currentInvalidRate * 100).toFixed(1)}% (исторически: ${(baselineInvalidRate * 100).toFixed(1)}%)`
        });
      }
    }

    // R3.2: Party-correlated invalid spike
    if (baseline && section.comparisons?.['discardedVotes']) {
      const currentInvalid = section.discardedVotes;
      const previousInvalid = section.comparisons['discardedVotes'][0]?.value || 0;
      const invalidIncrease = currentInvalid - previousInvalid;

      if (invalidIncrease > 0) {
        const losingParties = [];
        Object.entries(section.partyVotes).forEach(([pid, votes]) => {
          const previousShare = baseline.partyVoteShares[pid] || 0;
          const currentShare = section.voted > 0 ? votes.total / section.voted : 0;
          const loss = previousShare - currentShare;

          if (loss > 0.05) {
            const partyName = section.topParties.find(tp => tp.partyId === pid)?.name || pid;
            losingParties.push({ pid, loss, name: partyName });
          }
        });

        if (losingParties.length > 0 && invalidIncrease > section.voted * 0.05) {
          losingParties.sort((a, b) => b.loss - a.loss);
          riskIndicators.push({
            code: 'R3.2',
            category: 'R3',
            severity: 'medium',
            message: `Увеличение на невалидните (+${invalidIncrease}) корелира с загуби за ${losingParties[0].name}`
          });
        }
      }
    }

    // R4.1: Vote swing
    if (historicalSections.length > 0 && section.topParties.length > 0) {
      const currentTopParty = section.topParties[0];
      const historicalShares = historicalSections
        .map(s => {
          const partyVotes = s.partyVotes[currentTopParty.partyId];
          return partyVotes && s.voted > 0 ? partyVotes.total / s.voted : null;
        })
        .filter(s => s !== null);

      if (historicalShares.length >= 2) {
        const avgHistoricalShare = historicalShares.reduce((sum, s) => sum + s, 0) / historicalShares.length;
        const variance = historicalShares.reduce((sum, s) => sum + Math.pow(s - avgHistoricalShare, 2), 0) / historicalShares.length;
        const currentShare = currentTopParty.percent;
        const swing = Math.abs(currentShare - avgHistoricalShare);

        // Only flag if historical variance is low (stable) AND swing is significant
        if (variance < 0.01 && swing > 0.15 && avgHistoricalShare > 0) {
          riskIndicators.push({
            code: 'R4.1',
            category: 'R4',
            severity: swing > 0.25 ? 'high' : 'medium',
            message: `Голям замах в исторически стабилна секция: ${currentTopParty.name} ${(swing * 100).toFixed(1)}% промяна (от ${(avgHistoricalShare * 100).toFixed(1)}% към ${(currentShare * 100).toFixed(1)}%)`
          });
        }
      }
    }

    // R4.2: Fragmentation shock
    if (historicalSections.length > 0) {
      const calculateHerfindahl = (s) => {
        let sum = 0;
        Object.values(s.partyVotes).forEach(votes => {
          const share = s.voted > 0 ? votes.total / s.voted : 0;
          sum += share * share;
        });
        return sum;
      };

      const currentHerfindahl = calculateHerfindahl(section);
      const historicalHerfindahls = historicalSections.map(calculateHerfindahl);
      const avgHistorical = historicalHerfindahls.reduce((sum, h) => sum + h, 0) / historicalHerfindahls.length;
      const change = Math.abs(currentHerfindahl - avgHistorical);

      if (change > 0.15) {
        const isFragmentation = currentHerfindahl < avgHistorical;
        riskIndicators.push({
          code: 'R4.2',
          category: 'R4',
          severity: change > 0.25 ? 'high' : 'medium',
          message: isFragmentation
            ? `Внезапна фрагментация: индекс ${currentHerfindahl.toFixed(2)} (исторически: ${avgHistorical.toFixed(2)})`
            : `Внезапна консолидация: индекс ${currentHerfindahl.toFixed(2)} (исторически: ${avgHistorical.toFixed(2)})`
        });
      }
    }

    // R4.3: Swing section (compare top party with ПП-ДБ)
    if (section.topParties.length >= 1) {
      const top1 = section.topParties[0];
      // Find ПП-ДБ in topParties first, then in all partyVotes if not found
      let ppdb = section.topParties.find(tp => tp.name.includes('ПП-ДБ') || tp.name.includes('ПРОДЪЛЖАВАМЕ'));

      // If not in topParties, search in all partyVotes
      if (!ppdb) {
        const ppdbPartyId = Object.keys(section.partyVotes).find(pid => {
          const partyName = parties[pid] || '';
          return partyName.includes('ПП-ДБ') || partyName.includes('ПРОДЪЛЖАВАМЕ');
        });

        if (ppdbPartyId && section.partyVotes[ppdbPartyId] && section.voted > 0) {
          const ppdbVotes = section.partyVotes[ppdbPartyId];
          const ppdbPercent = ppdbVotes.total / section.voted;
          ppdb = {
            partyId: ppdbPartyId,
            name: parties[ppdbPartyId] || 'ПП-ДБ',
            percent: ppdbPercent
          };
        }
      }

      if (ppdb && ppdb.partyId !== top1.partyId) {
        const margin = top1.percent - ppdb.percent;

        if (margin < 0.05 && margin > 0) {
          riskIndicators.push({
            code: 'R4.3',
            category: 'R4',
            severity: 'low',
            message: `Критична секция: ${top1.name} води с ${(margin * 100).toFixed(1)}% пред ${ppdb.name}`
          });
        }
      }
    }

    // Update section with risk indicators
    if (riskIndicators.length > 0) {
      section.riskIndicators = riskIndicators;
      // Don't duplicate risk messages in the risks array - riskIndicators already contain them
      // Only keep the original risks that aren't in riskIndicators
      const indicatorMessages = new Set(riskIndicators.map(r => r.message));
      const originalRisks = (section.risks || []).filter(r => !indicatorMessages.has(r));
      section.risks = [...originalRisks, ...riskIndicators.map(r => r.message)];
      section.riskScore = (section.riskScore || 0) + riskIndicators.length;
    }

    // Store baseline for reference
    if (baseline) {
      section.baseline = baseline;
    }
  });

  const finalResult = {
    sections: targetSections,
    parties: parties,
    regions: regions
  };

  const json = JSON.stringify(finalResult);

  const gzipped = zlib.gzipSync(json);
  fs.writeFileSync(path.join(outputDir, `${date}.json.gz`), gzipped);
}

// Cleanup .json files
fs.readdirSync(outputDir).forEach(file => {
  if (file.endsWith('.json')) {
    fs.unlinkSync(path.join(outputDir, file));
  }
});

console.log('Done!');
