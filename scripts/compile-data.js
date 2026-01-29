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

    if (sectionId) {
      sections[sectionId] = {
        sectionId,
        regionId,
        regionName,
        cityName,
        sectionName,
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
          total: votes.total,
          percent: section.voted > 0 ? votes.total / section.voted : 0,
          comparisons: []
        };
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }
  rawData[date] = { sections, parties };
}

console.log('Calculating comparisons and aggregating regions...');
const compiledData = {};

const dates = elections.map(e => e.date);

for (const date of dates) {
  console.log(`Finalizing ${date}...`);
  const targetSections = rawData[date].sections;
  const parties = rawData[date].parties;

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
