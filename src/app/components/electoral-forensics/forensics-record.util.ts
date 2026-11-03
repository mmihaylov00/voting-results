import { ForensicsElection, ForensicsReport, ForensicsSection, HistoryParty } from './forensics.models';

function percent(votes: number, denominator: number | null | undefined): number | null {
  return typeof denominator === 'number' && denominator > 0 ? 100 * votes / denominator : null;
}

/** Restore shared registration labels only for the selected record, preserving election identities. */
export function hydrateSectionRecord(row: ForensicsSection, registrations: ForensicsReport['registrations']): ForensicsSection {
  const elections: Record<string, ForensicsElection | null> = {};
  for (const [date, election] of Object.entries(row.elections ?? {})) {
    if (!election) { elections[date] = null; continue; }
    const catalog = registrations?.[date];
    const region = String(Number(election['regionId'] ?? row.regionId));
    const names = { ...catalog?.parties };
    for (const [key, name] of Object.entries(catalog?.regionalParties ?? {})) {
      const [regionId, ballot] = key.split(':');
      if (String(Number(regionId)) === region) names[ballot] = name;
    }
    const votes = election.votesByParty ?? {};
    const ballotIds = [...new Set([...Object.keys(names), ...Object.keys(votes)])]
      .sort((a, b) => a.localeCompare(b, 'bg', { numeric: true }));
    const total = typeof election['totalCandidateVotes'] === 'number' ? election['totalCandidateVotes']
      : Object.values(votes).reduce((sum, vote) => sum + vote.total, 0);
    elections[date] = {
      ...election,
      votesByParty: Object.fromEntries(ballotIds.map(id => {
        const vote = votes[id] ?? { total: 0, paper: 0, machine: 0 };
        return [id, { ...vote, name: names[id] ?? vote.name ?? `Бюлетина № ${id}`,
          share: percent(vote.total, total), shareOfVoters: percent(vote.total, election.voted) }];
      })),
    };
  }
  const history = { ...row.history };
  for (const date of ['2026.04.19', '2024.10.27']) {
    const election = elections[date];
    const previous = history[date];
    const parties: HistoryParty[] = Object.entries(election?.votesByParty ?? {}).map(([id, vote]) => ({
      id, name: vote.name ?? `Бюлетина № ${id}`, votes: vote.total, share: vote.share ?? null,
      shareOfVoters: percent(vote.total, election?.voted),
    }));
    history[date] = {
      ...previous,
      matched: previous?.matched ?? row.matches?.[date]?.comparable ?? false,
      gerbShare: previous?.gerbShare ?? null, dpsShare: previous?.dpsShare ?? null, parties,
    };
  }
  return { ...row, elections, history };
}
