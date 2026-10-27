import { Region } from '../models/election.models';

export const NATIONAL_THRESHOLD = 4;
export const PARLIAMENT_SEATS = 240;
export const MAJORITY_SEATS = 121;

export interface NationalBallot {
  id: string;
  name: string;
  votes: number;
  eligible: boolean;
}

export interface SeatRow extends NationalBallot {
  share: number;
  seats: number;
  passedThreshold: boolean;
}

export interface SeatAllocation {
  rows: SeatRow[];
  totalVotes: number;
  representedVotes: number;
  hasRemainderTie: boolean;
}

export function buildNationalBallots(regions: Region[], parties: Record<string, string>): NationalBallot[] {
  const totals = new Map<string, number>();
  for (const region of regions) {
    for (const [id, votes] of Object.entries(region.partyVotes)) {
      if (id === '0') continue;
      if (!Number.isSafeInteger(votes) || votes < 0) throw new Error('Invalid ballot vote count');
      const total = (totals.get(id) ?? 0) + votes;
      if (!Number.isSafeInteger(total)) throw new Error('Invalid ballot vote total');
      totals.set(id, total);
    }
  }
  return [...totals].map(([id, votes]) => {
    const name = parties[id]?.trim();
    return {
      id, votes,
      name: name || `Местна листа № ${id}`,
      // shortcut: local ballots lack national names here; use explicit ballot types if the catalog includes them.
      eligible: !!name && !/^(?:ИК|ИНИЦИАТИВЕН КОМИТЕТ)(?:\s|$)|НЕЗАВИСИМ КАНДИДАТ/iu.test(name),
    };
  }).sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id, 'bg', { numeric: true }));
}

export function parseSeatThreshold(raw: string | null): number {
  if (raw === null || !/^\d{1,2}(?:\.\d)?$/.test(raw)) return NATIONAL_THRESHOLD;
  const value = Number(raw);
  return value >= 0 && value <= 10 ? value : NATIONAL_THRESHOLD;
}

export function allocateSeats(ballots: NationalBallot[], threshold = NATIONAL_THRESHOLD): SeatAllocation {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100
    || Math.abs(threshold * 100 - Math.round(threshold * 100)) > 1e-8) {
    throw new Error('Invalid threshold');
  }
  const identities = new Set<string>();
  let totalVotes = 0;
  for (const ballot of ballots) {
    if (identities.has(ballot.id) || !Number.isSafeInteger(ballot.votes) || ballot.votes < 0) {
      throw new Error('Invalid ballot');
    }
    identities.add(ballot.id);
    totalVotes += ballot.votes;
  }
  if (!Number.isSafeInteger(totalVotes)) throw new Error('Invalid total vote count');
  const thresholdBp = BigInt(Math.round(threshold * 100));
  const rows: SeatRow[] = ballots.map((ballot) => ({
    ...ballot,
    share: totalVotes > 0 ? ballot.votes / totalVotes * 100 : 0,
    seats: 0,
    passedThreshold: ballot.eligible && ballot.votes > 0
      && BigInt(ballot.votes) * 10000n >= BigInt(totalVotes) * thresholdBp,
  }));
  const qualified = rows.filter((row) => row.passedThreshold);
  const representedVotes = qualified.reduce((sum, row) => sum + row.votes, 0);
  if (representedVotes === 0) return { rows, totalVotes, representedVotes, hasRemainderTie: false };

  const denominator = BigInt(representedVotes);
  const remainders = qualified.map((row) => {
    const numerator = BigInt(row.votes) * BigInt(PARLIAMENT_SEATS);
    row.seats = Number(numerator / denominator);
    return { row, remainder: numerator % denominator };
  }).sort((a, b) => a.remainder === b.remainder
    ? a.row.id.localeCompare(b.row.id, 'bg', { numeric: true })
    : a.remainder > b.remainder ? -1 : 1);
  const remaining = PARLIAMENT_SEATS - qualified.reduce((sum, row) => sum + row.seats, 0);
  const hasRemainderTie = remaining > 0 && remaining < remainders.length
    && remainders[remaining - 1].remainder === remainders[remaining].remainder;
  for (let index = 0; index < remaining; index++) remainders[index].row.seats++;
  return { rows, totalVotes, representedVotes, hasRemainderTie };
}

export function coalitionSeats(rows: SeatRow[], selected: ReadonlySet<string>): number {
  return rows.reduce((sum, row) => sum + (selected.has(row.id) ? row.seats : 0), 0);
}
