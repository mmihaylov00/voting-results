import { CandidateVotes, RegionCandidate, Section } from '../models/election.models';
import { candidateComparisonKey } from './candidate-comparisons.util';
import { ContestantDetailElection, ContestantElection, ContestantRisk, isSyntheticContestant } from './contestant-profile.util';
import { partyIdentity, percent } from './election-comparison.util';
import { REGION_LEVEL_RISK_CODES } from './risk-utils';

export interface PreferenceProfileList {
  regionId: string;
  regionName: string;
  partyId: string;
  partyName: string;
  candidateId: string;
  votes: number;
  paper: number;
  machine: number;
  partyVotes: number;
  share: number | null;
  rank: number;
  gapToLeader: number;
  risks: ContestantRisk[];
}

export interface PreferenceProfileElection extends ContestantDetailElection {
  lists: PreferenceProfileList[];
  sourceSections: Section[];
}

type ListCandidate = {
  partyId: string;
  partyName: string;
  candidateId: string;
  votes: number;
  paper: number;
  machine: number;
};

type DistrictCandidates = {
  name: string;
  matches: Map<string, ListCandidate>;
  candidates: Map<string, ListCandidate>;
};

const PREFERENCE_PARTY_ID = 'preference';

// shortcut: names cannot resolve homonyms across districts; use stable person IDs when available.
export function preferenceCandidateIdentity(candidateName: string, partyFamily: string): string {
  return candidateComparisonKey({ candidateName: candidateName.normalize('NFC').replace(/\s+/g, ' '),
    partyName: partyFamily });
}

async function yieldScan(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

function projectedRisks(section: Section, list: PreferenceProfileList): ContestantRisk[] | undefined {
  const candidateRisks = (section as Section & { candidateRiskIndicators?: ContestantRisk[] }).candidateRiskIndicators;
  if (!Array.isArray(section.riskIndicators) && !Array.isArray(candidateRisks) && section.riskScore !== 0) return undefined;
  const risks = new Map<string, ContestantRisk>();
  for (const risk of [...section.riskIndicators ?? [], ...candidateRisks ?? []]) {
    const details: Record<string, unknown> = risk.details && typeof risk.details === 'object' ? risk.details : {};
    if (REGION_LEVEL_RISK_CODES.has(risk.code)) {
      if (String(details['candidateId']) === list.candidateId && String(details['partyId']) === list.partyId
        && !list.risks.some(existing => existing.code === risk.code)) {
        list.risks.push({ ...risk, details: { ...details } });
      }
      continue;
    }
    if (details['sectionId'] != null && String(details['sectionId']) !== section.sectionId) continue;
    const specific = details['candidateId'] != null;
    if (specific) {
      if (String(details['candidateId']) !== list.candidateId || String(details['partyId']) !== list.partyId) continue;
    } else if (details['partyId'] != null) continue;
    const key = `${risk.code}:${specific ? 'candidate' : 'section'}`;
    if (risks.has(key)) continue;
    const projectedDetails = { ...details };
    if (specific) {
      delete projectedDetails['candidateId'];
      projectedDetails['partyId'] = PREFERENCE_PARTY_ID;
    }
    risks.set(key, { ...risk, ...(risk.details || specific ? { details: projectedDetails } : {}) });
  }
  return [...risks.values()];
}

function projectSection(section: Section, list: PreferenceProfileList, candidate: CandidateVotes | undefined, name: string): Section {
  const votes = candidate?.total ?? 0;
  const paper = candidate?.paper ?? 0;
  const machine = candidate?.machine ?? 0;
  const partyVotes = section.partyVotes[list.partyId]?.total ?? 0;
  const risks = projectedRisks(section, list);
  return {
    sectionId: section.sectionId, regionId: section.regionId, regionName: section.regionName,
    municipalityName: section.municipalityName, settlementEkatte: section.settlementEkatte,
    longitude: section.longitude, latitude: section.latitude, cityName: section.cityName,
    sectionName: section.sectionName, sectionType: section.sectionType,
    total: section.total, voted: partyVotes, discardedVotes: 0, noVotes: 0,
    activityBp: section.activityBp, totalPaper: paper, totalMachine: machine,
    partyVotes: { [PREFERENCE_PARTY_ID]: { total: votes, paper, machine } },
    topParties: [{ partyId: PREFERENCE_PARTY_ID, name, total: votes, percentBp: Math.round((percent(votes, partyVotes) ?? 0) * 100) }],
    ...(risks ? { riskIndicators: risks, riskScore: risks.length } : {}),
  };
}

export async function preferenceProfileElection(
  candidate: RegionCandidate,
  election: ContestantElection,
  sections: readonly Section[],
  parties: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<PreferenceProfileElection | null> {
  signal?.throwIfAborted();
  if (election.type !== 'governmental' || !candidate.candidateName.trim() || !candidate.partyName.trim()
    || isSyntheticContestant(candidate.partyName, candidate.partyId)) return null;
  const targetParty = partyIdentity(candidate.partyName);
  const target = preferenceCandidateIdentity(candidate.candidateName, targetParty);
  const partyEligibility = new Map<string, Map<string, boolean>>();
  const candidateIdentities = new Map<string, { key: string; matches: boolean }>();
  const districts = new Map<string, DistrictCandidates>();
  const matchesBySection = new Map<Section, CandidateVotes>();
  let inspected = 0;
  for (const section of sections) {
    const seen = new Set<string>();
    for (const votes of Object.values(section.candidateVotes ?? {})) {
      const partyName = Object.hasOwn(parties, votes.partyId) ? parties[votes.partyId] : votes.partyName;
      let partyNames = partyEligibility.get(votes.partyId);
      if (!partyNames) {
        partyNames = new Map();
        partyEligibility.set(votes.partyId, partyNames);
      }
      let eligible = partyNames.get(partyName);
      if (eligible === undefined) {
        eligible = !isSyntheticContestant(partyName, votes.partyId) && partyIdentity(partyName) === targetParty;
        partyNames.set(partyName, eligible);
      }
      if (!eligible) continue;
      let district = districts.get(section.regionId);
      if (!district) {
        district = { name: section.regionName || `Район ${section.regionId}`, matches: new Map(), candidates: new Map() };
        districts.set(section.regionId, district);
      }
      const rawKey = JSON.stringify([votes.partyId, partyName, votes.candidateId, votes.candidateName]);
      let cached = candidateIdentities.get(rawKey);
      if (!cached) {
        const candidateIdentity = preferenceCandidateIdentity(votes.candidateName, targetParty);
        cached = { key: JSON.stringify([votes.partyId, votes.candidateId, candidateIdentity]), matches: candidateIdentity === target };
        candidateIdentities.set(rawKey, cached);
      }
      const { key } = cached;
      if (seen.has(key)) continue;
      seen.add(key);
      let total = district.candidates.get(key);
      if (!total) {
        total = { partyId: votes.partyId, partyName, candidateId: votes.candidateId, votes: 0, paper: 0, machine: 0 };
        district.candidates.set(key, total);
      }
      total.votes += votes.total;
      total.paper += votes.paper;
      total.machine += votes.machine;
      if (cached.matches) {
        district.matches.set(key, total);
        matchesBySection.set(section, votes);
      }
    }
    if (++inspected % 200 === 0) await yieldScan(signal);
  }
  signal?.throwIfAborted();
  const lists: PreferenceProfileList[] = [];
  for (const [regionId, district] of districts) {
    if (district.matches.size !== 1) continue;
    const selected = [...district.matches.values()][0];
    const competitors = [...district.candidates.values()].filter(other => other.partyId === selected.partyId);
    lists.push({ regionId, regionName: district.name, ...selected, partyVotes: 0, share: null, risks: [],
      rank: 1 + competitors.filter(other => other.votes > selected.votes).length,
      gapToLeader: Math.max(0, ...competitors.map(other => other.votes)) - selected.votes });
  }
  if (!lists.length) return null;
  lists.sort((left, right) => left.regionId.localeCompare(right.regionId, 'bg', { numeric: true }));
  const listsByRegion = new Map(lists.map(list => [list.regionId, list]));
  const projected: Section[] = [];
  for (const section of sections) {
    const list = listsByRegion.get(section.regionId);
    if (list) {
      const row = projectSection(section, list, matchesBySection.get(section), candidate.candidateName);
      list.partyVotes += row.voted;
      projected.push(row);
    }
    if (++inspected % 200 === 0) await yieldScan(signal);
  }
  signal?.throwIfAborted();
  for (const list of lists) list.share = percent(list.votes, list.partyVotes);
  const votes = lists.reduce((sum, list) => sum + list.votes, 0);
  const voted = lists.reduce((sum, list) => sum + list.partyVotes, 0);
  return {
    participation: { ...election, partyId: PREFERENCE_PARTY_ID, fullName: candidate.candidateName,
      votes, voted, share: percent(votes, voted),
      rank: lists.length === 1 ? lists[0].rank : null,
      gapToLeader: lists.length === 1 ? lists[0].gapToLeader : null },
    sections: projected, lists, sourceSections: [...sections],
  };
}
