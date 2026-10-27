import { describe, expect, it } from 'vitest';
import { CandidateVotes, Region, Section } from '../models/election.models';
import {
  ContestantElection, contestantGeography, contestantParticipations, contestantPreferences,
  contestantSectionRows, matchContestantId,
} from './contestant-profile.util';

function region(partyVotes: Record<string, number>, voted = 100): Region {
  return { id: '01', name: 'Район', total: 120, voted, partyVotes };
}

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010000001', regionId: '01', regionName: 'Първи район', cityName: 'Град',
    sectionName: 'Училище', sectionType: 'City', total: 120, voted: 100,
    discardedVotes: 0, noVotes: 0, activityBp: 8333, topParties: [],
    partyVotes: { '1': { total: 40, paper: 25, machine: 15 } }, ...overrides,
  };
}

function candidate(overrides: Partial<CandidateVotes> = {}): CandidateVotes {
  return {
    candidateId: '101', candidateName: 'Иван Иванов', partyId: '1', partyName: 'Партия',
    total: 20, paper: 12, machine: 8, ...overrides,
  };
}

describe('contestant profiles', () => {
  it('matches party identity rather than ballot numbers and keeps coalition splits separate', () => {
    expect(matchContestantId('ГЕРБ', { '7': 'ГЕРБ-СДС', '1': 'Друга партия' }, 'governmental')).toBe('7');
    expect(matchContestantId('ДПС', { '1': 'ДПС - Ново начало', '2': 'Алианс за права и свободи' }, 'governmental')).toBeNull();
    expect(matchContestantId('ГЕРБ', { '7': 'ГЕРБ-СДС', '8': 'ПП ГЕРБ' }, 'governmental')).toBeNull();
    expect(matchContestantId('Липсваща партия', { '1': 'Друга партия' }, 'governmental')).toBeNull();
  });

  it('matches the presidential person with a different running mate and refuses ambiguous tickets', () => {
    const previous = 'Иван Петров Иванов и Мария Петрова Николова';
    const current = 'Иван Петров Иванов и Елена Георгиева Димова';
    expect(matchContestantId(previous, { '3': current, '1': 'Друг Петров Иванов и Мария Петрова Николова' }, 'presidential')).toBe('3');
    expect(matchContestantId(previous.toLocaleUpperCase('bg'), { '3': current.toLocaleLowerCase('bg') }, 'presidential')).toBe('3');
    expect(matchContestantId(previous, { '3': current, '7': previous }, 'presidential')).toBeNull();
    expect(matchContestantId(previous, { '3': 'Мария Петрова Николова и Иван Петров Иванов' }, 'presidential')).toBeNull();
  });

  it('keeps per-election totals, competition ranks, metadata and full ticket names', () => {
    const ticket = 'Иван Петров Иванов и Мария Петрова Николова';
    const nextTicket = 'Иван Петров Иванов и Елена Георгиева Димова';
    const elections: ContestantElection[] = [
      { date: '2021.11.14', name: 'Първи тур', type: 'presidential', round: 1 },
      { date: '2026.10.25', name: 'Нов първи тур', type: 'presidential', round: 1,
        provisional: { sourceUrl: 'https://example.org', updatedAt: '2026-10-26', processedPercent: 90, reportedSections: 90, totalSections: 100 } },
      { date: '2024.10.27', name: 'Парламентарни', type: 'governmental' },
      { date: '2016.11.06', name: 'Без участие', type: 'presidential', round: 1 },
    ];
    const rows = contestantParticipations(ticket, 'presidential', elections, {
      '2021.11.14': { parties: { '1': ticket, '2': 'Друг кандидат' }, regions: [region({ '0': 500, '1': 30, '2': 70 })] },
      '2026.10.25': { parties: { '7': nextTicket, '2': 'Друг кандидат' }, regions: [region({ '7': 40, '2': 40 }, 80), region({ '7': 10, '2': 10 }, 20)] },
      '2024.10.27': { parties: { '7': nextTicket }, regions: [region({ '7': 100 })] },
      '2016.11.06': { parties: { '1': 'Друг кандидат' }, regions: [region({ '1': 80 })] },
    });
    expect(rows.map(row => row.date)).toEqual(['2026.10.25', '2021.11.14']);
    expect(rows[0]).toMatchObject({ fullName: nextTicket, partyId: '7', votes: 50, voted: 100, share: 50, rank: 1, gapToLeader: 0, round: 1 });
    expect(rows[0].provisional?.processedPercent).toBe(90);
    expect(rows[1]).toMatchObject({ votes: 30, share: 30, rank: 2, gapToLeader: 40 });
  });

  it('uses unavailable percentages for zero denominators', () => {
    const rows = contestantParticipations('Партия', 'governmental', [{ date: '2026.01.01', name: 'Избори', type: 'governmental' }], {
      '2026.01.01': { parties: { '1': 'Партия' }, regions: [region({ '1': 0 }, 0)] },
    });
    expect(rows[0].share).toBeNull();
    expect(contestantSectionRows([section({ voted: 0, partyVotes: {} })], '1')[0].share).toBeNull();
  });

  it('anchors an uncatalogued local ballot only to its exact election and never reuses its number historically', () => {
    const elections: ContestantElection[] = [
      { date: '2026.04.19', name: 'Текущи избори', type: 'governmental' },
      { date: '2024.10.27', name: 'Предишни избори', type: 'governmental' },
    ];
    const summaries = {
      '2026.04.19': { parties: { '1': 'Друга партия' }, regions: [region({ '1': 90, '25': 10 })] },
      '2024.10.27': { parties: { '25': 'Друга партия' }, regions: [region({ '25': 90 })] },
    };
    const rows = contestantParticipations('Бюлетина № 25', 'governmental', elections, summaries,
      { date: '2026.04.19', partyId: '25' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026.04.19', partyId: '25', fullName: 'Бюлетина № 25', votes: 10, rank: 2 });
    expect(contestantParticipations('Бюлетина № 25', 'governmental', elections, summaries,
      { date: '2026.04.19', partyId: '99' })).toEqual([]);
    expect(contestantParticipations('Бюлетина № 25', 'governmental', elections, summaries,
      { date: '2024.10.27', partyId: '25' })).toEqual([]);
    expect(contestantParticipations('ГЕРБ', 'governmental', elections, {
      '2026.04.19': { parties: { '1': 'ГЕРБ', '2': 'ГЕРБ-СДС' }, regions: [region({ '25': 10 })] },
    }, { date: '2026.04.19', partyId: '25' })).toEqual([]);
    expect(contestantParticipations('Подправено име', 'governmental', elections, summaries,
      { date: '2026.04.19', partyId: '25' })).toEqual([]);
  });

  it('resolves an ambiguous ballot only by its exact recorded name and anchored date', () => {
    const catalog = [
      { date: '2026.04.19', name: 'Текущи избори', type: 'governmental' },
      { date: '2024.10.27', name: 'Предишни избори', type: 'governmental' },
    ];
    const summaries = {
      '2026.04.19': { parties: { '1': 'ГЕРБ', '2': 'ГЕРБ-СДС' }, regions: [region({ '1': 30, '2': 20 })] },
      '2024.10.27': { parties: { '7': 'ПП ГЕРБ' }, regions: [region({ '7': 50 })] },
    };
    const rows = contestantParticipations('ГЕРБ', 'governmental', catalog, summaries, { date: '2026.04.19', partyId: '1' });
    expect(rows.map(row => [row.date, row.partyId, row.votes])).toEqual([['2026.04.19', '1', 30]]);
    expect(contestantParticipations('ГЕРБ-СДС', 'governmental', catalog, summaries,
      { date: '2026.04.19', partyId: '2' }).map(row => row.votes)).toEqual([20]);
    expect(contestantParticipations('ГЕРБ', 'governmental', catalog, summaries,
      { date: '2026.04.19', partyId: '2' })).toEqual([]);
    expect(contestantParticipations('КОАЛИЦИЯ ГЕРБ-СДС', 'governmental', catalog, summaries,
      { date: '2026.04.19', partyId: '2' })).toEqual([]);
    expect(contestantParticipations('ПП ГЕРБ', 'governmental', catalog, summaries,
      { date: '2024.10.27', partyId: '7' }).map(row => row.date)).toEqual(['2024.10.27']);
  });

  it('retains normal alias history but rejects synthetic, mismatched and missing anchors', () => {
    const catalog = [
      { date: '2026.04.19', name: 'Текущи избори', type: 'governmental' },
      { date: '2024.10.27', name: 'Предишни избори', type: 'governmental' },
    ];
    const summaries = {
      '2026.04.19': { parties: { '1': 'ГЕРБ-СДС', '2': 'БСП', '3': 'Други', '4': 'Не подкрепя никого' },
        regions: [region({ '1': 30, '2': 20, '3': 999, '4': 999, others: 999, no_votes: 999, '0': 999 })] },
      '2024.10.27': { parties: { '7': 'ПП ГЕРБ' }, regions: [region({ '7': 50 })] },
    };
    const rows = contestantParticipations('ГЕРБ', 'governmental', catalog, summaries, { date: '2026.04.19', partyId: '1' });
    expect(rows.map(row => row.partyId)).toEqual(['1', '7']);
    expect(rows[0].rank).toBe(1);
    for (const [name, partyId, date] of [
      ['БСП', '1', '2026.04.19'], ['ГЕРБ-СДС', '99', '2026.04.19'],
      ['Други', '3', '2026.04.19'], ['Не подкрепя никого', '4', '2026.04.19'],
      ['ГЕРБ', '0', '2026.04.19'], ['ГЕРБ', 'no_votes', '2026.04.19'], ['ГЕРБ', 'others', '2026.04.19'],
      ['Бюлетина № constructor', 'constructor', '2026.04.19'],
      ['ГЕРБ', '1', '2099.01.01'],
    ]) expect(contestantParticipations(name, 'governmental', catalog, summaries, { date, partyId })).toEqual([]);
  });

  it('attributes party signals correctly and distinguishes missing from zero assessments', () => {
    const rows = contestantSectionRows([
      section({ riskIndicators: [
        { code: 'common', category: 'R1', severity: 'low' },
        { code: 'own', category: 'R2', severity: 'high', details: { partyId: '1' } },
        { code: 'other', category: 'R2', severity: 'high', details: { partyId: '2' } },
        { code: 'candidate', category: 'R5', severity: 'high', details: { partyId: '1', candidateId: '101' } },
        { code: 'other-section', category: 'R1', severity: 'high', details: { sectionId: '999' } },
      ] }),
      section({ riskIndicators: [] }), section({ riskScore: 0 }), section(),
    ], '1');
    expect(rows[0].risks?.map(risk => risk.code)).toEqual(['common', 'own']);
    expect(rows[1].risks).toEqual([]);
    expect(rows[2].risks).toEqual([]);
    expect(rows[3].risks).toBeNull();
  });

  it('includes zero-support sections and keeps same-named places in different districts separate', () => {
    const sections = [section(), section({ sectionId: '020000001', regionId: '02', voted: 50, partyVotes: {} })];
    expect(contestantSectionRows(sections, '1').map(row => row.votes)).toEqual([40, 0]);
    const places = contestantGeography(sections, '1', 'settlement');
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ votes: 40, paper: 25, machine: 15, voted: 100, share: 40, sectionCount: 1 });
    expect(places[1].share).toBe(0);
    expect(places[0].id).not.toBe(places[1].id);
  });

  it('groups abroad countries for both canonical and normalized locations', () => {
    const rows = contestantGeography([
      section({ regionId: '32', municipalityName: 'Германия', cityName: 'Берлин' }),
      section({ regionId: '32', cityName: 'Германия, Мюнхен' }),
      section(),
    ], '1', 'country');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Германия', votes: 80, voted: 200, share: 40, sectionCount: 2 });
    expect(contestantGeography([section({ regionId: '32' })], '1', 'municipality')).toEqual([]);
  });

  it('keeps candidate numbers separate across districts and different names', () => {
    const sections = [
      section({ candidateVotes: { first: candidate(), second: candidate({ candidateId: '102', total: 10, paper: 6, machine: 4 }), other: candidate({ partyId: '2' }) } }),
      section({ candidateVotes: { first: candidate({ total: 10, paper: 6, machine: 4 }) } }),
      section({ regionId: '02', candidateVotes: { first: candidate({ candidateName: 'Петър Петров', total: 5, paper: 3, machine: 2 }) } }),
      section({ regionId: '02', candidateVotes: { first: candidate({ candidateName: 'Трети Кандидат', total: 5, paper: 3, machine: 2 }) } }),
    ];
    const rows = contestantPreferences(sections, '1', 'Партия');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ regionId: '01', candidateId: '101', total: 30, paper: 18, machine: 12,
      totalInRegion: 30, shareOfPartyVotes: 37.5, shareOfPreferences: 75, preferencePercentOfPartyVotes: 75 });
    expect(rows.filter(row => row.regionId === '02').map(row => row.candidateName)).toEqual(['Петър Петров', 'Трети Кандидат']);
    expect(contestantPreferences([section({ partyVotes: {}, candidateVotes: { first: candidate({ total: 0, paper: 0, machine: 0 }) } })], '1', 'Партия')[0].shareOfPartyVotes).toBeNull();
  });

  it('aggregates all parties in one pass without mixing matching candidate numbers or party denominators', () => {
    const sections = [
      section({ partyVotes: { '1': { total: 40, paper: 25, machine: 15 }, '2': { total: 20, paper: 20, machine: 0 } },
        candidateVotes: { first: candidate(), other: candidate({ partyId: '2', partyName: 'Друга партия', total: 10, paper: 10, machine: 0 }) } }),
      section({ partyVotes: { '1': { total: 60, paper: 60, machine: 0 }, '2': { total: 30, paper: 30, machine: 0 } } }),
      section({ regionId: '02', candidateVotes: { first: candidate({ total: 5, paper: 5, machine: 0 }) } }),
    ];
    const rows = contestantPreferences(sections);
    expect(rows).toHaveLength(3);
    expect(rows.find(row => row.regionId === '01' && row.partyId === '1')).toMatchObject({
      total: 20, shareOfPartyVotes: 20, shareOfPreferences: 100, partyPercentInRegion: 50,
    });
    expect(rows.find(row => row.partyId === '2')).toMatchObject({
      candidateId: '101', candidateName: 'Иван Иванов', partyName: 'Друга партия', total: 10,
      shareOfPartyVotes: 20, shareOfPreferences: 100, partyPercentInRegion: 25,
    });
    expect(rows.filter(row => row.partyId === '1')).toEqual(contestantPreferences(sections, '1', 'Партия'));
  });
});
