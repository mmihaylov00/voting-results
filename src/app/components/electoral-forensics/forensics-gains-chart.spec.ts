import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as Highcharts from 'highcharts';
import type { SeriesScatterOptions } from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { describe, expect, it } from 'vitest';
import { ThemeService } from '../../services/theme.service';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsGainsChartComponent, sectionGainPoints } from './forensics-gains-chart';
import { ForensicsSection } from './forensics.models';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; @Output() chartInstance = new EventEmitter<Highcharts.Chart>(); }

function row(overrides: Partial<ForensicsSection> = {}): ForensicsSection {
  return sectionFixture({ candidateChanges: [candidateFixture('4', 30, 50), candidateFixture('25', 40, 100)], ...overrides });
}

function setup(rows: readonly ForensicsSection[]) {
  const darkMode = signal(false);
  TestBed.configureTestingModule({ imports: [ForensicsGainsChartComponent],
    providers: [{ provide: ThemeService, useValue: { darkMode, toggleDarkMode: () => darkMode.update(value => !value) } }],
  }).overrideComponent(ForensicsGainsChartComponent, {
    remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] },
  });
  const fixture = TestBed.createComponent(ForensicsGainsChartComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.detectChanges();
  return fixture;
}

describe('section gain paired cohort', () => {
  it('requires eligible comparable pairs, positive registered lists and finite candidate baselines and coordinates', () => {
    const valid = row();
    const invalid = [
      row({ comparableRoundPair: false }), row({ eligible: false }), row({ registered1: null }),
      row({ registered1: 0 }), row({ registered2: -1 }), row({ voted1: null }), row({ voted2: NaN }),
      row({ deltaVoted: Infinity }), row({ candidateChanges: [candidateFixture('25', 40, 100)] }),
      row({ candidateChanges: [candidateFixture('4', NaN, 50), candidateFixture('25', 40, 100)] }),
      row({ candidateChanges: [candidateFixture('4', 30, 50), { ...candidateFixture('25', 40, 100), deltaVotes: NaN }] }),
    ];
    expect(sectionGainPoints([valid, ...invalid])).toEqual([{ row: valid, turnout: 80, gyurov: 20, yotova: 60, listChangePct: 0 }]);
  });

  it('retains zero and negative gains and sections where added electors can make signed voters exceed the initial list', () => {
    const zero = row({ deltaVoted: 0, candidateChanges: [candidateFixture('4', 20, 20), candidateFixture('25', 30, 30)] });
    const negative = row({ registered1: 12, registered2: 8, voted1: 30, voted2: 28, deltaVoted: -2,
      candidateChanges: [candidateFixture('4', 10, 8), candidateFixture('25', 20, 19)] });
    expect(sectionGainPoints([zero, negative])).toMatchObject([
      { turnout: 0, gyurov: 0, yotova: 0 }, { turnout: -2, gyurov: -2, yotova: -1 },
    ]);
  });
});

describe('section gain graph and ranking', () => {
  it('shares the paired cohort across the plot and ranking and changes its horizontal axis through visible tabs', () => {
    const fixture = setup([row(), row({ sectionId: '050100002', eligible: false })]);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.chart().series?.[1]).toMatchObject({ type: 'scatter', data: [{ x: 80, y: 60 }] });
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector('.scope')?.textContent).toContain('1 от 2 секции');
    expect(element.querySelector('.scope')?.textContent).toContain('1 без допустима пълна двойка');
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    for (const tab of tabs) expect(element.querySelectorAll(`[id="${tab.getAttribute('aria-controls')}"]`)).toHaveLength(1);
    const gyurov = tabs.find(tab => tab.textContent?.includes('Гюров'))!;
    gyurov.click(); fixture.detectChanges();
    expect(component.comparison()).toBe('gyurov');
    expect(component.chart().series?.[1]).toMatchObject({ data: [{ x: 20, y: 60 }] });
    expect(element.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(gyurov.id);
    expect(component.chart().series?.[0]).toMatchObject({ name: 'Равен абсолютен прираст (описателна линия)', data: [[0, 0], [20, 20]] });
  });

  it('keeps changed lists visible by default and optionally limits the same plot and ranking to changes of at most five percent', () => {
    const fixture = setup([row({ sectionId: '001', registered1: 200, registered2: 210 }),
      row({ sectionId: '002', registered1: 200, registered2: 211 })]);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.points()).toHaveLength(2);
    expect(element.textContent).toContain('Промяна над 5%');
    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    expect(element.querySelectorAll('input[type=number]')).toHaveLength(0);
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(component.points().map(point => point.row.sectionId)).toEqual(['001']);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector('.scope')?.textContent).toContain('1 с променени списъци извън графиката');
  });

  it('ranks large losses by magnitude as well as gains, limits to twenty, resolves ties by section and leaves input order unchanged', () => {
    const rows = Array.from({ length: 25 }, (_, index) => row({ sectionId: String(index).padStart(3, '0'),
      candidateChanges: [candidateFixture('4', 10, 20), candidateFixture('25', 100, index === 24 ? 0 : 100 + index)] }));
    const fixture = setup(rows);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    expect(component.ranked()).toHaveLength(20);
    expect(component.ranked()[0]).toMatchObject({ yotova: -100, row: { sectionId: '024' } });
    expect(element.querySelector('tbody [data-change="down"]')?.textContent).toBe('-100');
    const select = element.querySelector('select')!;
    select.value = 'gain'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(component.ranked()[0]).toMatchObject({ yotova: 23, row: { sectionId: '023' } });
    expect(rows[0].sectionId).toBe('000');
    fixture.componentRef.setInput('rows', [row({ sectionId: '002' }), row({ sectionId: '001' })]); fixture.detectChanges();
    expect(component.ranked().map(point => point.row.sectionId)).toEqual(['001', '002']);
  });

  it('zooms and resets both axes through the visible controls and clears zoom when the candidate view or cohort changes', () => {
    const fixture = setup([
      row({ sectionId: 'low', deltaVoted: -80, candidateChanges: [candidateFixture('4', 100, 20), candidateFixture('25', 100, 10)] }),
      row({ sectionId: 'high', deltaVoted: 200, candidateChanges: [candidateFixture('4', 20, 170), candidateFixture('25', 20, 220)] }),
    ]);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const host = element.querySelector<HTMLElement>('highcharts-chart')!;
    const initial = component.chart();
    const chart = Highcharts.chart(host, { ...initial, chart: { ...initial.chart, width: 700, height: 500, animation: false }, accessibility: { enabled: false } });
    try {
      component.onChartReady(chart); fixture.detectChanges();
      const ranges = () => [chart.xAxis[0], chart.yAxis[0]].map(axis => { const { min, max } = axis.getExtremes(); return max - min; });
      const initialRanges = ranges();
      expect(element.querySelector<HTMLButtonElement>('[aria-label="Увеличи графиката"]')!.disabled).toBe(false);
      element.querySelector<HTMLButtonElement>('[aria-label="Увеличи графиката"]')!.click(); fixture.detectChanges();
      expect(ranges()[0]).toBeLessThan(initialRanges[0]);
      expect(ranges()[1]).toBeLessThan(initialRanges[1]);
      expect(component.zoomed()).toBe(true);
      element.querySelector<HTMLButtonElement>('[aria-label="Намали графиката"]')!.click(); fixture.detectChanges();
      expect(ranges()[0]).toBeGreaterThan(initialRanges[0] / 2);
      component.zoom(.5); fixture.detectChanges();
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Всички точки'))!.click(); fixture.detectChanges();
      expect(chart.xAxis[0].getExtremes().userMin).toBeUndefined();
      expect(chart.yAxis[0].getExtremes().userMin).toBeUndefined();
      expect(component.zoomed()).toBe(false);
      component.zoom(.5); fixture.detectChanges();
      component.comparison.set('gyurov'); fixture.detectChanges();
      expect(component.zoomed()).toBe(false);
      component.zoom(.5); fixture.detectChanges();
      fixture.componentRef.setInput('rows', [row()]); fixture.detectChanges();
      expect(component.zoomed()).toBe(false);
      chart.destroy();
      expect(component.chartAvailable()).toBe(false);
      expect(() => component.zoom(.5)).not.toThrow();
    } finally {
      if (chart.renderer) chart.destroy();
      fixture.destroy();
    }
  });

  it('ignores chart instances from removed views, empty cohorts and a destroyed component', () => {
    const fixture = setup([row()]);
    const component = fixture.componentInstance;
    const oldHost = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('highcharts-chart')!;
    const initial = component.chart();
    const chart = Highcharts.chart(oldHost, { ...initial, chart: { ...initial.chart, width: 700, height: 500 }, accessibility: { enabled: false } });
    try {
      component.onChartReady(chart);
      fixture.componentRef.setInput('rows', []); fixture.detectChanges();
      component.onChartReady(chart);
      expect(component.chartAvailable()).toBe(false);
      fixture.componentRef.setInput('rows', [row()]); fixture.detectChanges();
      component.onChartReady(chart);
      expect(component.chartAvailable()).toBe(false);
      fixture.destroy();
      component.onChartReady(chart);
      expect(component.chartAvailable()).toBe(false);
    } finally { chart.destroy(); }
  });

  it('emits the original section for both chart and ranked-row selection and preserves negative and zero coordinates', () => {
    const negative = row({ sectionId: 'negative', deltaVoted: -10,
      candidateChanges: [candidateFixture('4', 40, 20), candidateFixture('25', 50, 20)] });
    const zero = row({ sectionId: 'zero', deltaVoted: 0,
      candidateChanges: [candidateFixture('4', 20, 20), candidateFixture('25', 30, 30)] });
    const fixture = setup([negative, zero]);
    const component = fixture.componentInstance;
    const selected: ForensicsSection[] = [];
    component.sectionSelect.subscribe(section => selected.push(section));
    const click = component.chart().plotOptions?.scatter?.point?.events?.click;
    if (!click) throw new Error('Missing section chart selection handler');
    Reflect.apply(click, { index: 0, options: { id: 'zero' } }, [{}]);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.section-link')!.click();
    expect(selected).toEqual([zero, negative]);
    expect(selected[0]).toBe(zero);
    expect(component.chart().series?.[1]).toMatchObject({ data: [{ x: -10, y: -30 }, { x: 0, y: 0 }] });
  });

  it('uses section identities for callbacks even when display indexes differ or a previous filtered point no longer exists', () => {
    const first = row({ sectionId: 'first' });
    const second = row({ sectionId: 'second', registered2: 300 });
    const fixture = setup([first, second]);
    const component = fixture.componentInstance;
    component.comparison.set('gyurov');
    const options = component.chart();
    expect(options.series?.[1]).toMatchObject({ data: [{ id: 'first', x: 20 }, { id: 'second', x: 20 }] });
    const click = options.plotOptions?.scatter?.point?.events?.click;
    const tooltip = options.tooltip?.formatter;
    if (!click || !tooltip) throw new Error('Missing section chart identity callbacks');
    const selected: ForensicsSection[] = [];
    component.sectionSelect.subscribe(section => selected.push(section));
    Reflect.apply(click, { index: 0, options: { id: 'second' } }, [{}]);
    expect(selected).toEqual([second]);
    expect(Reflect.apply(tooltip, { index: 0, options: { id: 'second' } }, [{}])).toContain('<b>second</b>');
    component.stableOnly.set(true);
    const filtered = component.chart();
    const filteredClick = filtered.plotOptions?.scatter?.point?.events?.click;
    const filteredTooltip = filtered.tooltip?.formatter;
    if (!filteredClick || !filteredTooltip) throw new Error('Missing filtered section chart callbacks');
    Reflect.apply(filteredClick, { index: 0, options: { id: 'second' } }, [{}]);
    expect(selected).toEqual([second]);
    expect(Reflect.apply(filteredTooltip, { index: 0, options: { id: 'second' } }, [{}])).toBe('');
    expect(Reflect.apply(filteredTooltip, { index: 10, options: {} }, [{}])).toBe('');
  });

  it('retains each section, extreme marker and tooltip through real Highcharts updates with duplicate x coordinates', () => {
    const rows = [
      row({ sectionId: 'top', deltaVoted: 184, candidateChanges: [candidateFixture('4', 10, 27), candidateFixture('25', 20, 213)] }),
      row({ sectionId: 'second', deltaVoted: 142, candidateChanges: [candidateFixture('4', 10, 16), candidateFixture('25', 20, 195)] }),
      row({ sectionId: 'third', deltaVoted: 100, candidateChanges: [candidateFixture('4', 10, 16), candidateFixture('25', 20, 180)] }),
      row({ sectionId: 'fourth', deltaVoted: 80, candidateChanges: [candidateFixture('4', 10, 27), candidateFixture('25', 20, 170)] }),
      row({ sectionId: 'fifth', deltaVoted: 60, candidateChanges: [candidateFixture('4', 10, 11), candidateFixture('25', 20, 160)] }),
      row({ sectionId: 'loss', deltaVoted: 40, candidateChanges: [candidateFixture('4', 10, 27), candidateFixture('25', 100, 74)] }),
      row({ sectionId: 'changed-list', deltaVoted: 70, registered2: 300,
        candidateChanges: [candidateFixture('4', 10, 16), candidateFixture('25', 20, 200)] }),
    ];
    const fixture = setup(rows);
    const component = fixture.componentInstance;
    const container = document.createElement('div');
    document.body.append(container);
    const initial = component.chart();
    const chart = Highcharts.chart(container, { ...initial, chart: { ...initial.chart, width: 700, height: 500, animation: false },
      accessibility: { enabled: false } });
    try {
      component.comparison.set('gyurov');
      chart.update(component.chart(), true, false);
      component.stableOnly.set(true);
      chart.update(component.chart(), true, false);
      chart.setSize(320, 500, false);
      chart.setSize(390, 500, false);
      TestBed.inject(ThemeService).toggleDarkMode();
      chart.update(component.chart(), true, false);
      const scatter = chart.series.find(series => series.type === 'scatter');
      if (!scatter) throw new Error('Missing updated scatter series');
      const top = scatter.points.find(point => point.options.id === 'top');
      const loss = scatter.points.find(point => point.options.id === 'loss');
      expect(scatter.points.map(point => point.options.id)).toEqual(['top', 'second', 'third', 'fourth', 'fifth', 'loss']);
      expect(top).toMatchObject({ x: 17, y: 193, options: { labelrank: 193, marker: { radius: 5 } } });
      expect(loss).toMatchObject({ x: 17, y: -26, options: { labelrank: 0, marker: { radius: 3 } } });
      const tooltip = chart.options.tooltip?.formatter;
      if (!top || !tooltip) throw new Error('Missing updated top point or tooltip');
      expect(Reflect.apply(tooltip, top, [{}])).toContain('<b>top</b>');
      expect(Reflect.apply(tooltip, top, [{}])).toContain('Δ +193');
      const labels = [...container.querySelectorAll('.highcharts-data-labels text')].map(label => label.textContent);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.length).toBeLessThanOrEqual(5);
      expect(new Set(labels).size).toBe(labels.length);
    } finally {
      chart.destroy();
      container.remove();
    }
  });

  it('labels only five nonzero candidate-gain extremes', () => {
    const fixture = setup(Array.from({ length: 8 }, (_, index) => row({ sectionId: String(index),
      candidateChanges: [candidateFixture('4', 10, 20), candidateFixture('25', 20, 20 + index)] })));
    const scatter = fixture.componentInstance.chart().series?.find((series): series is SeriesScatterOptions => 'type' in series && series.type === 'scatter');
    if (!scatter) throw new Error('Missing section scatter');
    const labels = scatter.data?.map(point => typeof point === 'object' && point !== null && !Array.isArray(point)
      ? point.labelrank : undefined);
    expect(labels?.filter(rank => rank !== undefined && rank > 0)).toHaveLength(5);
    expect(fixture.componentInstance.chart().plotOptions?.scatter?.dataLabels).toMatchObject({ enabled: true,
      filter: { property: 'labelrank', operator: '>', value: 0 } });
  });

  it('marks changed registered lists with an amber outline while preserving candidate-change fills', () => {
    const fixture = setup([row({ sectionId: '001' }), row({ sectionId: '002', registered2: 300,
      candidateChanges: [candidateFixture('4', 30, 50), candidateFixture('25', 100, 40)] })]);
    expect(fixture.componentInstance.chart().series?.[1]).toMatchObject({ data: [
      { marker: { lineColor: 'var(--research-ink)', lineWidth: 1 } },
      { marker: { lineColor: '#b58118', lineWidth: 1.5 } },
    ] });
    const scatter = fixture.componentInstance.chart().series?.find((series): series is SeriesScatterOptions => 'type' in series && series.type === 'scatter');
    const fills = scatter?.data?.map(point => typeof point === 'object' && point !== null && !Array.isArray(point) ? point.marker?.fillColor : null);
    expect(fills?.[0]).not.toBe(fills?.[1]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.list-key')?.textContent).toContain('Жълт контур: над 5% промяна в списъка.');
  });

  it('renders an explicit empty state instead of a misleading chart when the cohort is empty', () => {
    const fixture = setup([row({ comparableRoundPair: false })]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('highcharts-chart')).toBeNull();
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Няма допустими секции');
    expect(element.querySelector('.scope')?.textContent).toContain('0 от 1 секции');
  });

  it('puts baselines, signed candidate gains, turnout and changed-list status on separate escaped tooltip lines', () => {
    const fixture = setup([row({ sectionId: '<b>section</b>', settlementName: '<img src=x onerror="bad()">', registered2: 300 })]);
    const component = fixture.componentInstance;
    const tooltip = component.tooltip(component.points()[0]);
    expect(tooltip).toContain('<b>&lt;b&gt;section&lt;/b&gt;</b><br/>Видин<br/>Белоградчик<br/>');
    expect(tooltip).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
    expect(tooltip).not.toContain('<img');
    expect(tooltip).toContain('По списък: 250 → 300<br/>Гласували: 90 → 170 (Δ +80)');
    expect(tooltip).toContain('Йотова: 40 → 100 (Δ +60)<br/>Гюров: 30 → 50 (Δ +20)');
    expect(tooltip).toContain('Δ активност: +32,00 п.п.<br/>Списъкът се променя с над 5%');
  });
});
