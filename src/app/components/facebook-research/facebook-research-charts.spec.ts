import { Component, Input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { ThemeService } from '../../services/theme.service';
import { FacebookResearchChartsComponent } from './facebook-research-charts';
import { FacebookPost, FacebookReport, FacebookTone } from './facebook-research.models';
import { facebookPageSummaries } from './facebook-research.util';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

function chartFixture(report = snapshot as FacebookReport) {
  const darkMode = signal(false);
  TestBed.configureTestingModule({ imports: [FacebookResearchChartsComponent], providers: [{ provide: ThemeService, useValue: { darkMode } }] });
  TestBed.overrideComponent(FacebookResearchChartsComponent, { remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] } });
  const fixture = TestBed.createComponent(FacebookResearchChartsComponent);
  fixture.componentRef.setInput('pages', facebookPageSummaries(report));
  fixture.componentRef.setInput('posts', report.posts);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, darkMode };
}

function toneFixture(): FacebookReport {
  const report = structuredClone(snapshot as FacebookReport);
  delete report.directory;
  report.pages = ['balanced', 'smaller', 'missing', 'zero', 'other'].map(id => {
    const page = { ...structuredClone(report.pages[0]), id, name: id, url: `https://www.facebook.com/${id}` };
    delete page.avatar;
    return page;
  });
  const source = structuredClone(report.posts[0]);
  const counter = (value: number | null, approximate = false) => ({ value,
    approximate: value === null ? null : approximate, raw: value === null ? null : String(value) });
  const post = (id: string, pageId: string, gyurov: FacebookTone | null | undefined,
    yotova: FacebookTone | null, shares: number | null, approximate = false): FacebookPost => {
    const row = { ...structuredClone(source), id, pageId, url: `https://www.facebook.com/${pageId}/posts/${id}`,
      excerpt: id, summary: id, images: [], keywords: [], metrics: {
        shares: counter(shares, approximate), reactions: counter(shares === null ? null : shares * 2),
        comments: counter(shares === null ? null : shares + 1),
      } };
    if (gyurov === undefined) delete row.stance;
    else row.stance = { gyurov, yotova, reason: 'Оценка на надписа', sourceTextSha256: row.sourceTextSha256 };
    return row;
  };
  report.posts = [
    post('balanced-support', 'balanced', 'supportive', null, 100, true),
    post('balanced-critical', 'balanced', 'critical', 'supportive', 100),
    post('smaller-support', 'smaller', 'supportive', 'critical', 20),
    post('smaller-critical', 'smaller', 'critical', null, null),
    post('missing-critical', 'missing', 'critical', null, null),
    post('zero-critical', 'zero', 'critical', 'neutral', 0),
    post('other-neutral', 'other', 'neutral', 'supportive', 10_000),
    post('other-mixed', 'other', 'mixed', null, 10_000),
    post('other-unclear', 'other', 'unclear', null, 10_000),
    post('other-unmentioned', 'other', null, null, 10_000),
    post('other-unreviewed', 'other', undefined, null, 10_000),
  ];
  report.matches = [];
  report.reviews = [];
  report.coverage = [];
  report.collectionPostCount = report.posts.filter(row => row.origin === 'collection').length;
  return report;
}

describe('Facebook research charts', () => {
  it('retains missing and approximate counters, limits dates to known days, and links bars to posts', () => {
    const report = snapshot as FacebookReport;
    const pages = facebookPageSummaries(report);
    const { fixture, component, darkMode } = chartFixture(report);
    const bars = component.pageChart().series![0] as Highcharts.SeriesBarOptions;
    const points = bars.data as Highcharts.PointOptionsObject[];
    expect(points).toHaveLength(report.pages.length);
    expect(points.some(point => point.y === null)).toBe(true);
    component.metric.set('reactions');
    const reactions = component.pageChart().series![0] as Highcharts.SeriesBarOptions;
    expect((reactions.data as Highcharts.PointOptionsObject[]).some(point => point.custom?.['display'].startsWith('≈'))).toBe(true);
    const datedPosts = report.posts.filter(post => post.date).length;
    expect(component.datedPosts()).toBe(datedPosts);
    expect(component.intervalPosts()).toBe(report.posts.length - datedPosts);
    const timeline = component.timelineChart().series![0] as Highcharts.SeriesColumnOptions;
    expect((timeline.data as number[]).reduce((sum, count) => sum + count, 0)).toBe(datedPosts);
    const selection = vi.fn();
    component.pageSelect.subscribe(selection);
    component.pageChart().plotOptions!.series!.point!.events!.click!.call({ index: 0 } as Highcharts.Point, {} as Highcharts.PointClickEventObject);
    expect(selection).toHaveBeenCalledWith([...pages].sort((a, b) => (b.totals.reactions.value ?? -1) - (a.totals.reactions.value ?? -1))[0].id);
    darkMode.set(true);
    expect((component.pageChart().series![0] as Highcharts.SeriesBarOptions).color).toBe('#e7ba50');
    expect((fixture.nativeElement as HTMLElement).querySelector('dl[aria-label]')).not.toBeNull();
    fixture.destroy();
  });

  it('groups engagement by individual candidate assessments and sorts by activity rather than net balance', () => {
    const { fixture, component } = chartFixture(toneFixture());
    const rows = component.toneRows();
    expect(rows.map(row => row.id)).toEqual(['balanced', 'smaller', 'missing', 'zero']);
    expect(rows[0].supportive).toEqual({ value: 100, approximate: true, missing: 0 });
    expect(rows[0].critical).toEqual({ value: 100, approximate: false, missing: 0 });
    expect(rows[0].supportivePosts).toBe(1);
    expect(rows[0].criticalPosts).toBe(1);
    expect(rows[1].critical).toEqual({ value: null, approximate: false, missing: 1 });
    expect(rows[2].supportive).toEqual({ value: 0, approximate: false, missing: 0 });
    expect(rows[2].critical.value).toBeNull();
    expect(rows[3].critical.value).toBe(0);
    expect(component.tonePostCount()).toBe(6);
    expect(component.toneMissingCount()).toBe(2);
    expect(component.excludedTonePosts()).toBe(5);
    component.metric.set('reactions');
    expect(component.toneRows()[0].supportive.value).toBe(200);
    component.metric.set('shares');
    component.setCandidate('yotova');
    expect(component.toneRows().map(row => row.id)).toEqual(['other', 'balanced', 'smaller']);
    expect(component.toneRows()[1].supportive.value).toBe(100);
    expect(component.toneRows()[1].critical.value).toBe(0);
    expect(component.tonePostCount()).toBe(3);
    expect(component.excludedTonePosts()).toBe(8);
    component.setCandidate('unknown');
    expect(component.candidate()).toBe('yotova');
    fixture.destroy();
  });

  it('plots criticism to the left without turning missing counters into zero or displaying negative engagement amounts', () => {
    const { fixture, component } = chartFixture(toneFixture());
    component.view.set('tone');
    fixture.detectChanges();
    const options = component.toneChart();
    const series = options.series as Highcharts.SeriesBarOptions[];
    const supportive = series.find(row => row.name === 'Подкрепящи публикации')!;
    const critical = series.find(row => row.name === 'Критични публикации')!;
    const supportPoints = supportive.data as Highcharts.PointOptionsObject[];
    const criticalPoints = critical.data as Highcharts.PointOptionsObject[];
    expect(supportPoints.map(point => point.y)).toEqual([100, 20, 0, 0]);
    expect(criticalPoints.map(point => point.y)).toEqual([-100, null, null, 0]);
    expect(supportPoints[0].custom?.['display']).toMatch(/^≈/);
    expect(criticalPoints[0].custom?.['display']).not.toContain('-');
    expect(criticalPoints[0].custom?.['posts']).toBe(1);
    expect(criticalPoints[1].custom?.['coverage']).toContain('1');
    expect((options.yAxis as Highcharts.YAxisOptions).min).not.toBe(0);
    expect((options.yAxis as Highcharts.YAxisOptions).plotLines?.some(line => line.value === 0)).toBe(true);
    expect(options.legend?.enabled).toBe(true);
    expect(component.exportTitle()).toContain('Гюров');
    expect(component.exportTitle()).toContain('Споделяния');
    component.setCandidate('yotova');
    component.metric.set('comments');
    expect(component.exportTitle()).toContain('Йотова');
    expect(component.exportTitle()).toContain('Коментари');
    fixture.destroy();
  });

  it('emits the selected Page, candidate and tone without treating the two sides as a net score', () => {
    const { fixture, component } = chartFixture(toneFixture());
    const emit = vi.spyOn(component.toneSelect, 'emit');
    const clickSegment = (tone: 'supportive' | 'critical', pageId: string) => {
      const name = tone === 'supportive' ? 'Подкрепящи публикации' : 'Критични публикации';
      const series = (component.toneChart().series as Highcharts.SeriesBarOptions[]).find(row => row.name === name)!;
      const index = component.toneRows().findIndex(row => row.id === pageId);
      series.point!.events!.click!.call({ index } as Highcharts.Point, {} as Highcharts.PointClickEventObject);
    };
    clickSegment('supportive', 'balanced');
    expect(emit).toHaveBeenLastCalledWith({ pageId: 'balanced', candidate: 'gyurov', tone: 'supportive' });
    clickSegment('critical', 'balanced');
    expect(emit).toHaveBeenLastCalledWith({ pageId: 'balanced', candidate: 'gyurov', tone: 'critical' });
    component.setCandidate('yotova');
    clickSegment('critical', 'smaller');
    expect(emit).toHaveBeenLastCalledWith({ pageId: 'smaller', candidate: 'yotova', tone: 'critical' });
    expect(emit).toHaveBeenCalledTimes(3);
    fixture.destroy();
  });

  it('switches chart views through linked tabs and provides the same tone values in an accessible table', () => {
    const { fixture, component } = chartFixture(toneFixture());
    const element = fixture.nativeElement as HTMLElement;
    const initialTotalChart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance as ChartStub;
    expect(initialTotalChart.options).toBe(component.pageChart());
    expect(element.querySelector('table.sr-only')).toBeNull();
    element.querySelector<HTMLButtonElement>('#facebook-engagement-view-tab-tone')!.click();
    fixture.detectChanges();
    expect(component.view()).toBe('tone');
    const toneChart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance as ChartStub;
    expect(toneChart).not.toBe(initialTotalChart);
    expect(toneChart.options).toBe(component.toneChart());
    expect((toneChart.options as Highcharts.Options).series).toHaveLength(2);
    for (const tab of element.querySelectorAll('[role="tab"]')) {
      const panel = element.querySelector(`#${tab.getAttribute('aria-controls')}`);
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      if (tab.getAttribute('aria-selected') === 'true') expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }
    const table = element.querySelector<HTMLTableElement>('table.sr-only')!;
    expect(table.caption?.textContent).toContain('Споделяния');
    expect(table.caption?.textContent).toContain('Гюров');
    expect(table.tBodies[0].rows).toHaveLength(4);
    expect(table.tBodies[0].rows[0].textContent).toMatch(/≈\s*100/);
    expect(table.tBodies[0].rows[2].textContent).toContain('1 без брояч');
    element.querySelector<HTMLButtonElement>('#facebook-tone-candidate-tab-yotova')!.click();
    element.querySelector<HTMLButtonElement>('#facebook-metric-tab-comments')!.click();
    fixture.detectChanges();
    expect(component.candidate()).toBe('yotova');
    expect(component.metric()).toBe('comments');
    expect(table.caption?.textContent).toContain('Коментари');
    expect(table.caption?.textContent).toContain('Йотова');
    expect(table.tBodies[0].rows).toHaveLength(3);
    element.querySelector<HTMLButtonElement>('#facebook-engagement-view-tab-total')!.click();
    fixture.detectChanges();
    const totalChart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance as ChartStub;
    expect(totalChart).not.toBe(toneChart);
    expect(totalChart).not.toBe(initialTotalChart);
    expect(totalChart.options).toBe(component.pageChart());
    expect((totalChart.options as Highcharts.Options).series).toHaveLength(1);
    fixture.destroy();
  });

  it('limits tone rows to visible Pages and renders an empty state without inventing unreviewed positions', () => {
    const report = toneFixture();
    const { fixture, component } = chartFixture(report);
    fixture.componentRef.setInput('pages', facebookPageSummaries(report).filter(page => page.id === 'smaller'));
    component.view.set('tone');
    fixture.detectChanges();
    expect(component.toneRows().map(row => row.id)).toEqual(['smaller']);
    expect(component.tonePostCount()).toBe(2);
    expect(component.excludedTonePosts()).toBe(0);
    fixture.componentRef.setInput('pages', facebookPageSummaries(report).filter(page => page.id === 'other'));
    fixture.detectChanges();
    expect(component.toneRows()).toEqual([]);
    expect(component.tonePostCount()).toBe(0);
    expect(component.excludedTonePosts()).toBe(5);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Няма');
    expect(element.textContent).toContain('подкрепа');
    expect(element.textContent).toContain('критика');
    fixture.destroy();
  });
});
