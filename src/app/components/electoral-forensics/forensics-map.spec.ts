import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import * as L from 'leaflet';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsMapComponent } from './forensics-map';

describe('joint map indicators', () => {
  it('shows turnout, voter and both candidate gains in the same section tooltip', () => {
    const component = TestBed.createComponent(ForensicsMapComponent).componentInstance;
    const row = sectionFixture({ registered1: 200, deltaVoted: 40, deltaTurnoutPp: 20,
      candidateChanges: [candidateFixture('4', 10, 30), candidateFixture('25', 20, 50)],
      addedReviewFlags: ['2026.10.25:added_exceed_signed'], candidateReviewFlags: ['joint_turnout_growth_yotova_gain_larger'] });
    expect(component.tooltip(row)).toContain('Δ гласували +40');
    expect(component.tooltip(row)).toContain('Δ Гюров +20');
    expect(component.tooltip(row)).toContain('Δ Йотова +30');
    expect(component.tooltip(row)).toContain('Преглед: дописани, съвместен ръст');
    expect(component.tooltip(row).split('\n')).toEqual([
      row.sectionId, 'Видин / Белоградчик / Рабиша',
      'Δ активност +20,00 п.п.', 'Δ гласували +40', 'Δ Гюров +20', 'Δ Йотова +30',
      'Преглед: дописани, съвместен ръст',
    ]);
    component.metric = 'candidate4';
    expect(component.markerValue(row)).toBe(10);
    component.metric = 'candidate25';
    expect(component.markerValue(row)).toBe(15);
    expect(component.markerValue({ ...row, registered1: 0 })).toBeNull();
  });

  it('omits the review line when a section has no review flags', () => {
    const component = TestBed.createComponent(ForensicsMapComponent).componentInstance;
    const lines = component.tooltip(sectionFixture()).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.every(line => line.length > 0)).toBe(true);
    expect(lines.some(line => line.startsWith('Преглед:'))).toBe(false);
  });

  it('defers fitting new filtered rows while hidden and fits them when the map view returns', () => {
    let resize: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    const fit = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
    vi.spyOn(L.LayerGroup.prototype, 'addLayer').mockReturnThis();
    const fixture = TestBed.createComponent(ForensicsMapComponent);
    let width = 400;
    try {
      const container = (fixture.nativeElement as HTMLElement).querySelector('.research-map')!;
      vi.spyOn(container, 'clientWidth', 'get').mockImplementation(() => width);
      vi.spyOn(container, 'clientHeight', 'get').mockReturnValue(350);
      fixture.componentRef.setInput('rows', [sectionFixture({ latitude: 43, longitude: 25 })]);
      fixture.detectChanges();
      expect(fit).toHaveBeenCalledTimes(1);
      width = 0;
      fixture.componentRef.setInput('rows', [sectionFixture({ latitude: 44, longitude: 26 })]);
      fixture.detectChanges();
      resize();
      expect(fit).toHaveBeenCalledTimes(1);
      width = 400;
      resize();
      expect(fit).toHaveBeenCalledTimes(2);
      expect(fit.mock.calls[1][0]).toEqual(L.latLngBounds([[44, 26]]));
    } finally {
      fixture.destroy();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
