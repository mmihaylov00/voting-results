import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFileSync } from 'child_process';
import { electionNameFromDate } from '../common/date/election-name.util';

export type ElectionImportClient = {
  election: {
    findUnique: (args: { where: { date: string } }) => Promise<any>;
    create: (args: { data: { date: string; name: string } }) => Promise<{ id: string }>;
  };
  electionParty: {
    createMany: (args: { data: Array<{ electionId: string; partyId: string; name: string }> }) => Promise<any>;
  };
  electionRegion: {
    createMany: (args: { data: Array<{ electionId: string; regionId: string; name: string; data?: any }> }) => Promise<any>;
  };
  electionSection: {
    createMany: (args: { data: Array<Record<string, any>> }) => Promise<any>;
  };
};

type PayloadPaths = {
  summary?: string;
  full?: string;
};

const ELECTION_DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

export function findRawElectionDates(rawRoot: string): string[] {
  if (!fs.existsSync(rawRoot)) return [];
  return fs
    .readdirSync(rawRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ELECTION_DATE_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
}

function buildCompilerScriptPath(): string {
  const backendRoot = path.resolve(__dirname, '../..');
  return path.resolve(backendRoot, 'scripts/compile-data.js');
}

function collectGeneratedPayloadPaths(generatedRoot: string): Map<string, PayloadPaths> {
  const result = new Map<string, PayloadPaths>();
  if (!fs.existsSync(generatedRoot)) return result;

  const files = fs.readdirSync(generatedRoot);
  for (const file of files) {
    if (!file.endsWith('.json.gz')) continue;
    const match = file.match(/^(\d{4}\.\d{2}\.\d{2})\.(summary|full)\..*\.json\.gz$/);
    if (!match) continue;
    const [, date, kind] = match as [string, string, 'summary' | 'full'];
    const entry = result.get(date) || {};
    entry[kind] = path.join(generatedRoot, file);
    result.set(date, entry);
  }

  return result;
}

function loadGzipJson(filePath: string): any {
  const buf = fs.readFileSync(filePath);
  const json = zlib.gunzipSync(buf).toString('utf8');
  return JSON.parse(json);
}

function sectionTypeFromCode(code: number): string {
  if (code === 0) return 'City';
  if (code === 1) return 'Village';
  if (code === 2) return 'Mobile';
  return 'Other';
}

function decodeTopParties(sections: any, index: number) {
  const start = sections.topPartyOffset?.[index] ?? 0;
  const end = sections.topPartyOffset?.[index + 1] ?? start;
  const rows: Array<{ partyId: string; name: string; total: number; percentBp: number }> = [];
  for (let i = start; i < end; i++) {
    rows.push({
      partyId: sections.topPartyPartyId?.[i] || '',
      name: sections.topPartyName?.[i] || '',
      total: sections.topPartyTotal?.[i] || 0,
      percentBp: sections.topPartyPercentBp?.[i] || 0,
    });
  }
  return rows;
}

function decodePartyVotes(sections: any, index: number) {
  const start = sections.partyVotesOffset?.[index] ?? 0;
  const end = sections.partyVotesOffset?.[index + 1] ?? start;
  const rows: Array<{ partyId: string; total: number; paper: number; machine: number }> = [];
  for (let i = start; i < end; i++) {
    rows.push({
      partyId: sections.partyVotesPartyId?.[i] || '',
      total: sections.partyVotesTotal?.[i] || 0,
      paper: sections.partyVotesPaper?.[i] || 0,
      machine: sections.partyVotesMachine?.[i] || 0,
    });
  }
  return rows;
}

function decodeCandidateVotes(sections: any, index: number) {
  const start = sections.candidateVotesOffset?.[index] ?? 0;
  const end = sections.candidateVotesOffset?.[index + 1] ?? start;
  const rows: Array<{ candidateId: string; candidateName: string; partyId: string; total: number; paper: number; machine: number }> = [];
  for (let i = start; i < end; i++) {
    rows.push({
      candidateId: sections.candidateVotesCandidateId?.[i] || '',
      candidateName: sections.candidateVotesCandidateName?.[i] || '',
      partyId: sections.candidateVotesPartyId?.[i] || '',
      total: sections.candidateVotesTotal?.[i] || 0,
      paper: sections.candidateVotesPaper?.[i] || 0,
      machine: sections.candidateVotesMachine?.[i] || 0,
    });
  }
  return rows;
}

function decodeRiskIndicators(sections: any, index: number) {
  const start = sections.riskOffset?.[index] ?? 0;
  const end = sections.riskOffset?.[index + 1] ?? start;
  const rows: Array<{ code: string; category: string; severity: string; details: string }> = [];
  for (let i = start; i < end; i++) {
    rows.push({
      code: sections.riskCode?.[i] || '',
      category: sections.riskCategory?.[i] || '',
      severity: sections.riskSeverity?.[i] || '',
      details: sections.riskDetails?.[i] || '',
    });
  }
  return rows;
}

function decodeCandidateRiskIndicators(sections: any, index: number) {
  const start = sections.candidateRiskOffset?.[index] ?? 0;
  const end = sections.candidateRiskOffset?.[index + 1] ?? start;
  const rows: Array<{ code: string; category: string; severity: string; details: string }> = [];
  for (let i = start; i < end; i++) {
    rows.push({
      code: sections.candidateRiskCode?.[i] || '',
      category: sections.candidateRiskCategory?.[i] || '',
      severity: sections.candidateRiskSeverity?.[i] || '',
      details: sections.candidateRiskDetails?.[i] || '',
    });
  }
  return rows;
}

export async function importRawElections(
  client: ElectionImportClient,
  rawRoot: string,
  log: (line: string) => void = console.log,
): Promise<void> {
  if (!fs.existsSync(rawRoot)) {
    throw new Error(`Raw directory not found: ${rawRoot}`);
  }

  const dates = findRawElectionDates(rawRoot);
  if (dates.length === 0) {
    log(`No raw election directories found in ${rawRoot}`);
    return;
  }

  const compilerScript = buildCompilerScriptPath();
  if (!fs.existsSync(compilerScript)) {
    throw new Error(`Raw compiler script not found: ${compilerScript}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'votes-raw-import-'));

  try {
    for (const date of dates) {
      fs.cpSync(path.join(rawRoot, date), path.join(tempRoot, date), { recursive: true });
    }

    execFileSync(process.execPath, [compilerScript], {
      stdio: 'inherit',
      env: {
        ...process.env,
        BASE_DATA_DIR: tempRoot,
      },
    });

    const payloadsByDate = collectGeneratedPayloadPaths(path.join(tempRoot, 'compiled'));

    for (const date of dates) {
      const existing = await client.election.findUnique({ where: { date } });
      if (existing) {
        log(`Skipping ${date} (already imported)`);
        continue;
      }

      const payloads = payloadsByDate.get(date);
      if (!payloads?.summary || !payloads?.full) {
        log(`Skipping ${date} (missing generated summary/full payloads)`);
        continue;
      }

      const summary = loadGzipJson(payloads.summary);
      const full = loadGzipJson(payloads.full);
      const sections = full?.sections;

      if (!sections || typeof sections.count !== 'number') {
        log(`Skipping ${date} (invalid sections payload)`);
        continue;
      }

      const election = await client.election.create({
        data: {
          date,
          name: electionNameFromDate(date),
        },
      });

      const electionId = election.id;
      const parties = Object.entries(full?.parties || {}).map(([partyId, name]) => ({
        electionId,
        partyId,
        name: String(name || partyId),
      }));
      if (parties.length > 0) {
        await client.electionParty.createMany({ data: parties });
      }

      const regions = Array.isArray(summary?.regions)
        ? summary.regions.map((region: any) => ({
            electionId,
            regionId: String(region.id || ''),
            name: String(region.name || ''),
            data: region,
          }))
        : [];
      if (regions.length > 0) {
        await client.electionRegion.createMany({ data: regions });
      }

      const cityDict = sections?.dicts?.cityName || [];
      const sectionDict = sections?.dicts?.sectionName || [];
      const rows: Array<Record<string, any>> = [];

      for (let i = 0; i < sections.count; i++) {
        const sectionId = String(sections.sectionId?.[i] || '');
        const regionId = String(sections.regionId?.[i] || '');
        const regionName = String(regions.find((r) => r.regionId === regionId)?.name || '');
        rows.push({
          electionId,
          sectionId,
          regionId,
          regionName,
          municipalityId: null,
          cityName: String(cityDict[sections.cityNameId?.[i] ?? 0] || ''),
          sectionName: String(sectionDict[sections.sectionNameId?.[i] ?? 0] || ''),
          sectionType: sectionTypeFromCode(sections.sectionType?.[i] ?? 3),
          total: sections.total?.[i] ?? 0,
          voted: sections.voted?.[i] ?? 0,
          discardedVotes: sections.discardedVotes?.[i] ?? 0,
          noVotes: sections.noVotes?.[i] ?? 0,
          noVotesPaper: sections.noVotesPaper?.[i] ?? 0,
          noVotesMachine: sections.noVotesMachine?.[i] ?? 0,
          totalPaper: sections.totalPaper?.[i] ?? 0,
          totalMachine: sections.totalMachine?.[i] ?? 0,
          activityBp: sections.activityBp?.[i] ?? 0,
          riskScore: sections.riskScore?.[i] ?? 0,
          hasProtocolError: (sections.hasProtocolError?.[i] ?? 0) === 1,
          protocolErrorDiff: sections.protocolErrorDiff?.[i] ?? 0,
          protocolPaperVotes: sections.protocolPaperVotes?.[i] ?? 0,
          protocolMachineVotes: sections.protocolMachineVotes?.[i] ?? 0,
          votesToFirst: sections.votesToFirst?.[i] ?? 0,
          topParties: decodeTopParties(sections, i),
          partyVotes: decodePartyVotes(sections, i),
          candidateVotes: decodeCandidateVotes(sections, i),
          riskIndicators: decodeRiskIndicators(sections, i),
          candidateRiskIndicators: decodeCandidateRiskIndicators(sections, i),
          meta: null,
        });
      }

      if (rows.length > 0) {
        await client.electionSection.createMany({ data: rows });
      }

      log(`Imported ${date}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
