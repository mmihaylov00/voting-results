import { ContestantElection, ContestantSummary, contestantIdentity, isSyntheticContestant } from './contestant-profile.util';
import { percent } from './election-comparison.util';
import { ElectionType } from './election-type';
import { getPartyDisplayName } from './party-colors';

export interface ContestantDirectoryEntry {
  id: string;
  name: string;
  displayName: string;
  date: string;
  partyId: string;
  electionName: string;
  participationCount: number;
  votes: number;
  share: number | null;
  names: string[];
  provisional?: ContestantElection['provisional'];
}

export function contestantDirectory(
  type: ElectionType,
  elections: readonly ContestantElection[],
  summaries: Readonly<Record<string, ContestantSummary>>,
  selectedDate?: string,
): ContestantDirectoryEntry[] {
  const entries = new Map<string, ContestantDirectoryEntry>();
  const dates = elections.filter(election => election.type === type)
    .sort((left, right) => right.date.localeCompare(left.date));
  for (const election of dates) {
    const summary = summaries[election.date];
    if (!summary) continue;
    const totals = new Map<string, number>();
    let voted = 0;
    for (const region of summary.regions) {
      voted += region.voted;
      for (const [id, votes] of Object.entries(region.partyVotes)) totals.set(id, (totals.get(id) ?? 0) + votes);
    }
    const ballots = [...new Set([...Object.keys(summary.parties), ...totals.keys()])]
      .map(partyId => {
        const recordedName = summary.parties[partyId]?.trim();
        const name = recordedName || `Бюлетина № ${partyId}`;
        return { partyId, name, identity: recordedName ? contestantIdentity(name, type) : null };
      })
      .filter(ballot => !isSyntheticContestant(ballot.name, ballot.partyId));
    const identityCounts = new Map<string, number>();
    for (const ballot of ballots) {
      if (ballot.identity) identityCounts.set(ballot.identity, (identityCounts.get(ballot.identity) ?? 0) + 1);
    }
    for (const ballot of ballots) {
      // Same-election aliases cannot identify either historical profile safely.
      const unambiguous = ballot.identity && identityCounts.get(ballot.identity) === 1;
      const id = JSON.stringify(unambiguous ? [type, ballot.identity] : [type, ballot.identity, election.date, ballot.partyId]);
      const existing = entries.get(id);
      if (existing) {
        existing.participationCount++;
        if (!existing.names.includes(ballot.name)) existing.names.push(ballot.name);
      }
      if (!existing || election.date === selectedDate) {
        const votes = totals.get(ballot.partyId) ?? 0;
        entries.set(id, {
          id, name: ballot.name, displayName: getPartyDisplayName(ballot.name), date: election.date,
          partyId: ballot.partyId, electionName: election.name, participationCount: existing?.participationCount ?? 1,
          votes, share: percent(votes, voted), names: existing?.names ?? [ballot.name],
          ...(election.provisional ? { provisional: election.provisional } : {}),
        });
      }
    }
  }
  return [...entries.values()].filter(entry => !selectedDate || entry.date === selectedDate).sort((left, right) => right.date.localeCompare(left.date)
    || right.votes - left.votes || left.displayName.localeCompare(right.displayName, 'bg'));
}
