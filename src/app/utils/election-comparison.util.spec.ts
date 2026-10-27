import { describe, expect, it } from 'vitest';
import { Section } from '../models/election.models';
import { analysisCsv, comparisonRow, indexSections, matchHistoricalSection, matchPartyId, regionSnapshot, sectionSnapshot } from './election-comparison.util';

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
    total: 100, voted: 80, discardedVotes: 2, noVotes: 3, totalPaper: 40, totalMachine: 35,
    partyVotes: { '1': { total: 45, paper: 25, machine: 20 }, '2': { total: 30, paper: 15, machine: 15 } },
    topParties: [], activityBp: 8000, ...overrides,
  };
}

describe('election comparison', () => {
  it('matches curated identities without merging rival factions or separate coalitions', () => {
    expect(matchPartyId('ГЕРБ-СДС', { '2': 'КОАЛИЦИЯ ГЕРБ - СДС' })).toBe('2');
    expect(matchPartyId('ГЕРБ-СДС', { '11': 'ПП ГЕРБ' })).toBe('11');
    expect(matchPartyId('МИР', { '3': 'ПП МИР' })).toBe('3');
    expect(matchPartyId('ДПС', { '1': 'ДПС - НОВО НАЧАЛО', '2': 'АЛИАНС ЗА ПРАВА И СВОБОДИ' })).toBeNull();
    expect(matchPartyId('ПП-ДБ', { '1': 'ПРОДЪЛЖАВАМЕ ПРОМЯНАТА' })).toBeNull();
    expect(matchPartyId('ГЕРБ-СДС', { '1': 'ГЕРБ', '2': 'ГЕРБ-СДС' })).toBeNull();
  });

  it('requires stable section and location, and rejects duplicate section identities', () => {
    const current = section({ settlementEkatte: '02676' });
    expect(matchHistoricalSection(current, indexSections([section({ regionId: '1', settlementEkatte: '02676' })]))).toBeDefined();
    expect(matchHistoricalSection(current, indexSections([section({ settlementEkatte: '99999' })]))).toBeUndefined();
    expect(matchHistoricalSection(current, indexSections([section({ cityName: 'София' })]))).toBeUndefined();
    expect(matchHistoricalSection(current, indexSections([section(), section()]))).toBeUndefined();
    expect(matchHistoricalSection(current, indexSections([section({ regionId: '2' })]))).toBeUndefined();
  });

  it('aggregates raw counts before calculating rates and keeps unavailable parties null', () => {
    const result = sectionSnapshot([section(), section({ total: 900, voted: 90 })], '1');
    expect(result.turnout).toBe(17);
    expect(result.share).toBeCloseTo(90 / 170 * 100);
    expect(result.machine).toBeCloseTo(70 / 150 * 100);
    expect(result.margin).toBe(3);
    expect(sectionSnapshot([section()], null).votes).toBeNull();
    expect(sectionSnapshot([section()], 'missing-but-registered').votes).toBe(0);
    expect(sectionSnapshot([], '1').share).toBeNull();
  });

  it('uses official national electors when provided', () => {
    const result = regionSnapshot([{ id: '1', name: 'Регион', total: 100, voted: 50, partyVotes: { '1': 20 } }], '1', 200);
    expect(result.turnout).toBe(25);
    expect(result.share).toBe(40);
  });

  it('uses percentage point differences and does not turn missing historical data into zero', () => {
    const current = sectionSnapshot([section()], '1');
    const previous = sectionSnapshot([section({ voted: 100 })], '1');
    const row = comparisonRow('1', 'Банско', current, previous);
    expect(row.voteChange).toBe(0);
    expect(row.shareChange).toBe(11.25);
    expect(row.turnoutChange).toBe(-20);
    expect(comparisonRow('1', 'Банско', current, null).voteChange).toBeNull();
  });

  it('exports sorted row values, quotes text and neutralizes spreadsheet formulas', () => {
    const row = comparisonRow('1', '=HYPERLINK("example")', sectionSnapshot([section()], '1'), null);
    const csv = analysisCsv([row], '2026.04.19', '2024.10.27', 'Партия');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""example"")"');
    expect(csv).toContain('"45","",""');
  });
});
