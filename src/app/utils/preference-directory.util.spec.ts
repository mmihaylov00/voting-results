import { ContestantPreferenceRow } from './contestant-profile.util';
import { PreferenceDirectoryData, preferenceDirectory } from './preference-directory.util';

const elections = [{ date: '2024.10.27', name: 'Предишни избори', type: 'governmental' },
  { date: '2026.04.19', name: 'Последни избори', type: 'governmental' }];
function row(overrides: Partial<ContestantPreferenceRow> = {}): ContestantPreferenceRow {
  return { regionId: '2', regionName: 'Бургас', candidateId: '101', candidateName: 'Румен Георгиев Радев',
    partyId: '1', partyName: 'ГЕРБ-СДС', total: 20, paper: 12, machine: 8, totalInRegion: 20,
    partyPercentInRegion: 40, preferencePercentOfPartyVotes: 50, shareOfPartyVotes: 20, shareOfPreferences: 50, ...overrides };
}
function result(rows: ContestantPreferenceRow[]): PreferenceDirectoryData {
  return { rows, regions: ['2', '25'].map(id => ({ id, name: id, total: 200000, voted: 100000,
    partyVotes: { '1': id === '2' ? 50000 : 100000, '2': 20000, '7': 1000 } })) };
}

describe('preference directory grouping', () => {
  it('combines the same person across districts within an election and weights the party denominator', () => {
    const data = { '2026.04.19': result([
      row({ total: 22741, paper: 9279, machine: 13462 }),
      row({ regionId: '25', regionName: 'София', total: 21541, paper: 7066, machine: 14475 }),
      row({ candidateName: 'Друг Кандидат', candidateId: '102', total: 5 }),
    ]) };
    const before = structuredClone(data);
    const cards = preferenceDirectory(elections, data);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ name: 'Румен Георгиев Радев', votes: 44282, date: '2026.04.19', participationCount: 1,
      candidate: { total: 44282, paper: 16345, machine: 27937 } });
    expect(cards[0].share).toBeCloseTo(44282 / 150000 * 100);
    expect(cards[0].lists.map(list => list.regionId)).toEqual(['2', '25']);
    expect(data).toEqual(before);
  });

  it('lists historical people once, shows the latest result and can select an older election without summing dates', () => {
    const data = { '2026.04.19': result([row()]), '2024.10.27': result([
      row({ candidateName: 'РУМЕН ГЕОРГИЕВ РАДЕВ', partyId: '7', partyName: 'ПП ГЕРБ', total: 100 }),
      row({ candidateName: 'Исторически Кандидат', candidateId: '102', total: 10 }),
    ]) };
    const all = preferenceDirectory(elections, data);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ votes: 20, participationCount: 2, date: '2026.04.19' });
    expect(all[1]).toMatchObject({ name: 'Исторически Кандидат', date: '2024.10.27' });
    const previous = preferenceDirectory(elections, data, '2024.10.27');
    expect(previous[0]).toMatchObject({ votes: 100, partyId: '7', date: '2024.10.27', participationCount: 2 });
    expect(preferenceDirectory(elections, data, 'missing')).toEqual([]);
  });

  it('keeps other-party namesakes and ambiguous same-district names separate', () => {
    const cards = preferenceDirectory(elections, { '2026.04.19': result([
      row(), row({ candidateId: '102' }), row({ partyId: '2', partyName: 'БСП' }),
    ]) });
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map(card => card.id)).size).toBe(3);
    expect(cards.every(card => card.lists.length === 1)).toBe(true);
  });

  it('leaves missing party denominators unavailable and ignores synthetic contestants', () => {
    const cards = preferenceDirectory(elections, { '2026.04.19': { rows: [row(), row({ partyId: '0', partyName: 'Други' })], regions: [] } });
    expect(cards).toHaveLength(1);
    expect(cards[0].share).toBeNull();
  });
});
