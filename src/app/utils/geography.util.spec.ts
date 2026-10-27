import { Region } from '../models/election.models';
import { topElectoralRegions } from './geography.util';

const region = (id: string, voted: number, extra: Partial<Region> = {}): Region => ({ id, name: `Район ${id}`, total: 1000, voted, partyVotes: { '1': 20, '2': 30 }, ...extra });

describe('top electoral regions', () => {
  it('ranks domestic districts and uses all domestic voters as the denominator', () => {
    const regions = [region('1', 100), region('2', 300), region('32', 10000)];
    const rows = topElectoralRegions(regions, [region('01', 100), region('2', 100), region('32', 90000)]);
    expect(rows.map(row => row.id)).toEqual(['2', '1']);
    expect(rows[0].share).toBe(75);
    expect(rows[0].priorShare).toBe(50);
    expect(rows[1].priorShare).toBe(50);
    expect(rows[0].barWidth).toBe(100);
    expect(regions[0].id).toBe('1');
  });

  it('excludes synthetic others from winners and distinguishes ties and missing denominators', () => {
    const rows = topElectoralRegions([region('1', 100, { total: 0, partyVotes: { '0': 500, '1': 40, '2': 40 } })], null);
    expect(rows[0].winnerId).toBeNull();
    expect(rows[0].tied).toBe(true);
    expect(rows[0].turnout).toBeNull();
    expect(rows[0].machineShare).toBeNull();
    expect(rows[0].priorShare).toBeNull();
  });

  it('retains a true zero machine share and limits the ranking to ten districts', () => {
    const rows = topElectoralRegions(Array.from({ length: 12 }, (_, index) => region(String(index + 1), 100 + index, { totalPaper: 90, totalMachine: 0 })), []);
    expect(rows).toHaveLength(10);
    expect(rows[0].machineShare).toBe(0);
    expect(rows[0].winnerId).toBe('2');
    expect(rows[0].priorShare).toBeNull();
  });
});
