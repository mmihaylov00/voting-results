import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import * as L from 'leaflet';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsMapComponent } from './forensics-map';
import { ImageExportComponent } from '../ui/image-export/image-export';

function mockMapPng(container: HTMLElement) {
  const rect = new DOMRect(0, 0, 400, 350);
  const tile = document.createElement('img');
  tile.className = 'leaflet-tile';
  tile.crossOrigin = 'anonymous';
  container.append(tile);
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(tile, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(tile, 'naturalWidth', 'get').mockReturnValue(256);
  const drawing = {
    scale: vi.fn(), fillRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    drawImage: vi.fn(), restore: vi.fn(), fillText: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
  const png = new Blob(['png'], { type: 'image/png' });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(png));
  return { drawing, png };
}

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

  it('offers the shared PNG preview using the current metric, filtered section count and legend', async () => {
    let paint: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { paint = callback; return 1; });
    vi.spyOn(ForensicsMapComponent.prototype, 'ngAfterViewInit').mockImplementation(() => {});
    const fixture = TestBed.createComponent(ForensicsMapComponent);
    try {
      fixture.componentRef.setInput('rows', [sectionFixture({ latitude: 43, longitude: 25 }), sectionFixture()]);
      fixture.componentRef.setInput('exportTitle', 'До 400 избиратели · Видин');
      fixture.componentInstance.metric = 'candidate25';
      fixture.detectChanges();
      const { png, drawing } = mockMapPng(fixture.componentInstance.container.nativeElement);
      const exporter = fixture.debugElement.query(By.directive(ImageExportComponent)).componentInstance as ImageExportComponent;
      expect(exporter.filename()).toBe('presidential-2026-section-map.png');
      expect((fixture.nativeElement as HTMLElement).querySelector('.map-toolbar app-image-export')).not.toBeNull();
      const pending = exporter.createImage()();
      expect(drawing.drawImage).not.toHaveBeenCalled();
      paint(0);
      await expect(pending).resolves.toBe(png);
      expect(drawing.fillText).toHaveBeenCalledWith('Президентски избори 2026 · 25 октомври → 1 ноември', 16, 28, 368);
      expect(drawing.fillText).toHaveBeenCalledWith('Δ Йотова на 100 избиратели I тур', 16, 53, 368);
      expect(drawing.fillText).toHaveBeenCalledWith('До 400 избиратели · Видин · 1 от 2 секции с координати', 16, 78, 368);
      expect(drawing.fillText.mock.calls.filter(call => call[0] === 'Няма данни')).toHaveLength(1);
    } finally {
      fixture.destroy();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('refuses an export until every section-marker batch is rendered', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
    vi.spyOn(L.LayerGroup.prototype, 'addLayer').mockReturnThis();
    const addLayer = vi.spyOn(L.Map.prototype, 'addLayer');
    const fixture = TestBed.createComponent(ForensicsMapComponent);
    try {
      const container = (fixture.nativeElement as HTMLElement).querySelector('.research-map')!;
      vi.spyOn(container, 'clientWidth', 'get').mockReturnValue(400);
      vi.spyOn(container, 'clientHeight', 'get').mockReturnValue(350);
      fixture.componentRef.setInput('rows', Array.from({ length: 101 }, (_, index) => sectionFixture({ sectionId: String(index), latitude: 43, longitude: 25 })));
      fixture.detectChanges();
      expect(addLayer.mock.calls.some(([layer]) => layer instanceof L.TileLayer && layer.options.crossOrigin === 'anonymous')).toBe(true);
      await expect(fixture.componentInstance.createImage()).rejects.toThrow('Изчакайте секциите');
      frames.at(-1)!(0);
      const { png, drawing } = mockMapPng(container as HTMLElement);
      const pending = fixture.componentInstance.createImage();
      expect(drawing.drawImage).not.toHaveBeenCalled();
      frames.at(-1)!(0);
      await expect(pending).resolves.toBe(png);
      const painted = drawing.drawImage.mock.calls.length;
      const obsolete = fixture.componentInstance.createImage();
      const finishObsolete = frames.at(-1)!;
      fixture.componentRef.setInput('rows', [sectionFixture({ latitude: 44, longitude: 26 })]);
      fixture.detectChanges();
      finishObsolete(0);
      await expect(obsolete).rejects.toThrow('Картата се промени');
      expect(drawing.drawImage).toHaveBeenCalledTimes(painted);
    } finally {
      fixture.destroy();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
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
