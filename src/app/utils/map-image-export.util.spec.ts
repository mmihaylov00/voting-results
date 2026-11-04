// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMapImage, exportMapImage, mapExportTitle } from './map-image-export.util';
import type { MapLegend } from './map-metric.helper';

const legend: MapLegend = { title: 'Активност', description: 'Дял от избирателите', items: [], noDataColor: '#ccc' };

describe('map image export', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps election, metric and geography context in the exported title', () => {
    expect(mapExportTitle({ election: '27.10.2024', metricLabel: 'Промяна за партия', place: 'София' }, legend, 'България'))
      .toEqual(['27.10.2024', 'Промяна за партия', 'София']);
    expect(mapExportTitle(null, legend, 'България')).toEqual(['Изборни резултати', 'Активност', 'България']);
  });

  it('rejects hidden maps before attempting a download', async () => {
    await expect(exportMapImage(document.createElement('div'), null, legend, 'България'))
      .rejects.toThrow('Картата не е видима');
  });

  it('refuses incomplete map tiles instead of exporting a misleading blank basemap', async () => {
    const container = document.createElement('div');
    const tile = document.createElement('img');
    tile.className = 'leaflet-tile';
    container.append(tile);
    const rect = { width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200 } as DOMRect;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(), fillRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    await expect(exportMapImage(container, null, legend, 'България')).rejects.toThrow('Изчакайте картата');
  });

  it('renders the current Canvas section overlays into a PNG without starting a download', async () => {
    const container = document.createElement('div');
    const tile = document.createElement('img');
    tile.className = 'leaflet-tile';
    tile.crossOrigin = 'anonymous';
    const pane = document.createElement('div');
    pane.className = 'leaflet-overlay-pane';
    const markers = document.createElement('canvas');
    pane.append(markers);
    container.append(tile, pane);
    const rect = new DOMRect(20, 30, 300, 200);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(markers, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 280, 180));
    vi.spyOn(tile, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(tile, 'naturalWidth', 'get').mockReturnValue(256);
    const drawing = {
      scale: vi.fn(), fillRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      drawImage: vi.fn(), restore: vi.fn(), fillText: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
    const png = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(png));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await expect(createMapImage(container, { election: '2026', metricLabel: 'Δ активност', place: '2 секции' }, legend, 'България')).resolves.toBe(png);
    expect(drawing.drawImage).toHaveBeenCalledWith(tile, 0, 104, 300, 200);
    expect(drawing.drawImage).toHaveBeenCalledWith(markers, 10, 114, 280, 180);
    expect(drawing.fillText).toHaveBeenCalledWith('2 секции', 16, 78, 268);
    expect(drawing.fillText.mock.calls.some(call => call[0].includes('OpenStreetMap'))).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects a viewport with no visible loaded tiles', async () => {
    const container = document.createElement('div');
    const tile = document.createElement('img');
    tile.className = 'leaflet-tile';
    container.append(tile);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 300, 200, 200));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(), fillRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    await expect(createMapImage(container, null, legend, 'България')).rejects.toThrow('Изчакайте картата');
  });
});
