import { Region } from '../models/election.models';
import { allocateSeats, buildNationalBallots, NATIONAL_THRESHOLD } from './seat-allocation.util';

/** Parliamentary results must cover the whole country, including votes from abroad. */
export function getBelowThresholdPartyIds(regions: Region[], parties: Record<string, string>): Set<string> | null {
  const { rows, totalVotes } = allocateSeats(buildNationalBallots(regions, parties), NATIONAL_THRESHOLD);
  if (!totalVotes || !rows.some((row) => row.eligible)) return null;
  return new Set(rows.filter((row) => row.eligible && !row.passedThreshold).map((row) => row.id));
}
