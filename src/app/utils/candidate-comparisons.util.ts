import { ComparativeValue, RegionCandidate, Section } from '../models/election.models';

type CandidateIdentity = Pick<RegionCandidate, 'candidateName' | 'partyName'>;

export interface CandidateComparisonValues {
  comparisons: ComparativeValue[];
  paperComparisons: ComparativeValue[];
  machineComparisons: ComparativeValue[];
}

export function candidateComparisonKey(candidate: CandidateIdentity): string {
  return JSON.stringify([
    candidate.candidateName.trim().toLowerCase(),
    candidate.partyName.trim().toLowerCase(),
  ]);
}

export async function buildCandidateComparisonIndex(
  candidates: readonly CandidateIdentity[],
  history: Record<string, { sections: readonly Section[] }>,
  currentDate: string,
  regionId?: string,
  signal?: AbortSignal,
): Promise<Map<string, CandidateComparisonValues>> {
  signal?.throwIfAborted();
  const results = new Map<string, CandidateComparisonValues>();
  for (const candidate of candidates) {
    results.set(candidateComparisonKey(candidate), {
      comparisons: [], paperComparisons: [], machineComparisons: [],
    });
  }
  if (results.size === 0) return results;

  let inspectedSections = 0;
  const dates = Object.keys(history).filter(date => date !== currentDate).sort().reverse();
  for (const date of dates) {
    signal?.throwIfAborted();
    const totals = new Map<string, { total: number; paper: number; machine: number }>();
    for (const section of history[date].sections) {
      if (!regionId || regionId === 'all' || section.regionId === regionId) {
        const votes = section.candidateVotes;
        if (votes) {
          const matched = new Set<string>();
          for (const candidate of Object.values(votes)) {
            const key = candidateComparisonKey(candidate);
            if (!results.has(key) || matched.has(key)) continue;
            // Each section contributed only its first identity match in the original comparison.
            matched.add(key);
            const total = totals.get(key) ?? { total: 0, paper: 0, machine: 0 };
            total.total += candidate.total;
            total.paper += candidate.paper;
            total.machine += candidate.machine;
            totals.set(key, total);
          }
        }
      }
      if (++inspectedSections % 50 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal?.throwIfAborted();
      }
    }

    for (const [key, total] of totals) {
      if (total.total <= 0) continue;
      const result = results.get(key)!;
      result.comparisons.push({ v: total.total, d: date });
      result.paperComparisons.push({ v: total.paper, d: date });
      result.machineComparisons.push({ v: total.machine, d: date });
    }
  }
  signal?.throwIfAborted();
  return results;
}
