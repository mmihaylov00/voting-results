import { Component, Input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { describe, expect, it } from 'vitest';
import { ThemeService } from '../../services/theme.service';
import { FacebookAccountActivityComponent } from './facebook-account-activity';
import { FACEBOOK_COMMENT_BANDS, FACEBOOK_PAGE_BANDS, FacebookActivityCell } from './facebook-participation.util';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

function cells(): FacebookActivityCell[] {
  return FACEBOOK_COMMENT_BANDS.flatMap(commentBand => FACEBOOK_PAGE_BANDS.map(pageBand => ({
    commentBand, pageBand, accounts: commentBand === '1' && pageBand === '1' ? 10
      : commentBand === '3-5' && pageBand === '2' ? 5 : null,
  })));
}

function setup() {
  const darkMode = signal(false);
  TestBed.configureTestingModule({ imports: [FacebookAccountActivityComponent], providers: [
    { provide: ThemeService, useValue: { darkMode } },
  ] }).overrideComponent(FacebookAccountActivityComponent, { remove: { imports: [HighchartsChartComponent] },
    add: { imports: [ChartStub] } });
  const fixture = TestBed.createComponent(FacebookAccountActivityComponent);
  fixture.componentRef.setInput('cells', cells());
  fixture.componentRef.setInput('matchedComments', 45);
  fixture.componentRef.setInput('scaleMax', 10);
  fixture.componentRef.setInput('collectedDate', '05.11.2026');
  fixture.detectChanges();
  return { fixture, darkMode };
}

describe('anonymous account activity chart', () => {
  it('renders the same visible and suppressed groups in a chart and an accessible matrix', () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('table caption')?.textContent).toBe('Брой акаунти');
    expect(element.querySelectorAll('td')).toHaveLength(24);
    expect(element.querySelectorAll('td.suppressed')).toHaveLength(22);
    expect(component.cellCount('3-5', '2')).toBe('5');
    expect(component.cellCount('1', '2')).toBe('-');
    expect(component.cellCount('2', '4+')).toBe('-');
    expect(component.cellCount('3-5', '4+')).toBe('<5');
    expect(component.chartOptions().series![0]).toMatchObject({ type: 'scatter', data: [
      { x: 0, y: 0, custom: { accounts: 10 } }, { x: 1, y: 2, custom: { accounts: 5 } },
    ] });
    expect(component.chartOptions().series![1]).toMatchObject({ enableMouseTracking: false, marker: { enabled: false } });
    expect(element.textContent).not.toContain('акаунт #');
    expect(component.exportTitle()).toContain('Цялата извадка');
    fixture.destroy();
  });

  it('keeps marker areas comparable across Page cohorts, adapts colors and draws actual SVG labels', () => {
    const { fixture, darkMode } = setup();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement.querySelector('highcharts-chart') as HTMLElement;
    const chart = Highcharts.chart(host, { ...component.chartOptions(), chart: {
      ...component.chartOptions().chart, width: 360, height: 390,
    } });
    try {
      expect(chart.series[0].points[0].options.marker?.radius).toBe(24);
      expect(chart.series[0].points[1].options.marker?.radius).toBeCloseTo(24 * Math.sqrt(.5));
      expect(host.querySelector('svg')?.textContent).toContain('<5');
      expect(host.querySelector('svg')?.textContent).toContain('Различни страници на акаунт');
      fixture.componentRef.setInput('cells', cells().map(cell => ({ ...cell, accounts: cell.accounts === 10 ? null : cell.accounts })));
      fixture.componentRef.setInput('pageName', 'Страница Б'); fixture.detectChanges();
      expect(component.chartOptions().series![0]).toMatchObject({ data: [{ marker: { radius: 24 * Math.sqrt(.5) } }] });
      expect(component.exportTitle()).toContain('Страница Б');
      darkMode.set(true); fixture.detectChanges();
      expect(component.chartOptions().series![0]).toMatchObject({ data: [{ marker: { lineColor: '#72c9a6' } }] });
    } finally { chart.destroy(); fixture.destroy(); }
  });

  it('distinguishes no collected comments, legacy exports and suppressed activity', () => {
    const { fixture } = setup();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('pageName', 'Нова страница');
    fixture.componentRef.setInput('matchedComments', 0); fixture.detectChanges();
    expect(element.textContent).toContain('Няма събрани коментари с разпознат идентификатор за тази страница');
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('highcharts-chart')).toBeNull();
    fixture.componentRef.setInput('cells', null); fixture.detectChanges();
    expect(element.textContent).toContain('Обобщението за активността не е налично');
    fixture.componentRef.setInput('cells', cells().map(cell => ({ ...cell, accounts: null })));
    fixture.componentRef.setInput('matchedComments', 4); fixture.detectChanges();
    expect(element.textContent).toContain('Няма групи с поне 5 акаунта');
    expect(element.querySelectorAll('td.suppressed')).toHaveLength(24);
    expect(component.visibleCells()).toHaveLength(0);
    fixture.destroy();
  });
});
