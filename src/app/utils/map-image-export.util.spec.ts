// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportMapImage, mapExportTitle } from './map-image-export.util';
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
});
