import { SelectComponent } from '../select/select';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import * as L from 'leaflet';
import { SettlementMapDataService } from '../../../services/settlement-map-data.service';
import { ThemeService } from '../../../services/theme.service';
import { SettlementMapComponent } from './settlement-map';
import { MapMetricControlsComponent } from '../map-metric-controls/map-metric-controls';
import { MapMetric } from '../../../utils/map-metric.helper';
import { SettlementAggregate } from '../../../utils/settlement-map.util';

const emptyGeometry = { type: 'FeatureCollection', features: [] };
const locatedSettlement: SettlementAggregate = {
  ekatte: '02676', geometryKey: '02676', geometryRegionCode: 'BLG', regionId: '01',
  cityName: 'Банско', displayName: 'Банско', total: 100, voted: 50, totalElectors: 100,
  discardedVotes: 0, noVotes: 0, totalPaper: 50, totalMachine: 0, riskScore: 0, partyTotals: {},
  sections: [{
    sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище', sectionType: 'normal',
    latitude: 41.84, longitude: 23.49, total: 100, voted: 50, discardedVotes: 0, noVotes: 0,
    topParties: [], partyVotes: {}, activityBp: 5000,
  }],
};

@Component({
  standalone: true,
  imports: [SettlementMapComponent, MapMetricControlsComponent],
  template: `<app-settlement-map [metric]="metric"><app-map-metric-controls [metric]="metric" (metricChange)="metric = $event" /></app-settlement-map>`,
})
class MapToolbarHost {
  metric: MapMetric = 'leading-party';
}

function setup(darkMode = signal(false)) {
  TestBed.configureTestingModule({
    imports: [SettlementMapComponent, MapToolbarHost],
    providers: [
      { provide: ThemeService, useValue: { darkMode } },
      { provide: SettlementMapDataService, useValue: {
        getSettlementsLookup: () => of([{ ekatte: '02676', name: 'Банско', obshtina: 'BLG01' }]),
        getMunicipalitiesLookup: () => of([{ obshtina: 'BLG01', name: 'Банско' }]),
        getSettlementGeometry: () => of(emptyGeometry),
        getSofiaPrecinctGeometry: () => of(emptyGeometry),
        getRegionGeometry: () => of(emptyGeometry),
        getMunicipalityGeometry: () => of(emptyGeometry),
      } },
    ],
  });
  return TestBed.createComponent(SettlementMapComponent);
}

describe('settlement map lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('scans preferences only when their map metric is requested', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    component.settlements = [locatedSettlement];
    const preference = vi.fn(() => ({ candidateId: '101', candidateName: 'Кандидат', partyId: '1', partyName: 'Партия', total: 7 }));
    component['getLeadingPreference'] = preference;
    component['getSectionAggregate'](locatedSettlement.sections[0]);
    component['aggregateAreas'](place => place.regionId);
    expect(preference).not.toHaveBeenCalled();
    component.metric = 'leading-preference';
    expect(component['getSectionAggregate'](locatedSettlement.sections[0]).leadingPreference?.total).toBe(7);
    expect(component['aggregateAreas'](place => place.regionId).get('01')?.leadingPreference?.total).toBe(7);
    expect(preference).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  function sectionRenderFixture() {
    const fixture = setup();
    const component = fixture.componentInstance;
    component['executeRender'] = vi.fn();
    component['fitToCurrentLayer'] = vi.fn();
    fixture.detectChanges();
    const map = component['map']!.setView([41.84, 23.49], 9);
    vi.spyOn(map, 'getRenderer').mockReturnValue(new L.SVG().addTo(map));
    component.view = 'sections';
    component.settlements = [{ ...locatedSettlement, sections: Array.from({ length: 201 }, (_, index) => ({
      ...locatedSettlement.sections[0], sectionId: String(index), longitude: 23.49 + index / 10000,
    })) }];
    return { fixture, component, map, markers: component['sectionMarkers'] };
  }

  it('installs markers in yielding batches and builds accessible tooltips only on demand', async () => {
    vi.useFakeTimers();
    const { fixture, component, map, markers } = sectionRenderFixture();
    const tooltip = component['buildSectionTooltip'] = vi.fn(() => 'Section details');
    let countDuringUiTask = 0;
    setTimeout(() => { countDuringUiTask = markers.size; }, 0);
    const rendering = component['renderSectionMap']();
    expect(markers.size).toBeGreaterThan(0);
    expect(markers.size).toBeLessThan(201);
    const first = markers.values().next().value!;
    expect(map.hasLayer(first)).toBe(true);
    expect(first.getElement()?.getAttribute('tabindex')).toBe('0');
    expect(first.getElement()?.getAttribute('role')).toBe('button');
    expect(tooltip).not.toHaveBeenCalled();
    first.openTooltip();
    expect(tooltip).toHaveBeenCalledOnce();
    component['pendingFocusSectionId'] = '200';
    component['focusPendingSection']();
    expect(component['pendingFocusSectionId']).toBe('200');
    await vi.runAllTimersAsync();
    await rendering;
    expect(countDuringUiTask).toBeGreaterThan(0);
    expect(countDuringUiTask).toBeLessThan(201);
    expect(markers.size).toBe(201);
    component['focusPendingSection']();
    expect(component['pendingFocusSectionId']).toBeNull();
    fixture.destroy();
  });

  it('stops obsolete marker batches on redraw and destruction', async () => {
    vi.useFakeTimers();
    const { fixture, component, map, markers } = sectionRenderFixture();
    const rendering = component['renderSectionMap']();
    const count = markers.size;
    component['hasFitted'] = false;
    const fit = vi.spyOn(map, 'fitBounds');
    SettlementMapComponent.prototype['fitToCurrentLayer'].call(component);
    component['renderMap']();
    await vi.runAllTimersAsync();
    await rendering;
    expect(markers.size).toBe(count);
    expect(fit).not.toHaveBeenCalled();
    const destroyedRender = component['renderSectionMap']();
    const countAtDestroy = markers.size;
    fixture.destroy();
    await vi.runAllTimersAsync();
    await destroyedRender;
    expect(markers.size).toBe(countAtDestroy);
  });

  it('orders the geographic tabs and applies requested views without echoing them back', () => {
    const fixture = setup();
    fixture.componentRef.setInput('showViewTabs', true);
    fixture.componentRef.setInput('settlements', [locatedSettlement]);
    fixture.componentRef.setInput('selectedView', 'regions');
    const viewChange = vi.fn();
    fixture.componentInstance.viewChange.subscribe(viewChange);
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('[aria-label="Географско ниво"] button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Райони', 'Общини', 'Населени места', 'Квартали', 'Секции']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    fixture.componentRef.setInput('selectedView', 'municipalities');
    fixture.detectChanges();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(viewChange).not.toHaveBeenCalled();
    buttons[2].click();
    fixture.detectChanges();
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(viewChange).toHaveBeenCalledExactlyOnceWith('cities');
    fixture.destroy();
  });

  it('restores a requested section view when coordinates arrive after the map', () => {
    const fixture = setup();
    fixture.componentRef.setInput('selectedView', 'sections');
    fixture.detectChanges();
    expect(fixture.componentInstance.view).toBe('cities');
    fixture.componentRef.setInput('settlements', [locatedSettlement]);
    fixture.detectChanges();
    expect(fixture.componentInstance.view).toBe('sections');
    fixture.destroy();
  });

  it('projects the indicator selector beside geographic search and forwards its changes', () => {
    setup().destroy();
    const fixture = TestBed.createComponent(MapToolbarHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const search = element.querySelector('app-map-tools');
    const controls = element.querySelector('app-map-metric-controls');
    expect(controls?.parentElement).toBe(search?.parentElement);
    const select = fixture.debugElement.query(By.directive(SelectComponent)).componentInstance as SelectComponent;
    select.valueChange.emit('activity');
    fixture.detectChanges();
    expect(fixture.componentInstance.metric).toBe('activity');
    expect(select.value()).toBe('activity');
    fixture.destroy();
  });

  it('accepts synchronous cached lookup data before checking its search controls', () => {
    const fixture = setup();
    fixture.componentRef.setInput('settlements', [{
      ekatte: '02676', geometryKey: '02676', geometryRegionCode: 'BLG', regionId: '01',
      cityName: 'Банско', displayName: 'Банско', sections: [], total: 0, voted: 0, totalElectors: 0,
      discardedVotes: 0, noVotes: 0, totalPaper: 0, totalMachine: 0, riskScore: 0, partyTotals: {},
    }]);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(() => fixture.checkNoChanges()).not.toThrow();
    expect(fixture.componentInstance.searchItems.some(item => item.kind === 'municipality' && item.label.includes('Банско'))).toBe(true);
    fixture.destroy();
  });

  it('cancels tooltip cleanup when its map is destroyed', () => {
    vi.useFakeTimers();
    const fixture = setup();
    fixture.detectChanges();
    const map = fixture.componentInstance['map']!;
    const eachLayer = vi.spyOn(map, 'eachLayer');
    map.fire('move');
    fixture.destroy();
    eachLayer.mockClear();
    expect(() => vi.advanceTimersByTime(101)).not.toThrow();
    expect(eachLayer).not.toHaveBeenCalled();
  });

  it('redraws changed metrics without redrawing for export and toolbar changes', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const render = vi.fn();
    fixture.componentInstance['executeRender'] = render;
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    render.mockClear();
    const searchItems = fixture.componentInstance.searchItems;

    fixture.componentRef.setInput('exportContext', { election: 'Април 2026', place: 'България' });
    fixture.componentRef.setInput('showWorldButton', true);
    fixture.componentRef.setInput('showViewTabs', true);
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    expect(render).not.toHaveBeenCalled();
    expect(fixture.componentInstance.searchItems).toBe(searchItems);

    fixture.componentRef.setInput('metric', 'activity');
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    expect(render).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.searchItems).toBe(searchItems);
    fixture.destroy();
  });

  it('repaints theme changes without rebuilding the search data', () => {
    vi.useFakeTimers();
    const darkMode = signal(false);
    const fixture = setup(darkMode);
    const render = vi.fn();
    fixture.componentInstance['executeRender'] = render;
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    render.mockClear();
    const searchItems = fixture.componentInstance.searchItems;

    darkMode.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    expect(render).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.searchItems).toBe(searchItems);
    fixture.destroy();
  });

  it('moves the focused marker highlight without redrawing the map', () => {
    vi.useFakeTimers();
    const fixture = setup();
    const component = fixture.componentInstance;
    const render = vi.fn();
    component['executeRender'] = render;
    const first = locatedSettlement.sections[0];
    const second = { ...first, sectionId: '010100002', longitude: 23.5 };
    fixture.componentRef.setInput('settlements', [{ ...locatedSettlement, sections: [first, second] }]);
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    render.mockClear();
    component.view = 'sections';
    const firstMarker = L.circleMarker([41.84, 23.49]);
    const secondMarker = L.circleMarker([41.84, 23.5]);
    component['sectionMarkers'].set(first.sectionId, firstMarker);
    component['sectionMarkers'].set(second.sectionId, secondMarker);
    const closeTooltip = vi.spyOn(firstMarker, 'closeTooltip');

    fixture.componentRef.setInput('focusSectionId', first.sectionId);
    fixture.detectChanges();
    expect(firstMarker.options.color).toBe('#f59e0b');
    fixture.componentRef.setInput('focusSectionId', second.sectionId);
    fixture.detectChanges();
    vi.advanceTimersByTime(20);
    expect(firstMarker.options.color).toBe('#fff');
    expect(firstMarker.options.weight).toBe(0.8);
    expect(closeTooltip).toHaveBeenCalledOnce();
    expect(secondMarker.options.color).toBe('#f59e0b');
    expect(secondMarker.options.weight).toBe(3);
    expect(render).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
