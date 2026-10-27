const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const requiredHeaders = {
  sections: ['sectionId', 'regionId', 'regionName', 'municipalityId', 'cityName', 'sectionName'],
  protocols: ['sectionId', 'totalA', 'totalB', 'voted', 'discardedVotes', 'noVotesPaper', 'noVotesMachine', 'protocolPaperVotes', 'protocolMachineVotes'],
  votes: ['sectionId', 'partyId', 'total', 'paper', 'machine'],
  cik_parties: ['partyId', 'partyName'],
  local_candidates: ['regionId', 'partyId', 'candidateId', 'candidateName'],
  preferences: ['sectionId', 'partyId', 'preference', 'paper', 'machine'],
};

function validDate(value, separator) {
  const format = separator === '.' ? /^\d{4}\.\d{2}\.\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof value !== 'string' || !format.test(value)) return false;
  const iso = value.split(separator).join('-');
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === iso;
}

function sourceFolder(root, folder) {
  if (typeof folder !== 'string' || !folder || path.isAbsolute(folder) || folder.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe source folder: ${folder}`);
  }
  const resolved = fs.realpathSync(path.join(root, folder));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Source folder escapes BG directory: ${folder}`);
  return resolved;
}

function importShtaboData(sourceDir, projectDir = path.join(__dirname, '..')) {
  if (!sourceDir) throw new Error('Usage: npm run import:shtabo -- /path/to/election-data/BG');
  const root = fs.realpathSync(sourceDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.country !== 'BG' || !Array.isArray(manifest.elections)) throw new Error('Expected a BG election manifest');
  const catalogPath = path.join(projectDir, 'src/assets/elections.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).map(e => ({...e, type: e.type || 'governmental'}));
  const byDate = new Map();
  for (const entry of catalog) {
    if (!validDate(entry.date, '.') || byDate.has(entry.date)) throw new Error(`Invalid or duplicate catalog date: ${entry.date}`);
    byDate.set(entry.date, entry);
  }

  const dates = new Set();
  const folders = new Set();
  const plans = [];
  for (const election of manifest.elections) {
    if (!['PARLIAMENTARY', 'PRESIDENTIAL'].includes(election.type)) continue;
    if (typeof election.title !== 'string' || !election.title.trim()) throw new Error(`Missing election title: ${election.date}`);
    const type = election.type === 'PRESIDENTIAL' ? 'presidential' : 'governmental';
    const rounds = type === 'presidential' ? election.rounds : [election];
    if (!Array.isArray(rounds) || !rounds.length) throw new Error(`Missing rounds: ${election.date}`);
    for (const round of rounds) {
      if (!validDate(round.date, '-')) throw new Error(`Invalid election date: ${round.date}`);
      const date = round.date.replaceAll('-', '.');
      const folder = sourceFolder(root, round.folder);
      if (dates.has(date) || folders.has(folder)) throw new Error(`Duplicate source date or folder: ${date}`);
      dates.add(date);
      folders.add(folder);
      if (type === 'presidential' && ![1, 2].includes(round.roundNumber)) throw new Error(`Invalid presidential round: ${date}`);
      if (byDate.has(date)) {
        if (byDate.get(date).type !== type) throw new Error(`Election type conflict: ${date}`);
        continue;
      }
      const destination = path.join(projectDir, 'public/data', date);
      if (fs.existsSync(destination)) throw new Error(`Unregistered dataset already exists: ${destination}`);
      const files = [];
      for (const [name, required] of Object.entries(requiredHeaders)) {
        const file = path.join(folder, `${name}.txt.gz`);
        if (!fs.existsSync(file) && ['local_candidates', 'preferences'].includes(name)) continue;
        if (!fs.realpathSync(file).startsWith(`${root}${path.sep}`)) throw new Error(`Source file escapes BG directory: ${file}`);
        const bytes = fs.readFileSync(file);
        const text = zlib.gunzipSync(bytes).toString('utf8');
        const newline = text.indexOf('\n');
        const headers = text.slice(0, newline).split(';').map(h => h.trim());
        if (newline < 0 || required.some(header => !headers.includes(header))) throw new Error(`Invalid canonical headers: ${file}`);
        files.push([`${name}.txt.gz`, bytes]);
      }
      const source = path.join(folder, 'SOURCE.md');
      if (fs.existsSync(source)) {
        if (!fs.realpathSync(source).startsWith(`${root}${path.sep}`)) throw new Error(`Source file escapes BG directory: ${source}`);
        files.push(['SOURCE.md', fs.readFileSync(source)]);
      }
      const entry = {date, name: election.title, type};
      if (type === 'presidential') Object.assign(entry, {name: `${election.title} - ${round.title}`, round: round.roundNumber});
      plans.push({destination, files, entry});
    }
  }

  const created = [];
  const temporaryCatalog = `${catalogPath}.import-${process.pid}`;
  try {
    for (const {destination, files, entry} of plans) {
      fs.mkdirSync(destination);
      created.push(destination);
      for (const [name, bytes] of files) fs.writeFileSync(path.join(destination, name), bytes, {flag: 'wx'});
      catalog.push(entry);
    }
    catalog.sort((a, b) => b.date.localeCompare(a.date));
    fs.writeFileSync(temporaryCatalog, `${JSON.stringify(catalog, null, 2)}\n`, {flag: 'wx'});
    fs.renameSync(temporaryCatalog, catalogPath);
  } catch (error) {
    for (const directory of created) fs.rmSync(directory, {recursive: true, force: true});
    fs.rmSync(temporaryCatalog, {force: true});
    throw error;
  }
  return plans.map(plan => plan.entry.date);
}

if (require.main === module) {
  try {
    const imported = importShtaboData(process.argv[2]);
    console.log(`Imported ${imported.length} elections: ${imported.join(', ')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {importShtaboData};
