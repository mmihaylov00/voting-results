import { describe, expect, it, vi } from 'vitest';
import { Section, SectionFilters } from '../models/election.models';
import { filterSections } from './election-utils';

const filters: SectionFilters = {
  searchTerm: '', activeTab: 'all', activityOperator: 'lte', lowActivityThreshold: null,
  sectionTypes: new Set(),
};

function section(sectionId: string, topParties: Section['topParties'] = []): Section {
  return {
    sectionId, regionId: '23', cityName: 'София', sectionName: '', sectionType: 'City',
    total: 100, voted: 50, discardedVotes: 0, noVotes: 0, activityBp: 5000,
    partyVotes: { '2': { total: 10, paper: 10, machine: 0 } }, topParties,
  };
}

describe('section filtering', () => {
  it('resolves the shared party identity once for the full dataset', () => {
    const leader = { partyId: '1', name: 'Други', total: 30, percentBp: 6000 };
    const ppdb = { partyId: '2', name: 'ПП-ДБ', total: 20, percentBp: 4000 };
    const sections = [section('1', [leader]), section('2', [leader]), section('3', [ppdb])];
    const find = vi.spyOn(sections, 'find');

    expect(filterSections(sections, filters)).toEqual(sections);
    expect(sections.map(row => row.votesToFirst)).toEqual([21, 21, 0]);
    expect(find).toHaveBeenCalledOnce();
  });

  it('keeps full-dataset party matching when the reference section is filtered out', () => {
    const sections = [
      section('1', [{ partyId: '1', name: 'Други', total: 30, percentBp: 6000 }]),
      section('2', [{ partyId: '2', name: 'ПП-ДБ', total: 20, percentBp: 4000 }]),
    ];
    const result = filterSections(sections, { ...filters, searchTerm: '1', activeTab: 'flip' });
    expect(result.map(row => row.sectionId)).toEqual(['1']);
    expect(result[0].votesToFirst).toBe(21);
  });

  it('preserves unavailable targeting values when no party identity exists', () => {
    const sections = [section('1', [{ partyId: '1', name: 'Други', total: 30, percentBp: 6000 }])];
    expect(filterSections(sections, filters)[0].votesToFirst).toBeUndefined();
    expect(filterSections([], filters)).toEqual([]);
  });
});
