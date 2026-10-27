import { MapExportContext } from './map-interaction.util';
import type { MapLegend } from './map-metric.helper';

export function mapExportTitle(context: MapExportContext | null, legend: MapLegend, place: string): string[] {
  return [context?.election || 'Изборни резултати', context?.metricLabel || legend.title, context?.place || place];
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timeout = window.setTimeout(() => reject(new Error('Картата не се зареди навреме. Опитайте отново.')), 15000);
    image.onload = () => { window.clearTimeout(timeout); resolve(image); };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Изображенията на картата не разрешават експорт. Опитайте отново след зареждането им.'));
    };
    image.src = source;
  });
}

/** Exports the visible Leaflet tiles and SVG overlays, without sending election data to a service. */
export async function exportMapImage(
  container: HTMLElement,
  context: MapExportContext | null,
  legend: MapLegend,
  place: string,
): Promise<void> {
  const bounds = container.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('Картата не е видима.');
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  const headerHeight = 104;
  const legendColumns = Math.max(1, Math.floor(width / 220));
  const legendItems = [...legend.items, { label: 'Няма данни', color: legend.noDataColor }];
  const footerHeight = 84 + Math.ceil(legendItems.length / legendColumns) * 24;
  const scale = Math.min(2, 4096 / Math.max(width, height + headerHeight + footerHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((height + headerHeight + footerHeight) * scale);
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Браузърът не поддържа експорт на изображения.');
  drawing.scale(scale, scale);
  drawing.fillStyle = '#ffffff';
  drawing.fillRect(0, 0, width, height + headerHeight + footerHeight);
  drawing.save();
  drawing.beginPath();
  drawing.rect(0, headerHeight, width, height);
  drawing.clip();

  const tiles = Array.from(container.querySelectorAll<HTMLImageElement>('.leaflet-tile'));
  if (!tiles.length) throw new Error('Изчакайте картата да се зареди преди експорт.');
  for (const tile of tiles) {
    const rect = tile.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= bounds.left || rect.left >= bounds.right ||
        rect.bottom <= bounds.top || rect.top >= bounds.bottom || getComputedStyle(tile).visibility === 'hidden') continue;
    if (!tile.complete || !tile.naturalWidth) throw new Error('Изчакайте картата да се зареди преди експорт.');
    const image = tile.crossOrigin === 'anonymous' ? tile : await loadImage(tile.currentSrc || tile.src);
    drawing.drawImage(image, rect.left - bounds.left, rect.top - bounds.top + headerHeight, rect.width, rect.height);
  }

  for (const svg of Array.from(container.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane svg'))) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(rect.width));
    clone.setAttribute('height', String(rect.height));
    clone.style.transform = '';
    clone.style.position = 'static';
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const source = URL.createObjectURL(blob);
    try {
      const image = await loadImage(source);
      drawing.drawImage(image, rect.left - bounds.left, rect.top - bounds.top + headerHeight, rect.width, rect.height);
    } finally {
      URL.revokeObjectURL(source);
    }
  }

  for (const marker of Array.from(container.querySelectorAll<HTMLElement>('.leaflet-marker-icon'))) {
    const label = marker.firstElementChild as HTMLElement | null;
    if (!label?.textContent) continue;
    const rect = label.getBoundingClientRect();
    const style = getComputedStyle(label);
    drawing.font = `${style.fontWeight} ${style.fontSize} sans-serif`;
    drawing.textAlign = 'center';
    drawing.strokeStyle = '#fff';
    drawing.lineWidth = 3;
    drawing.strokeText(label.textContent, rect.left - bounds.left + rect.width / 2, rect.top - bounds.top + headerHeight + 12, rect.width);
    drawing.fillStyle = '#0f172a';
    drawing.fillText(label.textContent, rect.left - bounds.left + rect.width / 2, rect.top - bounds.top + headerHeight + 12, rect.width);
  }
  drawing.restore();
  drawing.textAlign = 'left';
  drawing.fillStyle = '#0f172a';
  mapExportTitle(context, legend, place).forEach((line, index) => {
    drawing.font = `${index === 0 ? '600 20' : '14'}px sans-serif`;
    drawing.fillText(line, 16, 28 + index * 25, Math.max(1, width - 32));
  });
  legendItems.forEach((item, index) => {
    const x = 16 + index % legendColumns * (width / legendColumns);
    const y = headerHeight + height + 14 + Math.floor(index / legendColumns) * 24;
    drawing.fillStyle = item.color;
    drawing.globalAlpha = item.opacity ?? 1;
    drawing.fillRect(x, y, 12, 12);
    drawing.globalAlpha = 1;
    drawing.fillStyle = '#0f172a';
    drawing.font = '12px sans-serif';
    drawing.fillText(item.label, x + 18, y + 11, width / legendColumns - 30);
  });
  drawing.fillStyle = '#475569';
  drawing.font = '11px sans-serif';
  drawing.fillText(legend.description, 16, height + headerHeight + footerHeight - 38, width - 32);
  drawing.fillText('© OpenStreetMap contributors · openstreetmap.org/copyright', 16, height + headerHeight + footerHeight - 16, width - 32);

  let png: Blob | null;
  try {
    png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  } catch {
    throw new Error('Браузърът блокира експорта на фоновата карта. Опитайте отново след презареждане.');
  }
  if (!png) throw new Error('Изображението не можа да бъде създадено.');
  const url = URL.createObjectURL(png);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'election-map.png';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function toggleMapFullscreen(element: HTMLElement): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (element.requestFullscreen) {
    await element.requestFullscreen();
  } else {
    throw new Error('Този браузър не поддържа режим на цял екран.');
  }
}
