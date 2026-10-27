import { describe, expect, it } from 'vitest';
import { Region } from '../models/election.models';
import { ContestantElection, ContestantSummary } from './contestant-profile.util';
import { contestantDirectory } from './contestant-directory.util';

function region(partyVotes: Record<string, number>, voted = 100): Region {
  return { id: '01', name: 'Район', total: 150, voted, partyVotes };
}

const elections: ContestantElection[] = [
  { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
  { date: '2026.04.19', name: 'Април 2026', type: 'governmental' },
  { date: '2023.04.02', name: 'Април 2023', type: 'governmental' },
  { date: '2026.10.25', name: 'Октомври 2026', type: 'presidential', round: 1 },
];

describe('contestant directory', () => {
  it('deduplicates curated party history and anchors each profile to its latest participation', () => {
    const rows = contestantDirectory('governmental', elections, {
      '2026.04.19': { parties: { '7': 'ГЕРБ-СДС' }, regions: [region({ '7': 40 }), region({ '7': 10 }, 50)] },
      '2024.10.27': { parties: { '1': 'ПП ГЕРБ' }, regions: [region({ '1': 20 })] },
      '2023.04.02': { parties: { '8': 'ГЕРБ' }, regions: [region({ '8': 10 })] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'ГЕРБ-СДС', displayName: 'ГЕРБ-СДС', date: '2026.04.19',
      partyId: '7', electionName: 'Април 2026', participationCount: 3, votes: 50,
      names: ['ГЕРБ-СДС', 'ПП ГЕРБ', 'ГЕРБ'] });
    expect(rows[0].share).toBeCloseTo(100 / 3);
  });

  it('preserves distinct DPS formations and ballots reusing an older number', () => {
    const rows = contestantDirectory('governmental', elections, {
      '2026.04.19': { parties: { '1': 'ДПС - Ново начало', '2': 'Алианс за права и свободи' }, regions: [region({ '1': 40, '2': 30 })] },
      '2024.10.27': { parties: { '1': 'ДПС' }, regions: [region({ '1': 60 })] },
    });
    expect(rows.map(row => row.name)).toEqual(['ДПС - Ново начало', 'Алианс за права и свободи', 'ДПС']);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    expect(rows.every(row => row.participationCount === 1)).toBe(true);
  });

  it('keeps historical-only contestants and sorts current results before older totals', () => {
    const rows = contestantDirectory('governmental', elections, {
      '2026.04.19': { parties: { '1': 'По-малка партия', '2': 'По-голяма партия' }, regions: [region({ '1': 1, '2': 80 })] },
      '2024.10.27': { parties: { '7': 'Историческа партия' }, regions: [region({ '7': 5000 }, 6000)] },
    });
    expect(rows.map(row => row.name)).toEqual(['По-голяма партия', 'По-малка партия', 'Историческа партия']);
    expect(rows[2]).toMatchObject({ date: '2024.10.27', partyId: '7', participationCount: 1, votes: 5000 });
  });

  it('excludes synthetic IDs and names and isolates election types', () => {
    const summary: ContestantSummary = { parties: {
      '0': 'Всички партии', no_votes: 'Не подкрепям никого', others: 'Други',
      '2': ' други ', '3': 'Не подкрепя никого', '4': 'Не подкрепям никого', '5': 'Реална партия',
    }, regions: [region({ '0': 500, no_votes: 20, others: 10, '2': 9, '3': 8, '4': 7, '5': 30 })] };
    const summaries = {
      '2026.04.19': summary,
      '2026.10.25': { parties: { '1': 'Иван Иванов и Мария Маринова' }, regions: [region({ '1': 50 })] },
    };
    expect(contestantDirectory('governmental', elections, summaries).map(row => row.name)).toEqual(['Реална партия']);
    expect(contestantDirectory('presidential', elections, summaries).map(row => row.name)).toEqual(['Иван Иванов и Мария Маринова']);
  });

  it('tracks a presidential person across running mates and retains ticket names for search', () => {
    const catalog: ContestantElection[] = [
      { date: '2026.10.25', name: 'Нов първи тур', type: 'presidential', round: 1 },
      { date: '2021.11.21', name: 'Предишен втори тур', type: 'presidential', round: 2 },
    ];
    const rows = contestantDirectory('presidential', catalog, {
      '2026.10.25': { parties: { '2': 'Иван Петров Иванов и Елена Георгиева Димова' }, regions: [region({ '2': 60 })] },
      '2021.11.21': { parties: { '8': 'Иван Петров Иванов и Мария Петрова Николова',
        '2': 'Мария Петрова Николова и Иван Петров Иванов' }, regions: [region({ '8': 70, '2': 10 })] },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Иван Петров Иванов и Елена Георгиева Димова', displayName: 'Иван Петров Иванов',
      partyId: '2', date: '2026.10.25', participationCount: 2 });
    expect(rows[0].names).toEqual(['Иван Петров Иванов и Елена Георгиева Димова', 'Иван Петров Иванов и Мария Петрова Николова']);
    expect(rows[1].displayName).toBe('Мария Петрова Николова');
    expect(rows[1].participationCount).toBe(1);
  });

  it('does not silently combine ambiguous same-election aliases or assign them older history', () => {
    const rows = contestantDirectory('governmental', elections, {
      '2026.04.19': { parties: { '1': 'ГЕРБ', '2': 'ГЕРБ-СДС' }, regions: [region({ '1': 30, '2': 20 })] },
      '2024.10.27': { parties: { '7': 'ПП ГЕРБ' }, regions: [region({ '7': 50 })] },
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    expect(rows.map(row => [row.partyId, row.votes, row.participationCount])).toEqual([
      ['1', 30, 1], ['2', 20, 1], ['7', 50, 1],
    ]);
  });

  it('includes uncatalogued real ballots only as date-specific numbered entries', () => {
    const rows = contestantDirectory('governmental', elections, {
      '2026.04.19': { parties: {}, regions: [region({ '25': 10, '0': 100 })] },
      '2024.10.27': { parties: {}, regions: [region({ '25': 20 })] },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.name)).toEqual(['Бюлетина № 25', 'Бюлетина № 25']);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.every(row => row.participationCount === 1 && row.partyId === '25')).toBe(true);
  });

  it('keeps zero-denominator shares unavailable and preserves latest preliminary metadata', () => {
    const provisional = { sourceUrl: 'https://example.org', updatedAt: '2026-10-26', processedPercent: 90,
      reportedSections: 90, totalSections: 100 };
    const catalog = [{ ...elections[1], provisional }];
    const rows = contestantDirectory('governmental', catalog, {
      '2026.04.19': { parties: { '1': 'Партия' }, regions: [region({ '1': 0 }, 0)] },
    });
    expect(rows[0]).toMatchObject({ votes: 0, share: null, provisional });
  });

  it('filters by participation in an election while retaining complete archive counts', () => {
    const summaries = {
      '2026.04.19': { parties: { '7': 'ГЕРБ-СДС', '8': 'Нова партия' }, regions: [region({ '7': 40, '8': 10 })] },
      '2024.10.27': { parties: { '1': 'ПП ГЕРБ', '2': 'Историческа партия' }, regions: [region({ '1': 30, '2': 20 })] },
    };
    const rows = contestantDirectory('governmental', elections, summaries, '2024.10.27');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2024.10.27', name: 'ПП ГЕРБ', partyId: '1', votes: 30, participationCount: 2 });
    expect(rows[0].names).toEqual(['ГЕРБ-СДС', 'ПП ГЕРБ']);
    expect(contestantDirectory('governmental', elections, summaries, 'missing')).toEqual([]);
  });

  it('does not mutate the catalog, summaries or source name collections', () => {
    const summaries = {
      '2026.04.19': { parties: { '7': 'ГЕРБ-СДС' }, regions: [region({ '7': 40 })] },
      '2024.10.27': { parties: { '1': 'ГЕРБ' }, regions: [region({ '1': 30 })] },
    };
    const before = structuredClone({ elections, summaries });
    const rows = contestantDirectory('governmental', elections, summaries);
    expect({ elections, summaries }).toEqual(before);
    rows[0].names.push('Редактирано име');
    expect({ elections, summaries }).toEqual(before);
  });
});
