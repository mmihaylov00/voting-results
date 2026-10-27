import { Region, RegionCandidate } from '../models/election.models';
import { ContestantDirectoryEntry } from './contestant-directory.util';
import { ContestantElection, ContestantPreferenceRow, isSyntheticContestant } from './contestant-profile.util';
import { partyIdentity, percent } from './election-comparison.util';
import { preferenceCandidateIdentity } from './preference-profile.util';

export interface PreferenceDirectoryData {
  rows: ContestantPreferenceRow[];
  regions: Region[];
}

export interface PreferenceDirectoryEntry extends ContestantDirectoryEntry {
  partyName: string;
  lists: ContestantPreferenceRow[];
  candidate: RegionCandidate;
}

export function preferenceDirectory(
  elections: readonly ContestantElection[],
  data: Readonly<Record<string, PreferenceDirectoryData>>,
  selectedDate?: string,
): PreferenceDirectoryEntry[] {
  const entries = new Map<string, PreferenceDirectoryEntry>();
  for (const election of [...elections].filter(election => election.type === 'governmental').sort((a, b) => b.date.localeCompare(a.date))) {
    const result = data[election.date];
    if (!result) continue;
    const regions = new Map(result.regions.map(region => [region.id, region]));
    const groups = new Map<string, ContestantPreferenceRow[]>();
    const preferenceTotals = new Map<string, number>();
    for (const row of result.rows) {
      if (!row.candidateName.trim() || isSyntheticContestant(row.partyName, row.partyId)) continue;
      const id = preferenceCandidateIdentity(row.candidateName, partyIdentity(row.partyName));
      const group = groups.get(id) ?? [];
      group.push(row); groups.set(id, group);
      const key = JSON.stringify([row.regionId, row.partyId]);
      preferenceTotals.set(key, (preferenceTotals.get(key) ?? 0) + row.total);
    }
    for (const [identity, rows] of groups) {
      const ambiguous = new Set(rows.map(row => row.regionId)).size !== rows.length;
      const lists = ambiguous ? rows.map(row => [row]) : [rows];
      for (const list of lists) {
        list.sort((a, b) => a.regionId.localeCompare(b.regionId, 'bg', { numeric: true }));
        const first = list[0];
        const id = ambiguous ? JSON.stringify([identity, election.date, first.regionId, first.partyId, first.candidateId]) : identity;
        const existing = entries.get(id);
        if (existing) {
          existing.participationCount++;
          if (!existing.names.includes(first.candidateName)) existing.names.push(first.candidateName);
        }
        if (existing && election.date !== selectedDate) continue;
        let total = 0, paper = 0, machine = 0, partyVotes = 0, preferences = 0, voted = 0;
        for (const row of list) {
          total += row.total; paper += row.paper; machine += row.machine;
          const region = regions.get(row.regionId);
          partyVotes += region?.partyVotes[row.partyId] ?? 0;
          voted += region?.voted ?? 0;
          preferences += preferenceTotals.get(JSON.stringify([row.regionId, row.partyId])) ?? 0;
        }
        const candidate: RegionCandidate = { ...first, total, paper, machine, totalInRegion: total,
          partyPercentInRegion: percent(partyVotes, voted) ?? 0, preferencePercentOfPartyVotes: percent(total, preferences) ?? 0 };
        entries.set(id, {
          id, name: first.candidateName, displayName: first.candidateName, partyName: first.partyName,
          date: election.date, electionName: election.name, partyId: first.partyId,
          participationCount: existing?.participationCount ?? 1, names: existing?.names ?? [first.candidateName],
          votes: total, share: percent(total, partyVotes), candidate, lists: list,
        });
      }
    }
  }
  return [...entries.values()].filter(entry => !selectedDate || entry.date === selectedDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.votes - a.votes || a.name.localeCompare(b.name, 'bg'));
}
