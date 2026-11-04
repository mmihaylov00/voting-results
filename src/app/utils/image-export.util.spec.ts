import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneSvgForExport, exportSvgImage } from './image-export.util';

describe('SVG PNG rendering', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function svg(width = 800, height = 400): SVGSVGElement {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, height));
    return element;
  }

  function mockRendering(failImage = false) {
    const png = new Blob(['png'], { type: 'image/png' });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg-source');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_source: string) { queueMicrotask(() => failImage ? this.onerror?.() : this.onload?.()); }
    });
    const drawing = { scale: vi.fn(), fillStyle: '', font: '', fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing as unknown as CanvasRenderingContext2D);
    const sizes: number[][] = [];
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) {
      sizes.push([this.width, this.height]); callback(png);
    });
    return { png, create, revoke, drawing, sizes, toBlob };
  }

  it('inlines resolved theme styles and local clip references while retaining transforms and hiding transient UI', () => {
    const source = svg();
    source.innerHTML = '<defs><clipPath id="zoom"><rect width="80" height="40"/></clipPath></defs><g transform="translate(10 20)"><text>Йотова</text></g><g class="highcharts-tooltip"><text>Hover only</text></g><g class="highcharts-reset-zoom"/>';
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: (property: string) => ({
      fill: 'rgb(248, 250, 252)', stroke: 'rgb(3, 105, 161)', 'font-family': 'Arial',
      'font-size': '13px', 'clip-path': 'url("https://example.test/research#zoom")',
    })[property] ?? '' }) as CSSStyleDeclaration);
    const clone = cloneSvgForExport(source);
    expect(clone.querySelector('text')?.style.fill).toBe('rgb(248, 250, 252)');
    expect(clone.querySelector('g')?.style.clipPath).toMatch(/^url\(["']?#zoom["']?\)$/);
    expect(clone.querySelector('g')?.getAttribute('transform')).toBe('translate(10 20)');
    expect(clone.querySelector('.highcharts-tooltip')).toBeNull();
    expect(clone.querySelector('.highcharts-reset-zoom')).toBeNull();
    expect(source.querySelector('.highcharts-tooltip')).not.toBeNull();
  });

  it('rejects hidden or invalid SVG dimensions before generating an image', async () => {
    const { create } = mockRendering();
    await expect(exportSvgImage(svg(0, 100))).rejects.toThrow('Графиката не е видима');
    await expect(exportSvgImage(svg(Number.NaN, 100))).rejects.toThrow('Графиката не е видима');
    expect(create).not.toHaveBeenCalled();
  });

  it('adds export context, draws the current SVG and returns a PNG instead of downloading it', async () => {
    const { png, drawing, sizes, revoke } = mockRendering();
    expect(await exportSvgImage(svg(), '#020817', 'Президентски избори 2026 · До 400 избиратели')).toBe(png);
    expect(drawing.scale).toHaveBeenCalledWith(2, 2);
    expect(sizes).toEqual([[1600, 888]]);
    expect(drawing.fillText).toHaveBeenCalledWith('Президентски избори 2026 · До 400 избиратели', 16, 27, 768);
    expect(drawing.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 44, 800, 400);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:svg-source');
  });

  it('limits both output dimensions to 4096 pixels', async () => {
    const { sizes } = mockRendering();
    await exportSvgImage(svg(7000, 5000));
    expect(sizes[0][0]).toBe(4096);
    expect(sizes[0][1]).toBeLessThanOrEqual(4096);
  });

  it('uses the page foreground for a readable caption on a dark background', async () => {
    const { drawing } = mockRendering();
    const originalStyle = getComputedStyle;
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => element === document.body
      ? { color: 'rgb(248, 250, 252)' } as CSSStyleDeclaration : originalStyle(element));
    drawing.fillText.mockImplementation(() => { expect(drawing.fillStyle).toBe('rgb(248, 250, 252)'); });
    await exportSvgImage(svg(), '#020817', 'Прираст по секции');
    expect(drawing.fillText).toHaveBeenCalledOnce();
  });

  it('releases its temporary SVG URL after image or PNG conversion fails', async () => {
    const { revoke } = mockRendering(true);
    await expect(exportSvgImage(svg())).rejects.toThrow('Графиката не може');
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:svg-source');
  });

  it('reports an empty canvas result instead of offering a broken PNG', async () => {
    const { toBlob, revoke } = mockRendering();
    toBlob.mockImplementation(callback => callback(null));
    await expect(exportSvgImage(svg())).rejects.toThrow('Изображението не можа');
    expect(revoke).toHaveBeenCalledOnce();
  });
});
