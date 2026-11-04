import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageExportComponent } from '../image-export/image-export';
import { ChartImageExportComponent } from './chart-image-export';

describe('chart PNG export boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires the rendered chart instead of exporting an empty or icon SVG', async () => {
    const fixture = TestBed.createComponent(ChartImageExportComponent);
    fixture.detectChanges();
    await expect(fixture.componentInstance.createImage()).rejects.toThrow('Изчакайте графиката');
    fixture.destroy();
  });

  it('targets the current chart rather than the export icon and retains the scope and filename', async () => {
    const fixture = TestBed.createComponent(ChartImageExportComponent);
    fixture.componentRef.setInput('title', 'Прираст · 2026 · До 400 избиратели · 12 секции');
    fixture.componentRef.setInput('filename', 'section-gains.png');
    fixture.detectChanges();
    const chart = document.createElement('highcharts-chart');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('highcharts-root');
    chart.append(svg);
    fixture.nativeElement.append(chart);
    const readChartBounds = vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect());
    await expect(fixture.componentInstance.createImage()).rejects.toThrow('Графиката не е видима.');
    expect(readChartBounds).toHaveBeenCalledOnce();
    const control = fixture.debugElement.query(By.directive(ImageExportComponent)).componentInstance as ImageExportComponent;
    expect(control.title()).toBe('Прираст · 2026 · До 400 избиратели · 12 секции');
    expect(control.filename()).toBe('section-gains.png');
    fixture.destroy();
  });
});
