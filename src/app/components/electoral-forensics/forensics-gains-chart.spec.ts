import { Component, Input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SeriesScatterOptions } from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { describe, expect, it } from 'vitest';
import { ThemeService } from '../../services/theme.service';
import { candidateFixture, sectionFixture } from './forensics.fixtures';
import { ForensicsGainsChartComponent, sectionGainPoints } from './forensics-gains-chart';
import { ForensicsSection } from './forensics.models';

@Component({ selector: 'highcharts-chart', template: '' })
class ChartStub { @Input() options: unknown; }

function row(overrides: Partial<ForensicsSection> = {}): ForensicsSection {
  return sectionFixture({ candidateChanges: [candidateFixture('4', 30, 50), candidateFixture('25', 40, 100)], ...overrides });
}

function setup(rows: readonly ForensicsSection[]) {
  TestBed.configureTestingModule({ imports: [ForensicsGainsChartComponent],
    providers: [{ provide: ThemeService, useValue: { darkMode: signal(false) } }],
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
    Reflect.apply(click, { index: 1 }, [{}]);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.section-link')!.click();
    expect(selected).toEqual([zero, negative]);
    expect(selected[0]).toBe(zero);
    expect(component.chart().series?.[1]).toMatchObject({ data: [{ x: -10, y: -30 }, { x: 0, y: 0 }] });
  });

  it('labels only five nonzero candidate-gain extremes', () => {
    const fixture = setup(Array.from({ length: 8 }, (_, index) => row({ sectionId: String(index),
      candidateChanges: [candidateFixture('4', 10, 20), candidateFixture('25', 20, 20 + index)] })));
    const scatter = fixture.componentInstance.chart().series?.find((series): series is SeriesScatterOptions => 'type' in series && series.type === 'scatter');
    if (!scatter) throw new Error('Missing section scatter');
    const labels = scatter.data?.map(point => typeof point === 'object' && point !== null && !Array.isArray(point)
      ? point.dataLabels : undefined);
    expect(labels?.filter(label => label && !Array.isArray(label) && label.enabled)).toHaveLength(5);
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
