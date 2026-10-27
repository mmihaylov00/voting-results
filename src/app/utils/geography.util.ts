import { Region } from '../models/election.models';

export function topElectoralRegions(regions: Region[], previous: Region[] | null) {
  const domestic = regions.filter(region => Number(region.id) !== 32);
  const prior = previous?.filter(region => Number(region.id) !== 32) ?? [];
  const total = domestic.reduce((sum, region) => sum + region.voted, 0);
  const priorTotal = prior.reduce((sum, region) => sum + region.voted, 0);
  const priorById = new Map(prior.map(region => [Number(region.id), region]));
  const sorted = [...domestic].sort((left, right) => right.voted - left.voted || left.name.localeCompare(right.name, 'bg'));
  const maxVoted = sorted[0]?.voted ?? 0;
  return sorted.slice(0, 10).map(region => {
    const votes = Object.entries(region.partyVotes).filter(([id, count]) => id !== '0' && count > 0);
    const maxVotes = Math.max(0, ...votes.map(([, count]) => count));
    const winners = votes.filter(([, count]) => count === maxVotes);
    const baseline = priorById.get(Number(region.id));
    const share = total > 0 ? region.voted / total * 100 : null;
    const priorShare = baseline && priorTotal > 0 ? baseline.voted / priorTotal * 100 : null;
    const ballots = (region.totalPaper ?? 0) + (region.totalMachine ?? 0);
    return {
      ...region,
      winnerId: winners.length === 1 ? winners[0][0] : null,
      tied: winners.length > 1,
      share, priorShare,
      turnout: region.total > 0 ? region.voted / region.total * 100 : null,
      machineShare: region.totalPaper !== undefined && region.totalMachine !== undefined && ballots > 0 ? region.totalMachine / ballots * 100 : null,
      barWidth: maxVoted > 0 ? region.voted / maxVoted * 100 : 0,
    };
  });
}
