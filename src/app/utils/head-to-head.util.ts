import { CandidateVotes, Section } from '../models/election.models';
import { percent } from './election-comparison.util';

export type ComparisonMode = 'parties' | 'candidates';

export interface ComparisonProfile {
  id: string;
  name: string;
  partyId: string;
  partyName: string;
  regionId?: string;
  candidateId?: string;
  votes: number;
  paper: number;
  machine: number;
  share: number | null;
  preferenceShare: number | null;
  machineShare: number | null;
}

export interface ComparisonPlace {
  id: string;
  label: string;
  regionId: string;
  sectionId?: string;
  votes: number;
  share: number | null;
}

function candidateIdentity(regionId: string, candidate: CandidateVotes): string {
  return JSON.stringify([regionId, candidate.partyId, candidate.candidateId, candidate.candidateName]);
}

export function comparisonProfiles(
  sections: Section[],
  parties: Record<string, string>,
  mode: ComparisonMode,
): ComparisonProfile[] {
  const profiles = new Map<string, ComparisonProfile>();
  const regionPartyVotes = new Map<string, number>();
  const regionPreferences = new Map<string, number>();
  const partyPreferences = new Map<string, number>();
  let voted = 0;

  for (const section of sections) {
    voted += section.voted;
    for (const [partyId, votes] of Object.entries(section.partyVotes)) {
      if (partyId === '0' || partyId === 'no_votes') continue;
      const regionalKey = JSON.stringify([section.regionId, partyId]);
      regionPartyVotes.set(regionalKey, (regionPartyVotes.get(regionalKey) ?? 0) + votes.total);
      if (mode === 'candidates') continue;
      let profile = profiles.get(partyId);
      if (!profile) {
        const name = parties[partyId] || section.topParties.find(party => party.partyId === partyId)?.name || `Бюлетина ${partyId}`;
        profile = { id: partyId, name, partyId, partyName: name, votes: 0, paper: 0, machine: 0, share: null, preferenceShare: null, machineShare: null };
        profiles.set(partyId, profile);
      }
      profile.votes += votes.total;
      profile.paper += votes.paper;
      profile.machine += votes.machine;
    }
    for (const candidate of Object.values(section.candidateVotes ?? {})) {
      const regionalKey = JSON.stringify([section.regionId, candidate.partyId]);
      regionPreferences.set(regionalKey, (regionPreferences.get(regionalKey) ?? 0) + candidate.total);
      partyPreferences.set(candidate.partyId, (partyPreferences.get(candidate.partyId) ?? 0) + candidate.total);
      if (mode === 'parties') continue;
      const id = candidateIdentity(section.regionId, candidate);
      let profile = profiles.get(id);
      if (!profile) {
        profile = {
          id, name: candidate.candidateName || `Кандидат ${candidate.candidateId}`,
          partyId: candidate.partyId, partyName: parties[candidate.partyId] || candidate.partyName,
          candidateId: candidate.candidateId, regionId: section.regionId,
          votes: 0, paper: 0, machine: 0, share: null, preferenceShare: null, machineShare: null,
        };
        profiles.set(id, profile);
      }
      profile.votes += candidate.total;
      profile.paper += candidate.paper;
      profile.machine += candidate.machine;
    }
  }

  for (const profile of profiles.values()) {
    const regionalKey = JSON.stringify([profile.regionId, profile.partyId]);
    const preferences = partyPreferences.get(profile.partyId);
    profile.share = percent(profile.votes, mode === 'parties' ? voted : regionPartyVotes.get(regionalKey) ?? 0);
    profile.preferenceShare = mode === 'parties'
      ? preferences === undefined ? null : percent(preferences, profile.votes)
      : percent(profile.votes, regionPreferences.get(regionalKey) ?? 0);
    profile.machineShare = percent(profile.machine, profile.paper + profile.machine);
  }
  return [...profiles.values()].sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id, 'bg'));
}

export function comparisonStrongholds(
  sections: Section[],
  profile: ComparisonProfile,
  level: 'section' | 'settlement',
): ComparisonPlace[] {
  const places = new Map<string, ComparisonPlace & { denominator: number }>();
  for (const section of sections) {
    if (profile.regionId !== undefined && section.regionId !== profile.regionId) continue;
    const votes = profile.candidateId === undefined
      ? section.partyVotes[profile.partyId]?.total ?? 0
      : Object.values(section.candidateVotes ?? {}).find(candidate => candidateIdentity(section.regionId, candidate) === profile.id)?.total ?? 0;
    const id = level === 'section'
      ? JSON.stringify([section.regionId, section.sectionId])
      : JSON.stringify([section.regionId, section.settlementEkatte || section.cityName]);
    let place = places.get(id);
    if (!place) {
      place = {
        id, regionId: section.regionId,
        label: section.cityName || 'Неизвестно населено място',
        sectionId: level === 'section' ? section.sectionId : undefined,
        votes: 0, denominator: 0, share: null,
      };
      places.set(id, place);
    }
    place.votes += votes;
    place.denominator += profile.candidateId === undefined ? section.voted : section.partyVotes[profile.partyId]?.total ?? 0;
  }
  return [...places.values()].filter(place => place.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id, 'bg')).slice(0, 3)
    .map(({ denominator, ...place }) => ({ ...place, share: percent(place.votes, denominator) }));
}
