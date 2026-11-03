import { describe, expect, it } from 'vitest';
import { sectionFixture } from './forensics.fixtures';
import { SectionFilters } from './forensics.models';
import { filterSections, safeSourceLinks, signed } from './forensics.util';

const filters: SectionFilters = {
  focus: false, scope: 'priority', search: '', size: '', method: '', comparableOnly: true,
  flaggedOnly: false, sort: 'deltaTurnoutPp', descending: true,
};

describe('research section selection', () => {
  it('keeps the focused sample at <=400 registered electors in the priority regions', () => {
    const rows = [sectionFixture(), sectionFixture({ sectionId: '2', registered1: 401, small400: false }),
      sectionFixture({ sectionId: '3', priority: false }), sectionFixture({ sectionId: '4', comparableRoundPair: false })];
    expect(filterSections(rows, { ...filters, focus: true, scope: 'national' }).map(row => row.sectionId)).toEqual(['050100001']);
    expect(filterSections(rows, { ...filters, focus: true, comparableOnly: false }).map(row => row.sectionId)).toEqual(['4', '050100001']);
  });

  it('searches Bulgarian geography and EKATTE and combines method, size and review filters', () => {
    const row = sectionFixture();
    row.signal.flags = ['Промяна за преглед'];
    expect(filterSections([row], { ...filters, search: 'РАБИША', method: 'paper', size: '<300', flaggedOnly: true })).toEqual([row]);
    expect(filterSections([row], { ...filters, search: '61097' })).toEqual([row]);
    expect(filterSections([row], { ...filters, method: 'machine' })).toEqual([]);
  });

  it('keeps missing measurements last and does not mutate source order', () => {
    const missing = sectionFixture({ sectionId: '3', deltaTurnoutPp: null });
    const low = sectionFixture({ sectionId: '1', deltaTurnoutPp: -10 });
    const high = sectionFixture({ sectionId: '2', deltaTurnoutPp: 20 });
    const rows = [missing, low, high];
    expect(filterSections(rows, filters).map(row => row.sectionId)).toEqual(['2', '1', '3']);
    expect(filterSections(rows, { ...filters, descending: false }).map(row => row.sectionId)).toEqual(['1', '2', '3']);
    expect(rows[0]).toBe(missing);
  });

  it('separates matched identities from arithmetic eligibility in the primary sample', () => {
    const row = sectionFixture({ comparableRoundPair: true, eligible: false });
    expect(filterSections([row], filters)).toEqual([]);
    expect(filterSections([row], { ...filters, comparableOnly: false })).toEqual([row]);
  });

  it('links only valid official CIK sources and treats missing values explicitly', () => {
    const row = sectionFixture({ elections: { '2026.11.01': {
      registered: 250, voted: 170, turnout: 68, votesByParty: {}, sourceUrls: {
        protocol: 'https://results.cik.bg/pvr202610/protocol.html', canonical: '/data/original.txt',
        malicious: 'javascript:alert(1)', lookalike: 'https://cik.bg.example.org/data',
      },
    } } });
    expect(safeSourceLinks(row)).toEqual([{ date: '2026.11.01', url: 'https://results.cik.bg/pvr202610/protocol.html' }]);
    expect(signed(null)).toBe('няма данни');
    expect(signed(0)).toContain('0');
  });
});
