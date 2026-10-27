import { Section } from '../models/election.models';
import { applyMapComparison } from './election-map-comparison.util';
import { MapAggregate } from './map-metric.helper';

const section = (id: string, voted: number, votes: number, cityName = 'София'): Section => ({
  sectionId: id, regionId: '23', cityName, sectionName: id, sectionType: 'normal',
  total: 1000, voted, discardedVotes: 0, noVotes: 0, activityBp: voted * 10,
  partyVotes: { '1': { total: votes, paper: votes, machine: 0 } }, topParties: [],
});
const aggregate: MapAggregate = {
  total: 2000, totalElectors: 2000, voted: 600, discardedVotes: 0, noVotes: 0,
  totalPaper: 600, totalMachine: 0, riskScore: 0, partyTotals: { '1': 180 },
};

describe('map election comparison', () => {
  it('compares weighted totals, rather than averaging section percentages', () => {
    const current = [section('a', 100, 80), section('b', 500, 100)];
    const previous = [section('a', 200, 100), section('b', 200, 100)];
    expect(applyMapComparison(aggregate, current, previous, '1', '1').partyChangePp).toBeCloseTo(-20);
    expect(aggregate.partyChangePp).toBeUndefined();
  });

  it('requires complete geographic coverage and a known historical party', () => {
    const current = [section('a', 100, 80), section('b', 500, 100)];
    expect(applyMapComparison(aggregate, current, [section('a', 200, 100)], '1', '1').partyChangePp).toBeNull();
    expect(applyMapComparison(aggregate, current, current, '1', null).partyChangePp).toBeNull();
    expect(applyMapComparison(aggregate, [current[0]], [section('a', 200, 100, 'Варна')], '1', '1').partyChangePp).toBeNull();
  });

  it('keeps zero support distinct from missing data and avoids zero denominators', () => {
    expect(applyMapComparison(aggregate, [section('a', 100, 0)], [section('a', 100, 50)], '1', '1').partyChangePp).toBe(-50);
    expect(applyMapComparison(aggregate, [section('a', 0, 0)], [section('a', 100, 50)], '1', '1').partyChangePp).toBeNull();
  });
});
