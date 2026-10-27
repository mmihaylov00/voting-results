import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { ElectionService } from '../../../services/election';
import { ThemeService } from '../../../services/theme.service';
import { Region, Section } from '../../../models/election.models';
import { ElectionAnalysisComponent } from './election-analysis';
import { VirtualTableDirective } from '../virtual-table/virtual-table';
import { provideRouter } from '@angular/router';

const section: Section = {
  sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
  total: 100, voted: 80, discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 8000,
  partyVotes: { '1': { total: 40, paper: 40, machine: 0 } },
};

@Component({ selector: 'highcharts-chart', standalone: true, template: '' })
class ChartStubComponent {
  @Input() options: unknown;
  @Input() oneToOne = false;
  @Output() chartInstance = new EventEmitter<Highcharts.Chart>();
}

function setup(getSections = vi.fn(() => of([section])), renderTemplate = false) {
  const testing = TestBed.configureTestingModule({
    imports: [ElectionAnalysisComponent],
    providers: [
      provideRouter([]),
      { provide: ElectionService, useValue: {
        getDates: () => [
          { date: '2021.11.14', name: '2021 тур 1', type: 'presidential', round: 1 },
          { date: '2021.11.21', name: '2021 тур 2', type: 'presidential', round: 2 },
          { date: '2016.11.06', name: '2016 тур 1', type: 'presidential', round: 1 },
          { date: '2016.11.13', name: '2016 тур 2', type: 'presidential', round: 2 },
          { date: '2011.10.30', name: '2011 тур 2', type: 'presidential', round: 2 },
        ],
        getAllData: () => of(Object.fromEntries(['2021.11.14', '2021.11.21', '2016.11.06', '2016.11.13', '2011.10.30'].map((date) => [date, {
          parties: { '1': 'Кандидат' }, regions: [{ id: '01', name: 'Регион', total: 100, voted: 80, partyVotes: { '1': 40 } }],
        }]))),
        getSections,
        getOfficialNationalElectors: () => 100,
      } },
      { provide: ThemeService, useValue: { darkMode: () => false } },
    ],
  }).overrideComponent(ElectionAnalysisComponent, {
    remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStubComponent] },
  });
  if (!renderTemplate) testing.overrideComponent(ElectionAnalysisComponent, { set: { template: '' } });
  const fixture = TestBed.createComponent(ElectionAnalysisComponent);
  const component = fixture.componentInstance;
  component.date = '2021.11.21';
  component.parties = { '1': 'Кандидат' };
  component.activePartyId = '1';
  return fixture;
}

describe('election analysis loading', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exports every search match in the displayed order and disables export for empty search results', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    component.view = 'comparison';
    await component.load();
    const source = component.rows[0];
    component.rows = Array.from({ length: 128 }, (_, id) => ({ ...source, id: String(id), label: `Място ${id}`,
      current: { ...source.current, votes: id } }));
    fixture.detectChanges(); await fixture.whenStable();
    const controls = component.comparisonTable!;
    controls.query.set('Място 1'); controls.sort('currentVotes');
    await fixture.whenStable();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:comparison-csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    component.exportCsv();
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(create).not.toHaveBeenCalled();
    const confirm = fixture.nativeElement.querySelector('app-csv-export-modal app-csv-export-button button') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    confirm.click();
    await fixture.whenStable();
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('Expected a CSV blob');
    const contents = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(contents.split('\r\n')).toHaveLength(controls.viewRows().length + 1);
    expect(contents.split('\r\n')[1]).toContain('Място 127');
    expect(contents).not.toContain('Място 20');
    expect(controls.viewRows().length).toBeGreaterThan(fixture.nativeElement.querySelectorAll('tr[data-virtual-index]').length);
    expect(component.rows).toHaveLength(128);
    expect(component.rows[0].id).toBe('0');
    controls.query.set('Няма такова място'); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-csv-export-button button')?.disabled).toBe(true);
  });

  it('virtualizes every comparison row and resets to the first row after sorting', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    component.view = 'comparison';
    await component.load();
    const initial = component.rows[0];
    component.rows = Array.from({ length: 128 }, (_, index) => ({ ...initial,
      id: String(index), label: `Място ${index}`, voteChange: index,
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    const viewport = fixture.debugElement.query(By.directive(VirtualTableDirective));
    const list = viewport.injector.get(VirtualTableDirective);
    expect(list.columnCount()).toBe(10);
    expect(list.virtualRows()).toHaveLength(128);
    expect(viewport.nativeElement.querySelectorAll('tr[data-virtual-index]').length).toBeLessThan(30);
    viewport.nativeElement.scrollTop = 128 * 64;
    viewport.nativeElement.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(viewport.nativeElement.querySelector('tr[data-virtual-index="127"] button')?.textContent).toBe('Място 127');
    component.sort('voteChange');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(viewport.nativeElement.scrollTop).toBe(0);
    expect(viewport.nativeElement.querySelector('tr[data-virtual-index="0"] button')?.textContent).toBe('Място 127');
    expect(list.virtualRows()).toHaveLength(128);
  });

  it('orders historical party choices by the current election and scope without loading extra sections', async () => {
    const getSections = vi.fn(() => of([section]));
    const component = setup(getSections).componentInstance;
    component.parties = { '1': 'Кандидат', '2': 'Друг кандидат' };
    const service = TestBed.inject(ElectionService);
    const summaries = Object.fromEntries(service.getDates().map(election => [election.date, {
      parties: component.parties, regions: [{ id: '01', name: 'Район', total: 100, voted: 80, partyVotes: { '1': 20, '2': 60 } }],
    }]));
    vi.spyOn(service, 'getAllData').mockReturnValue(of(summaries));
    await component.load();
    expect(component.partyChoices.map(option => option.value)).toEqual([null, '2', '1']);
    expect(getSections).not.toHaveBeenCalled();
    component.regionId = '01'; component.sections = [section];
    await component.load();
    getSections.mockClear();
    expect(component.partyChoices.map(option => option.value)).toEqual([null, '1', '2']);
    expect(component.activePartyId).toBe('1');
    expect(getSections).not.toHaveBeenCalled();
  });

  it('keeps presidential rounds separate and avoids full data loads for national summaries', async () => {
    const getSections = vi.fn(() => of([section]));
    const component = setup(getSections).componentInstance;
    await component.load();
    expect(component.timeline.map((point) => point.date)).toEqual(['2011.10.30', '2016.11.13', '2021.11.21']);
    expect(component.rows[0].regionId).toBe('01');
    expect(getSections).not.toHaveBeenCalled();
  });

  it('preserves an empty filtered scope instead of showing national results', async () => {
    const component = setup().componentInstance;
    component.regionId = '01';
    component.sections = [];
    await component.load();
    expect(component.current).toBeNull();
    expect(component.rows).toEqual([]);
    expect(component.timeline.every((point) => point.snapshot === null)).toBe(true);
  });

  it('uses official electors for a complete national scope, preserving matched-scope denominators when filtered', async () => {
    const component = setup().componentInstance;
    vi.spyOn(TestBed.inject(ElectionService), 'getOfficialNationalElectors').mockReturnValue(200);
    component.regionId = 'all';
    component.sections = [section];
    component.parentSections = [section];
    await component.load();
    expect(component.current?.turnout).toBe(40);
    expect(component.timeline[0].snapshot?.turnout).toBe(40);
    expect(component.parent?.turnout).toBe(40);
    component.parentSections = [section, { ...section, sectionId: '010100002' }];
    await component.load();
    expect(component.current?.turnout).toBe(80);
    expect(component.timeline[0].snapshot?.turnout).toBe(80);
    expect(component.parent?.turnout).toBe(80);
  });

  it('does not apply official national electors to a partially matched historical scope', async () => {
    const component = setup(vi.fn(() => of([section, { ...section, sectionId: '010100002' }]))).componentInstance;
    vi.spyOn(TestBed.inject(ElectionService), 'getOfficialNationalElectors').mockReturnValue(200);
    component.regionId = 'all';
    component.sections = [section];
    component.parentSections = [section];
    await component.load();
    expect(component.current?.turnout).toBe(40);
    expect(component.timeline[0].snapshot?.turnout).toBe(80);
  });

  it('omits self-comparisons and duplicate national benchmarks while retaining real zero differences', async () => {
    const component = setup().componentInstance;
    component.sections = [section];
    component.parentSections = [section];
    await component.load();
    expect(component.benchmarks).toEqual([]);
    component.regionId = 'all';
    await component.load();
    expect(component.benchmarks).toEqual([]);
    component.regionId = '01';
    await component.load();
    expect(component.benchmarks.map(benchmark => benchmark.label)).toEqual(['Спрямо страната']);
    expect(component.deviation('share', component.benchmarks[0].snapshot)).toBe(0);
    component.regionId = 'all';
    component.parentSections = [section, { ...section, sectionId: '010100002' }];
    await component.load();
    expect(component.benchmarks.map(benchmark => benchmark.label)).toEqual(['Спрямо страната']);
  });

  it('renders distinct scope benchmarks with their reference percentages and signed differences', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    const selected = { ...section, sectionId: '010100002', voted: 60, partyVotes: { '1': { total: 12, paper: 12, machine: 0 } } };
    component.regionId = '01';
    component.sections = [selected];
    component.parentSections = [section, selected];
    await component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const benchmarks = element.querySelector('[aria-label="Сравнение с обхвата"]');
    expect(component.benchmarks).toHaveLength(2);
    expect(benchmarks?.textContent).toContain('Спрямо целия обхват');
    expect(benchmarks?.textContent).toContain('Спрямо страната');
    expect(benchmarks?.textContent).toContain(component.format(50, true));
    expect(benchmarks?.textContent).toContain(component.format(-30, true, true));
    expect(benchmarks?.textContent).toContain(component.format(-20, true, true));
    expect(element.textContent).not.toContain('Изберете точка');
    expect(element.textContent).not.toContain('Историческите точки включват');
    expect(element.textContent).not.toContain('Покритие по избори');
    expect(element.querySelector('details')).toBeNull();
  });

  it('does not emit an older comparison when a newer baseline request completes first', async () => {
    const first = new Subject<Section[]>();
    const second = new Subject<Section[]>();
    const getSections = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const component = setup(getSections).componentInstance;
    await component.load();
    component.regionId = '01';
    component.sections = [section];
    const emit = vi.spyOn(component.comparisonChange, 'emit');
    component.comparisonDate = '2016.11.13';
    const olderRequest = component.changeComparison();
    expect(emit).toHaveBeenLastCalledWith(null);
    component.comparisonDate = '2011.10.30';
    const newerRequest = component.changeComparison();
    second.next([section]); second.complete();
    await newerRequest;
    first.next([section]); first.complete();
    await olderRequest;
    expect(emit.mock.calls.filter(([comparison]) => comparison !== null)).toEqual([
      [{ date: '2011.10.30', sections: [section], partyId: '1' }],
    ]);
  });

  it('clears old rows and invalidates the map when a baseline fails to load', async () => {
    const component = setup(vi.fn(() => throwError(() => new Error('offline')))).componentInstance;
    await component.load();
    expect(component.rows).toHaveLength(1);
    component.regionId = '01';
    component.sections = [section];
    const emit = vi.spyOn(component.comparisonChange, 'emit');
    await component.changeComparison();
    expect(emit).toHaveBeenCalledExactlyOnceWith(null);
    expect(component.rows).toEqual([]);
    expect(component.error).toContain('Неуспешно');
    expect(component.loading).toBe(false);
  });

  it('shows the baseline on the left and current results on the right while preserving change signs and exports', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    component.view = 'comparison';
    await component.load();
    const row = component.rows[0];
    component.rows = [
      { ...row, id: '01', label: '01. Регион', current: { ...row.current, votes: 50, share: 48, turnout: 80 },
        previous: { ...row.current, votes: 40, share: 50, turnout: 80 }, voteChange: 10, shareChange: -2, turnoutChange: 0 },
      { ...row, id: section.sectionId, label: section.cityName, section, regionId: undefined,
        current: { ...row.current, votes: 40, share: 53, turnout: 79 },
        previous: { ...row.current, votes: null, share: 50, turnout: 80 }, voteChange: null, shareChange: 3, turnoutChange: -1 },
    ];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const rows = element.querySelectorAll('tbody tr');
    expect(element.textContent).not.toContain('Национални резултати');
    expect(element.textContent).not.toContain('П.п. означава процентни пунктове');
    expect(rows[0].querySelector('th span')).toBeNull();
    expect(rows[0].querySelector('th button')?.textContent).toBe('01. Регион');
    expect(rows[1].querySelector('th span')?.textContent?.trim()).toBe(section.sectionId);
    expect(rows[0].children).toHaveLength(10);
    const headings = [...element.querySelectorAll('thead tr:last-child th')];
    expect(headings.map(heading => heading.textContent?.trim().split(/\s+/)[0])).toEqual([
      'Преди', 'Разлика', 'Сега', 'Преди', 'Разлика', 'Сега', 'Преди', 'Разлика', 'Сега',
    ]);
    expect(rows[0].children[1].textContent?.trim()).toBe('40');
    expect(rows[0].children[3].textContent).toContain('50');
    const changes = [...rows[0].querySelectorAll('[data-comparison-difference]')];
    expect(changes.map(cell => cell.getAttribute('data-leader'))).toEqual(['right', 'left', 'tie']);
    expect(changes[0]).toBe(rows[0].children[2]);
    expect(changes[1]).toBe(rows[0].children[5]);
    expect(changes[2]).toBe(rows[0].children[8]);
    expect(changes[0].textContent).toContain('+10');
    expect(changes[0].querySelector('[data-comparison-arrow]')?.textContent).toBe('→');
    expect(changes[1].textContent).toContain('-2,00 п.п.');
    expect(changes[1].querySelector('[data-comparison-arrow]')?.textContent).toBe('←');
    expect(changes[2].textContent).toContain('Равни');
    expect(changes[2].querySelector('[data-comparison-arrow]')).toBeNull();
    expect(rows[0].children[3].getAttribute('data-comparison-winner')).toBe('right');
    expect(rows[0].children[4].getAttribute('data-comparison-winner')).toBe('left');
    const missing = rows[1].querySelector('[data-comparison-difference]');
    expect(missing?.getAttribute('data-leader')).toBeNull();
    expect(missing?.textContent).toContain('Няма данни');
    expect(missing?.querySelector('[data-comparison-arrow]')).toBeNull();
    const selectRow = vi.spyOn(component, 'selectRow').mockImplementation(() => {});
    rows[1].querySelector<HTMLButtonElement>('th button')!.click();
    expect(selectRow).toHaveBeenCalledWith(component.rows[1]);
    const sortHeader = element.querySelector<HTMLElement>('th[aria-label="Сортирай по промяна: Дял"]')!;
    sortHeader.click(); fixture.detectChanges();
    expect(component.comparisonTable?.sortColumn()).toBe('shareChange');
    expect(sortHeader.getAttribute('aria-sort')).toBe('descending');
    const exportCsv = vi.spyOn(component, 'exportCsv').mockImplementation(() => {});
    const download = element.querySelector<HTMLButtonElement>('app-csv-export-button button');
    expect(download?.textContent?.trim()).toBe('Експорт CSV');
    expect(download?.title).toBe('Експорт CSV');
    expect(download?.querySelector('app-map-icon svg[aria-hidden="true"]')).not.toBeNull();
    download?.click();
    expect(exportCsv).toHaveBeenCalledOnce();
    component.rows = [];
    fixture.detectChanges();
    expect(download?.disabled).toBe(true);
    expect(element.querySelector('tbody td')?.getAttribute('colspan')).toBe('10');
  });

  it('renders history and comparison separately without reloading or invalidating the baseline', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('date', component.date);
    fixture.componentRef.setInput('parties', component.parties);
    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.detectChanges();
    await component.load();
    await fixture.whenStable();
    fixture.detectChanges();
    const load = vi.spyOn(component, 'load');
    const emit = vi.spyOn(component.comparisonChange, 'emit');
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('table')).toBeNull();
    const chart = element.querySelector('highcharts-chart');
    expect(chart).not.toBeNull();
    const download = element.querySelector<HTMLButtonElement>('button[aria-label="Изтегли графиката като PNG"]');
    expect(download).not.toBeNull();
    expect(download?.textContent?.trim()).toBe('');
    expect(download?.title).toBe('Изтегли графиката като PNG');
    expect(download?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(element.textContent).not.toContain('История и сравнение');
    fixture.componentRef.setInput('view', 'comparison');
    fixture.detectChanges();
    expect(element.querySelector('table')).not.toBeNull();
    expect(element.querySelector('highcharts-chart')).toBe(chart);
    expect(chart?.parentElement?.parentElement?.classList.contains('hidden')).toBe(true);
    expect(element.querySelector('app-csv-export-button button')).not.toBeNull();
    expect(element.textContent).not.toContain('Показател');
    expect(element.textContent).not.toContain('Дял спрямо страната');
    expect(load).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    fixture.componentRef.setInput('view', 'history');
    fixture.detectChanges();
    expect(element.querySelector('highcharts-chart')).toBe(chart);
  });

  it('updates only the comparison when its baseline input changes', async () => {
    const fixture = setup(undefined, true);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('date', component.date);
    fixture.componentRef.setInput('parties', component.parties);
    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.loading).toBe(false));
    fixture.detectChanges();
    const timeline = component.timeline;
    const options = component.chartOptions;
    const chart = fixture.nativeElement.querySelector('highcharts-chart');
    const load = vi.spyOn(component, 'load');
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData');
    fixture.componentRef.setInput('baselineDate', '2011.10.30');
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.comparisonLoading).toBe(false));
    fixture.detectChanges();
    expect(component.comparisonDate).toBe('2011.10.30');
    expect(component.rows).toHaveLength(1);
    expect(component.timeline).toBe(timeline);
    expect(component.chartOptions).toBe(options);
    expect(fixture.nativeElement.querySelector('highcharts-chart')).toBe(chart);
    expect(load).not.toHaveBeenCalled();
    expect(getAllData).not.toHaveBeenCalled();
  });

  it('reuses matched history for a party selection and ignores input echoes', async () => {
    const getSections = vi.fn(() => of([section]));
    const fixture = setup(getSections, true);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('date', component.date);
    fixture.componentRef.setInput('parties', { '1': 'Кандидат', '2': 'Друг кандидат' });
    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.componentRef.setInput('regionId', '01');
    fixture.componentRef.setInput('sections', [{ ...section, partyVotes: { ...section.partyVotes, '2': { total: 20, paper: 20, machine: 0 } } }]);
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.loading).toBe(false));
    fixture.detectChanges();
    const chart = fixture.nativeElement.querySelector('highcharts-chart');
    const load = vi.spyOn(component, 'load');
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData');
    const updateChart = vi.spyOn(component, 'updateChart');
    getSections.mockClear();
    component.selectParty('2');
    fixture.componentRef.setInput('selectedPartyId', '2');
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.comparisonLoading).toBe(false));
    fixture.detectChanges();
    expect(component.current).toMatchObject({ votes: 20, share: 25, electors: 100, turnout: 80 });
    expect(component.timeline[0].snapshot?.share).toBeNull();
    expect(getSections).not.toHaveBeenCalled();
    expect(getAllData).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(updateChart).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('highcharts-chart')).toBe(chart);
    component.metric = 'turnout';
    component.selectHistoryMetric();
    updateChart.mockClear();
    fixture.componentRef.setInput('historyMetric', 'turnout');
    fixture.detectChanges();
    expect(updateChart).not.toHaveBeenCalled();
    component.comparisonDate = '2011.10.30';
    await component.changeComparison();
    const timeline = component.timeline;
    fixture.componentRef.setInput('baselineDate', '2011.10.30');
    fixture.detectChanges();
    expect(component.timeline).toBe(timeline);
    expect(getAllData).not.toHaveBeenCalled();
  });

  it('finishes with the latest party when a selection changes during initial loading', async () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const service = TestBed.inject(ElectionService);
    const getAllData = service.getAllData.bind(service);
    const summaries = new Subject<Record<string, { regions: Region[]; parties: Record<string, string> }>>();
    vi.spyOn(service, 'getAllData').mockReturnValue(summaries);
    component.parties = { '1': 'Кандидат', '2': 'Друг кандидат' };
    const initial = component.load();
    component.selectParty('2');
    expect(component.loading).toBe(true);
    getAllData().subscribe(value => summaries.next(value));
    summaries.complete();
    await initial;
    await vi.waitFor(() => expect(component.loading).toBe(false));
    expect(component.activePartyId).toBe('2');
    expect(component.timeline).toHaveLength(3);
    expect(component.comparisonLoading).toBe(false);
  });

  it('keeps the national timeline when only map sections become available', async () => {
    const getSections = vi.fn(() => of([section]));
    const fixture = setup(getSections);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('date', component.date);
    fixture.componentRef.setInput('parties', component.parties);
    fixture.componentRef.setInput('selectedPartyId', '1');
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.loading).toBe(false));
    const timeline = component.timeline;
    const options = component.chartOptions;
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData');
    fixture.componentRef.setInput('sections', [section]);
    fixture.componentRef.setInput('parentSections', [section]);
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.comparisonLoading).toBe(false));
    expect(component.timeline).toBe(timeline);
    expect(component.chartOptions).toBe(options);
    expect(getSections).toHaveBeenCalledOnce();
    expect(getAllData).not.toHaveBeenCalled();
  });
});
