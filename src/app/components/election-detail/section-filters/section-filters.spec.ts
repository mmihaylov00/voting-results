import { TestBed } from '@angular/core/testing';
import { SectionFilters } from '../../../models/election.models';

import { ELECTION_TYPE } from '../../../utils/election-type';
import { SectionFiltersComponent } from './section-filters';

describe('Section election filters', () => {
  it('omits party strategy and preference filters for presidential results', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ELECTION_TYPE, useValue: 'presidential' }] });
    const component = TestBed.runInInjectionContext(() => new SectionFiltersComponent());

    expect(component.quickFilterTabs.map(tab => tab.id)).toEqual(['all']);
    expect(component.riskCategories.map(category => category.code)).toEqual(['R1', 'R2', 'R3', 'R4']);
  });

  it('keeps party strategy filters for parliamentary results', () => {
    TestBed.configureTestingModule({});
    const component = TestBed.runInInjectionContext(() => new SectionFiltersComponent());

    expect(component.quickFilterTabs.map(tab => tab.id)).toContain('target');
    expect(component.riskCategories.map(category => category.code)).toContain('R5');
  });

  it('synchronizes filters restored after initial rendering and preserves them on the next edit', async () => {
    const fixture = TestBed.createComponent(SectionFiltersComponent);
    const component = fixture.componentInstance;
    const emitted: SectionFilters[] = [];
    component.filterChange.subscribe(filters => emitted.push(filters));
    await fixture.whenStable();

    const restored: SectionFilters = {
      searchTerm: 'София', activeTab: 'risky', activityOperator: 'gte', lowActivityThreshold: 45,
      sectionTypes: new Set(['Village']), riskFilterType: 'any', selectedRiskCategories: new Set(['R2']),
    };
    fixture.componentRef.setInput('initialFilters', restored);
    await fixture.whenStable();
    expect(component.searchTerm()).toBe('София');
    expect(component.activeTab()).toBe('risky');
    expect(component.lowActivityThreshold()).toBe(45);
    expect(component.sectionTypes()).toEqual(new Set(['Village']));
    expect(component.selectedRiskCategories()).toEqual(new Set(['R2']));

    component.onSearchTermChange('Варна');
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({ ...restored, searchTerm: 'Варна' });
  });

  it('does not re-emit when a parent returns equivalent set values', async () => {
    const fixture = TestBed.createComponent(SectionFiltersComponent);
    const component = fixture.componentInstance;
    const restored: SectionFilters = {
      searchTerm: '', activeTab: 'all', activityOperator: 'lte', lowActivityThreshold: 100,
      sectionTypes: new Set(['City']), riskFilterType: null, selectedRiskCategories: new Set(['R1']),
    };
    let emissions = 0;
    component.filterChange.subscribe(filters => {
      emissions++;
      fixture.componentRef.setInput('initialFilters', {
        ...filters, sectionTypes: new Set(filters.sectionTypes), selectedRiskCategories: new Set(filters.selectedRiskCategories),
      });
    });
    fixture.componentRef.setInput('initialFilters', restored);
    await fixture.whenStable();
    const settled = emissions;
    fixture.componentRef.setInput('initialFilters', { ...restored, sectionTypes: new Set(['City']), selectedRiskCategories: new Set(['R1']) });
    await fixture.whenStable();
    expect(emissions).toBe(settled);
    expect(component.sectionTypes()).toEqual(new Set(['City']));
    expect(component.selectedRiskCategories()).toEqual(new Set(['R1']));
  });
});
