const SVG_STYLE_PROPERTIES = [
  'color', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'font-family', 'font-size',
  'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'visibility',
  'display', 'paint-order', 'clip-path', 'filter', 'mask',
] as const;

/** Makes an inline SVG independent of the page stylesheet and its CSS variables. */
export function cloneSvgForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>('*')];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of SVG_STYLE_PROPERTIES) {
      const value = style.getPropertyValue(property);
      if (value) copies[index].style.setProperty(property,
        value.replace(/url\(["']?[^)"']*#([^)"']+)["']?\)/g, 'url(#$1)'));
    }
  });
  clone.querySelectorAll('.highcharts-tooltip, .highcharts-crosshair, .highcharts-reset-zoom, .highcharts-selection-marker')
    .forEach(element => element.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

function loadSvg(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error('Експортът отне твърде дълго. Опитайте отново.')), 15000);
    image.onload = () => { window.clearTimeout(timeout); resolve(image); };
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Графиката не може да бъде преобразувана в PNG.')); };
    image.src = source;
  });
}

/** Renders the current SVG, including its zoom and selected series, locally as PNG. */
export async function exportSvgImage(svg: SVGSVGElement, background = '#ffffff', caption = ''): Promise<Blob> {
  const { width, height } = svg.getBoundingClientRect();
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Графиката не е видима.');
  }
  const clone = cloneSvgForExport(svg);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadSvg(source);
    const headerHeight = caption ? 44 : 0;
    const scale = Math.min(2, 4096 / Math.max(width, height + headerHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round((height + headerHeight) * scale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Браузърът не поддържа експорт на изображения.');
    drawing.scale(scale, scale);
    drawing.fillStyle = background;
    drawing.fillRect(0, 0, width, height + headerHeight);
    if (caption) {
      drawing.fillStyle = getComputedStyle(document.body).color || '#0f172a';
      drawing.font = '600 15px sans-serif';
      drawing.fillText(caption, 16, 27, Math.max(1, width - 32));
    }
    drawing.drawImage(image, 0, headerHeight, width, height);
    const png = await new Promise<Blob | null>((resolve, reject) => {
      try { canvas.toBlob(resolve, 'image/png'); }
      catch { reject(new Error('Браузърът блокира експорта на изображението.')); }
    });
    if (!png) throw new Error('Изображението не можа да бъде създадено.');
    return png;
  } finally {
    URL.revokeObjectURL(source);
  }
}
