import { Component, Input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HighchartsChartComponent } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { describe, expect, it, vi } from 'vitest';
import snapshot from '../../../../public/data/facebook/2026/report.json';
import { ThemeService } from '../../services/theme.service';
import { FacebookResearchChartsComponent } from './facebook-research-charts';
import { FacebookReport } from './facebook-research.models';
import { facebookPageSummaries } from './facebook-research.util';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

describe('Facebook research charts', () => {
  it('retains missing and approximate counters, limits dates to known days, and links bars to posts', () => {
    const darkMode = signal(false);
    TestBed.configureTestingModule({ imports: [FacebookResearchChartsComponent], providers: [{ provide: ThemeService, useValue: { darkMode } }] });
    TestBed.overrideComponent(FacebookResearchChartsComponent, { remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] } });
    const fixture = TestBed.createComponent(FacebookResearchChartsComponent);
    const component = fixture.componentInstance;
    const report = snapshot as FacebookReport;
    const pages = facebookPageSummaries(report);
    fixture.componentRef.setInput('pages', pages);
    fixture.componentRef.setInput('posts', report.posts);
    fixture.detectChanges();
    const bars = component.pageChart().series![0] as Highcharts.SeriesBarOptions;
    const points = bars.data as Highcharts.PointOptionsObject[];
    expect(points).toHaveLength(19);
    expect(points.some(point => point.y === null)).toBe(true);
    component.metric.set('reactions');
    const reactions = component.pageChart().series![0] as Highcharts.SeriesBarOptions;
    expect((reactions.data as Highcharts.PointOptionsObject[]).some(point => point.custom?.['display'].startsWith('≈'))).toBe(true);
    expect(component.datedPosts()).toBe(96);
    expect(component.intervalPosts()).toBe(1);
    const timeline = component.timelineChart().series![0] as Highcharts.SeriesColumnOptions;
    expect((timeline.data as number[]).reduce((sum, count) => sum + count, 0)).toBe(96);
    const selection = vi.fn();
    component.pageSelect.subscribe(selection);
    component.pageChart().plotOptions!.series!.point!.events!.click!.call({ index: 0 } as Highcharts.Point, {} as Highcharts.PointClickEventObject);
    expect(selection).toHaveBeenCalledWith([...pages].sort((a, b) => (b.totals.reactions.value ?? -1) - (a.totals.reactions.value ?? -1))[0].id);
    darkMode.set(true);
    expect((component.pageChart().series![0] as Highcharts.SeriesBarOptions).color).toBe('#e7ba50');
    expect((fixture.nativeElement as HTMLElement).querySelector('dl[aria-label]')).not.toBeNull();
    fixture.destroy();
  });
});
