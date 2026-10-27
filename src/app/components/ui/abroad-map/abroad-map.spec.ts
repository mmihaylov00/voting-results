import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { Section } from '../../../models/election.models';
import { SettlementMapDataService } from '../../../services/settlement-map-data.service';
import { ThemeService } from '../../../services/theme.service';
import { AbroadMapComponent } from './abroad-map';

const sections: Section[] = [{
  sectionId: '320100001', regionId: '32', cityName: 'Германия, Берлин', sectionName: 'Училище',
  sectionType: 'abroad', total: 100, voted: 80, discardedVotes: 0, noVotes: 0, activityBp: 8000,
  topParties: [], partyVotes: {
    '1': { total: 60, paper: 60, machine: 0 },
    '2': { total: 20, paper: 20, machine: 0 },
  },
}];

let fixture: ComponentFixture<AbroadMapComponent>;

function setup() {
  const darkMode = signal(false);
  const frames: FrameRequestCallback[] = [];
  let nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return ++nextFrame;
  });
  const flushFrames = () => {
    while (frames.length) frames.shift()!(0);
  };
  TestBed.configureTestingModule({
    imports: [AbroadMapComponent],
    providers: [
      { provide: ThemeService, useValue: { darkMode } },
      { provide: SettlementMapDataService, useValue: {
        getAbroadCountryManifest: () => of([{ name: 'Германия', code: 'DE', capitalLocation: null }]),
        getAbroadCountryGeometry: () => of({ type: 'FeatureCollection', features: [] }),
      } },
    ],
  });
  TestBed.overrideComponent(AbroadMapComponent, { set: { template: '<div #mapContainer></div>' } });
  fixture = TestBed.createComponent(AbroadMapComponent);
  const component = fixture.componentInstance;
  const renderMap = vi.spyOn(component as unknown as { renderMap(): void }, 'renderMap');
  const executeRender = vi.spyOn(component as unknown as { executeRender(): void }, 'executeRender');
  fixture.componentRef.setInput('sections', sections);
  fixture.componentRef.setInput('partiesById', { '1': 'Партия 1', '2': 'Партия 2' });
  fixture.detectChanges();
  flushFrames();
  renderMap.mockClear();
  executeRender.mockClear();
  return { component, darkMode, renderMap, executeRender, flushFrames };
}

describe('abroad map reactive updates', () => {
  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('repaints party and metric changes without rebuilding cities or search items', () => {
    const { component, executeRender, flushFrames } = setup();
    const cities = component.cities;
    const searchItems = component.searchItems;
    expect(cities).toHaveLength(1);
    expect(searchItems.some(item => item.label.includes('Берлин'))).toBe(true);

    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.detectChanges();
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
    flushFrames();
    expect(executeRender).toHaveBeenCalledOnce();
    executeRender.mockClear();

    fixture.componentRef.setInput('metric', 'activity');
    fixture.detectChanges();
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
    flushFrames();
    expect(executeRender).toHaveBeenCalledOnce();
    executeRender.mockClear();

    fixture.componentRef.setInput('belowThresholdPartyIds', new Set(['2']));
    fixture.detectChanges();
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
    flushFrames();
    expect(executeRender).toHaveBeenCalledOnce();
  });

  it('schedules rendering when loading finishes without reaggregating the data', () => {
    const { component, executeRender, flushFrames } = setup();
    const cities = component.cities;
    const searchItems = component.searchItems;
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    flushFrames();
    expect(executeRender).not.toHaveBeenCalled();

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    flushFrames();
    expect(executeRender).toHaveBeenCalledOnce();
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
  });

  it('repaints theme changes without rebuilding cities or search items', () => {
    const { component, darkMode, executeRender, flushFrames } = setup();
    const cities = component.cities;
    const searchItems = component.searchItems;
    darkMode.set(true);
    fixture.detectChanges();
    flushFrames();
    expect(executeRender).toHaveBeenCalledOnce();
    expect(component['isDark']).toBe(true);
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
  });

  it('does not redraw for export metadata or an inactive comparison party', () => {
    const { component, renderMap, executeRender, flushFrames } = setup();
    const cities = component.cities;
    const searchItems = component.searchItems;
    fixture.componentRef.setInput('exportContext', { election: 'Избори 2026', place: 'Берлин' });
    fixture.componentRef.setInput('comparisonPartyId', '2');
    fixture.detectChanges();
    flushFrames();
    expect(renderMap).not.toHaveBeenCalled();
    expect(executeRender).not.toHaveBeenCalled();
    expect(component.cities).toBe(cities);
    expect(component.searchItems).toBe(searchItems);
  });

  it('reaggregates party comparisons only while a comparison dataset is active', () => {
    const { component, flushFrames } = setup();
    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.componentRef.setInput('comparisonPartyId', '1');
    fixture.componentRef.setInput('comparisonSections', sections);
    fixture.detectChanges();
    expect(component.cities[0].partyChangePp).toBe(0);
    const comparisonCities = component.cities;
    flushFrames();

    fixture.componentRef.setInput('selectedPartyId', '2');
    fixture.detectChanges();
    expect(component.cities).not.toBe(comparisonCities);
    expect(component.cities[0].partyChangePp).toBe(-50);
    flushFrames();

    fixture.componentRef.setInput('comparisonSections', null);
    fixture.detectChanges();
    const cities = component.cities;
    flushFrames();
    fixture.componentRef.setInput('comparisonPartyId', '2');
    fixture.detectChanges();
    expect(component.cities).toBe(cities);
  });
});
