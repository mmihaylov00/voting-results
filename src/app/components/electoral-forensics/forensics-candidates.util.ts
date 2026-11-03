import { CandidateChange, CandidateVoteTotals, ForensicsSection } from './forensics.models';

export function candidateDelta(row: { candidateChanges?: readonly CandidateChange[] }, id: string): number | null {
  return row.candidateChanges?.find(candidate => candidate.id === id)?.deltaVotes ?? null;
}

export function hasReviewFlag(row: ForensicsSection): boolean {
  return !!(row.signal.flags.length || row.addedReviewFlags?.length || row.candidateReviewFlags?.length);
}

/** Absolute gains and voter totals always use the same eligible, complete round pair. */
export function jointVoteSummary(rows: readonly ForensicsSection[]) {
  const cohort = rows.filter(row => row.comparableRoundPair && row.eligible !== false
    && row.registered1 !== null && row.registered1 > 0 && row.registered2 !== null && row.registered2 > 0
    && row.voted1 !== null && row.voted2 !== null
    && row.candidateChanges.some(candidate => candidate.id === '4')
    && row.candidateChanges.some(candidate => candidate.id === '25'));
  const totals = { registered1: 0, registered2: 0, voted1: 0, voted2: 0 };
  const candidates = new Map<string, CandidateVoteTotals>();
  for (const row of cohort) {
    totals.registered1 += row.registered1 ?? 0;
    totals.registered2 += row.registered2 ?? 0;
    totals.voted1 += row.voted1 ?? 0;
    totals.voted2 += row.voted2 ?? 0;
    for (const candidate of row.candidateChanges) {
      const total = candidates.get(candidate.id) ?? { id: candidate.id, name: candidate.name, votes1: 0, votes2: 0, deltaVotes: 0 };
      total.votes1 += candidate.votes1;
      total.votes2 += candidate.votes2;
      total.deltaVotes = total.votes2 - total.votes1;
      candidates.set(candidate.id, total);
    }
  }
  const turnout1 = totals.registered1 > 0 ? 100 * totals.voted1 / totals.registered1 : null;
  const turnout2 = totals.registered2 > 0 ? 100 * totals.voted2 / totals.registered2 : null;
  return { n: cohort.length, ...totals, turnout1, turnout2,
    deltaVoted: cohort.length ? totals.voted2 - totals.voted1 : null,
    deltaTurnoutPp: turnout1 === null || turnout2 === null ? null : turnout2 - turnout1,
    candidates: [...candidates.values()],
  };
}
