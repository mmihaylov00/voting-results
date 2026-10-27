export function sortPartiesByVotes<T extends { id: string; total?: number }>(
  parties: readonly T[],
  votes?: Readonly<Record<string, number>>,
): T[] {
  const total = (party: T) => votes?.[party.id] ?? party.total ?? 0;
  return [...parties].sort((left, right) => total(right) - total(left));
}

export function partyVoteTotals(rows: readonly { partyVotes: Record<string, number | { total: number }> }[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    for (const [id, votes] of Object.entries(row.partyVotes)) {
      totals[id] = (totals[id] ?? 0) + (typeof votes === 'number' ? votes : votes.total);
    }
  }
  return totals;
}
