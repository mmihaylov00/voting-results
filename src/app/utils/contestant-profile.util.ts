import { Region, RegionCandidate, Section } from '../models/election.models';
import { isAbroadSection, splitAbroadLocation } from './abroad-section.util';
import { getPresidentialCandidateName } from './candidate-label';
import { matchPartyId, partyIdentity, percent } from './election-comparison.util';
import { ElectionType } from './election-type';

export interface ContestantElection {
  date: string;
  name: string;
  type: string;
  round?: number;
  provisional?: {
    sourceUrl: string;
    updatedAt: string;
    processedPercent: number;
    reportedSections: number;
    totalSections: number;
  };
}

export interface ContestantSummary {
  parties: Record<string, string>;
  regions: Region[];
}

export interface ContestantParticipation extends ContestantElection {
  partyId: string;
  fullName: string;
  votes: number;
  voted: number;
  share: number | null;
  rank: number | null;
  gapToLeader: number | null;
}

export interface ContestantDetailElection {
  participation: ContestantParticipation;
  sections: Section[];
}

export type ContestantRisk = NonNullable<Section['riskIndicators']>[number];

export interface ContestantSectionRow {
  section: Section;
  votes: number;
  paper: number;
  machine: number;
  share: number | null;
  risks: ContestantRisk[] | null;
}

export type ContestantGeographyLevel = 'region' | 'municipality' | 'settlement' | 'country';

export interface ContestantGeographyRow {
  id: string;
  name: string;
  regionId: string;
  votes: number;
  voted: number;
  paper: number;
  machine: number;
  share: number | null;
  sectionCount: number;
}

export interface ContestantPreferenceRow extends RegionCandidate {
  regionId: string;
  regionName: string;
  shareOfPartyVotes: number | null;
  shareOfPreferences: number | null;
}

function normalizedPerson(name: string): string {
  const titleCase = name.normalize('NFC').toLocaleLowerCase('bg')
    .replace(/(^|[\s\-’'])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase('bg'))
    .replace(/\s+И\s+/g, ' и ');
  return getPresidentialCandidateName(titleCase).toLocaleUpperCase('bg')
    .replace(/\s+/g, ' ').trim();
}

export function contestantIdentity(name: string, type: ElectionType): string {
  return type === 'governmental' ? partyIdentity(name) : normalizedPerson(name);
}

export function isSyntheticContestant(name: string, partyId = ''): boolean {
  return ['0', 'no_votes', 'others'].includes(partyId)
    || ['ДРУГИ', 'НЕ ПОДКРЕПЯМ НИКОГО', 'НЕ ПОДКРЕПЯ НИКОГО']
      .includes(name.trim().toLocaleUpperCase('bg').replace(/\s+/g, ' '));
}

export function matchContestantId(name: string, parties: Record<string, string>, type: ElectionType): string | null {
  if (!name.trim() || isSyntheticContestant(name)) return null;
  const contestants = Object.fromEntries(Object.entries(parties).filter(([id, fullName]) => !isSyntheticContestant(fullName, id)));
  if (type === 'governmental') return matchPartyId(name, contestants);
  const identity = contestantIdentity(name, type);
  if (!identity) return null;
  const matches = Object.entries(contestants).filter(([, ticket]) => contestantIdentity(ticket, type) === identity);
  return matches.length === 1 ? matches[0][0] : null;
}

export function contestantParticipations(
  name: string,
  type: ElectionType,
  elections: readonly ContestantElection[],
  summaries: Readonly<Record<string, ContestantSummary>>,
  anchor?: { date: string; partyId: string },
): ContestantParticipation[] {
  const participations: ContestantParticipation[] = [];
  let profileName = name;
  let dateSpecific = false;
  if (anchor?.partyId) {
    const summary = summaries[anchor.date];
    if (!summary || !elections.some(election => election.date === anchor.date && election.type === type)
      || isSyntheticContestant(name, anchor.partyId)) return [];
    const recordedName = Object.hasOwn(summary.parties, anchor.partyId) ? summary.parties[anchor.partyId].trim() : undefined;
    if (recordedName) {
      const requestedName = name.trim() || recordedName;
      const matched = matchContestantId(requestedName, summary.parties, type);
      if (matched !== anchor.partyId) {
        if (matched !== null || requestedName !== recordedName) return [];
        dateSpecific = true;
      }
      profileName = recordedName;
    } else {
      const fallback = `Бюлетина № ${anchor.partyId}`;
      if (name !== fallback || !summary.regions.some(region => Object.hasOwn(region.partyVotes, anchor.partyId))) return [];
      profileName = fallback;
      dateSpecific = true;
    }
  }
  if (!profileName.trim() || isSyntheticContestant(profileName)) return [];
  for (const election of elections) {
    if (election.type !== type || dateSpecific && election.date !== anchor?.date) continue;
    const summary = summaries[election.date];
    if (!summary) continue;
    const partyId = dateSpecific ? anchor!.partyId : matchContestantId(profileName, summary.parties, type);
    if (partyId === null) continue;
    const totals = new Map<string, number>();
    let voted = 0;
    for (const region of summary.regions) {
      voted += region.voted;
      for (const [id, votes] of Object.entries(region.partyVotes)) {
        if (!isSyntheticContestant(summary.parties[id] ?? '', id)) totals.set(id, (totals.get(id) ?? 0) + votes);
      }
    }
    const votes = totals.get(partyId) ?? 0;
    const results = [...totals.values()];
    participations.push({
      ...election,
      partyId,
      fullName: summary.parties[partyId]?.trim() || profileName,
      votes,
      voted,
      share: percent(votes, voted),
      rank: 1 + results.filter(total => total > votes).length,
      gapToLeader: Math.max(0, ...results) - votes,
    });
  }
  return participations.sort((left, right) => right.date.localeCompare(left.date));
}

function risksForContestant(section: Section, partyId: string): ContestantRisk[] | null {
  if (!Array.isArray(section.riskIndicators)) return section.riskScore === 0 ? [] : null;
  return section.riskIndicators.filter(risk => {
    const details: Record<string, unknown> | undefined = risk.details;
    if (details?.['candidateId'] !== undefined && details['candidateId'] !== null) return false;
    if (details?.['sectionId'] !== undefined && String(details['sectionId']) !== section.sectionId) return false;
    return details?.['partyId'] === undefined || details['partyId'] === null || String(details['partyId']) === partyId;
  });
}

export function contestantSectionRows(sections: readonly Section[], partyId: string): ContestantSectionRow[] {
  return sections.map(section => {
    const votes = section.partyVotes[partyId];
    return {
      section,
      votes: votes?.total ?? 0,
      paper: votes?.paper ?? 0,
      machine: votes?.machine ?? 0,
      share: percent(votes?.total ?? 0, section.voted),
      risks: risksForContestant(section, partyId),
    };
  });
}

export function contestantGeographyIdentity(section: Section, level: ContestantGeographyLevel): { id: string; name: string } | null {
  if (level === 'region') return { id: section.regionId, name: section.regionName || `Район ${section.regionId}` };
  const abroad = isAbroadSection(section);
  if (level === 'country') {
    if (!abroad) return null;
    const country = section.municipalityName || splitAbroadLocation(section.cityName).countryName;
    return { id: country, name: country || 'Неуточнена държава' };
  }
  if (level === 'municipality') {
    if (abroad) return null;
    const name = section.municipalityName || 'Неуточнена община';
    return { id: `${section.regionId}:${name}`, name };
  }
  const name = section.cityName || 'Неуточнено населено място';
  const country = abroad ? section.municipalityName || splitAbroadLocation(section.cityName).countryName : '';
  return { id: `${section.regionId}:${section.settlementEkatte || `${country}:${name}`}`, name: country ? `${name}, ${country}` : name };
}

export function contestantGeography(
  sections: readonly Section[],
  partyId: string,
  level: ContestantGeographyLevel,
): ContestantGeographyRow[] {
  const rows = new Map<string, ContestantGeographyRow>();
  for (const section of sections) {
    const place = contestantGeographyIdentity(section, level);
    if (!place) continue;
    let row = rows.get(place.id);
    if (!row) {
      row = { ...place, regionId: section.regionId, votes: 0, voted: 0, paper: 0, machine: 0, share: null, sectionCount: 0 };
      rows.set(place.id, row);
    }
    const votes = section.partyVotes[partyId];
    row.votes += votes?.total ?? 0;
    row.paper += votes?.paper ?? 0;
    row.machine += votes?.machine ?? 0;
    row.voted += section.voted;
    row.sectionCount++;
  }
  for (const row of rows.values()) row.share = percent(row.votes, row.voted);
  return [...rows.values()].sort((left, right) => right.votes - left.votes || left.name.localeCompare(right.name, 'bg'));
}

export function contestantPreferences(
  sections: readonly Section[],
  partyId?: string,
  partyName?: string,
): ContestantPreferenceRow[] {
  const rows = new Map<string, ContestantPreferenceRow>();
  const districts = new Map<string, { voted: number; partyVotes: Record<string, number>; preferences: Record<string, number> }>();
  for (const section of sections) {
    let district = districts.get(section.regionId);
    if (!district) {
      district = { voted: 0, partyVotes: {}, preferences: {} };
      districts.set(section.regionId, district);
    }
    district.voted += section.voted;
    if (partyId) {
      district.partyVotes[partyId] = (district.partyVotes[partyId] ?? 0) + (section.partyVotes[partyId]?.total ?? 0);
    } else {
      for (const [id, votes] of Object.entries(section.partyVotes)) {
        district.partyVotes[id] = (district.partyVotes[id] ?? 0) + votes.total;
      }
    }
    for (const candidate of Object.values(section.candidateVotes ?? {})) {
      if (partyId && candidate.partyId !== partyId) continue;
      district.preferences[candidate.partyId] = (district.preferences[candidate.partyId] ?? 0) + candidate.total;
      const key = JSON.stringify([section.regionId, candidate.partyId, candidate.candidateId,
        candidate.candidateName.normalize('NFC').trim().toLocaleUpperCase('bg')]);
      let row = rows.get(key);
      if (!row) {
        row = {
          candidateId: candidate.candidateId, candidateName: candidate.candidateName,
          partyId: candidate.partyId, partyName: partyName ?? candidate.partyName,
          regionId: section.regionId, regionName: section.regionName || `Район ${section.regionId}`,
          paper: 0, machine: 0, total: 0, totalInRegion: 0, partyPercentInRegion: 0,
          preferencePercentOfPartyVotes: 0, shareOfPartyVotes: null, shareOfPreferences: null,
        };
        rows.set(key, row);
      }
      row.total += candidate.total;
      row.paper += candidate.paper;
      row.machine += candidate.machine;
    }
  }
  for (const row of rows.values()) {
    const district = districts.get(row.regionId)!;
    row.totalInRegion = row.total;
    row.partyPercentInRegion = percent(district.partyVotes[row.partyId] ?? 0, district.voted) ?? 0;
    row.shareOfPartyVotes = percent(row.total, district.partyVotes[row.partyId] ?? 0);
    row.shareOfPreferences = percent(row.total, district.preferences[row.partyId] ?? 0);
    row.preferencePercentOfPartyVotes = row.shareOfPreferences ?? 0;
  }
  return [...rows.values()].sort((left, right) => right.total - left.total || left.candidateName.localeCompare(right.candidateName, 'bg'));
}
