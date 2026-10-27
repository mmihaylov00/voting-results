import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHighcharts } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { provideRouter } from '@angular/router';

import { ElectionListComponent } from './election-list';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ContestantSummary, contestantIdentity } from '../../utils/contestant-profile.util';

describe('ElectionListComponent', () => {
  let component: ElectionListComponent;
  let fixture: ComponentFixture<ElectionListComponent>;
  let serviceLoading: BehaviorSubject<boolean>;

  beforeEach(async () => {
    serviceLoading = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [ElectionListComponent],
      providers: [
        provideRouter([]),
        provideHighcharts({
          instance: () => Promise.resolve(Highcharts as any),
        }),
        {
          provide: ElectionService,
          useValue: {
            electionType: 'governmental',
            loading$: serviceLoading,
            getDates: () => [],
            getOfficialNationalElectors: (date: string) => date === '2026.10.25' ? 6637238 : null,
            getAllData: () => of({
              '2024.10.27': { parties: { '1': 'ГЕРБ-СДС' }, regions: [] },
              '2023.04.02': { parties: { '1': 'БСП' }, regions: [] },
            }),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            darkMode: () => false,
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElectionListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps distinct historical selections when ballot numbers are reused', () => {
    expect(component.allParties.map(p => p.id)).toEqual(['ГЕРБ-СДС', 'БСП']);
    expect(component.selectedHistoricalPartyIds().size).toBe(2);
  });

  it('uses the latest election and selected region for historical party filter totals', () => {
    component.dates = [{ date: '2024.10.27', name: 'Октомври 2024' }, { date: '2023.04.02', name: 'Април 2023' }];
    component.allParties = [{ id: 'ПП-ДБ', name: 'ПП-ДБ' }, { id: 'ГЕРБ-СДС', name: 'ГЕРБ-СДС' }, { id: 'БСП', name: 'БСП' }];
    component.allData = {
      '2024.10.27': { parties: { '1': 'ПП-ДБ', '2': 'ГЕРБ-СДС' }, regions: [
        { id: '23', partyVotes: { '1': 40, '2': 10 } }, { id: '24', partyVotes: { '1': 10, '2': 70 } },
      ] },
      '2023.04.02': { parties: { '1': 'ГЕРБ-СДС', '2': 'БСП' }, regions: [{ partyVotes: { '1': 1000, '2': 2000 } }] },
    };
    expect(component.historicalPartyVotes).toEqual({ 'ПП-ДБ': 50, 'ГЕРБ-СДС': 80 });
    component.level.set('region'); component.selectedRegionId.set('23');
    expect(component.historicalPartyVotes).toEqual({ 'ПП-ДБ': 40, 'ГЕРБ-СДС': 10 });
    expect(component.allData['2023.04.02'].regions[0].partyVotes['2']).toBe(2000);
  });

  it('ranks categorical legends without moving historical series or plotted dates', () => {
    const ticket = 'Андрей Андреев Гюров и Десислава Иванова';
    component.dates = [{ date: '2026.10.25', name: 'Октомври 2026' }];
    component.allParties = [
      { id: 'a', name: 'Непозната А' }, { id: 'b', name: ticket }, { id: 'c', name: 'Други' },
    ];
    component.allData = {
      '2026.10.25': {
        parties: { a: 'Непозната А', b: ticket, c: 'Други' },
        regions: [{ voted: 100, partyVotes: { a: 60, b: 30, c: 10 } }],
      },
    };
    component.selectedHistoricalPartyIds.set(new Set(['a', 'b', 'c']));

    component.updateHistoricalCharts();

    for (const options of [component.chartOptions, component.percentChartOptions]) {
      expect(options).toMatchObject({
        xAxis: { categories: ['Октомври 2026'] },
        series: [
          { legendIndex: 1, data: [60] }, { legendIndex: 0, data: [30] }, { legendIndex: 2, data: [10] },
        ],
      });
    }
  });

  it('uses the published national electorate when reported protocols are incomplete', () => {
    const stats = component.calculateElectionStats([
      {id: '1', name: 'Район', total: 6712566, voted: 1524362, partyVotes: {}},
    ], {}, '2026.10.25');
    expect(stats.totalElectors).toBe(6637238);
    expect(stats.avgActivity).toBe(1524362 / 6637238);
  });

  it('preserves the original contestant name and ballot number for profile links', () => {
    const name = 'ПРОДЪЛЖАВАМЕ ПРОМЯНАТА-ДЕМОКРАТИЧНА БЪЛГАРИЯ';
    const stats = component.calculateElectionStats([
      { id: '23', name: 'София', total: 100, voted: 50, partyVotes: { '12': 40 } },
    ], { '12': name }, '2026.04.19');
    expect(stats.topParties[0]).toMatchObject({ partyId: '12', name });
    component.openContestant(name, stats.date, stats.topParties[0].partyId);
    expect(component.selectedContestant()).toEqual({ partyName: name, partyId: '12', date: '2026.04.19' });
    component.openContestant('Други', stats.date, '0');
    expect(component.selectedContestant()?.partyName).toBe(name);
  });

  it('opens a profile from the archive result name using that election and ballot ID', () => {
    const date = '2023.04.02';
    component.dates = [{ date, name: 'Април 2023' }];
    component.electionsData.set(date, component.calculateElectionStats([
      { id: '23', name: 'София', total: 100, voted: 50, partyVotes: { '12': 40 } },
    ], { '12': 'БСП' }, date));
    const open = vi.spyOn(component, 'openContestant').mockImplementation(() => {});
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[aria-label="Отвори профил: БСП"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(open).toHaveBeenCalledExactlyOnceWith('БСП', date, '12');
  });

  it('labels provisional archive cards before and after result data loads', () => {
    component.dates = [{ date: '2026.10.25', name: 'Октомври 2026', provisional: { processedPercent: 99.95 } }];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Предварителни - 99.95% протоколи');

    component.electionsData.set('2026.10.25', component.calculateElectionStats([], {}, '2026.10.25'));
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(element.textContent).toContain('Предварителни - 99.95% протоколи');

    component.dates = [{ date: '2026.10.25', name: 'Октомври 2026' }];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Предварителни');
  });

  it('updates historical charts without reloading archive cards or election data', () => {
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData');
    const cards = component.electionsData;
    const options = component.chartOptions;
    component.level.set('region');
    component.selectedRegionId.set('23');
    component.onHistoricalPartySelectionChange(new Set(['ГЕРБ-СДС']));
    fixture.detectChanges();
    expect(component.chartOptions).not.toBe(options);
    expect(component.electionsData).toBe(cards);
    expect(getAllData).not.toHaveBeenCalled();
  });

  it('keeps archive loading tied to its summary request instead of background modal requests', async () => {
    const response = new Subject<Record<string, ContestantSummary>>();
    vi.spyOn(TestBed.inject(ElectionService), 'getAllData').mockReturnValue(response);
    const states: boolean[] = [];
    const subscription = component.loading$.subscribe(value => states.push(value));
    const date = '2024.10.27';
    const summaries = { [date]: {
      parties: { '1': 'ГЕРБ-СДС' },
      regions: [{ id: '23', name: 'София', total: 100, voted: 50, partyVotes: { '1': 40 } }],
    } };
    component.dates = [{ date, name: 'Октомври 2024' }];
    component.loadAllElectionsData();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).not.toBeNull();
    serviceLoading.next(false);
    expect(states).toEqual([false, true]);

    response.next(summaries);
    response.complete();
    fixture.detectChanges();
    expect(states).toEqual([false, true, false]);
    expect(component.electionsData.get(date)?.totalVoted).toBe(50);
    expect(component.regions).toEqual([{ id: '23', name: 'София' }]);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull());
    const cards = component.electionsData;
    const chart = component.chartOptions;
    const update = vi.spyOn(component, 'updateHistoricalCharts');

    serviceLoading.next(true);
    fixture.detectChanges();
    serviceLoading.next(false);
    fixture.detectChanges();
    expect(states).toEqual([false, true, false]);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(component.electionsData).toBe(cards);
    expect(component.allData).toBe(summaries);
    expect(component.chartOptions).toBe(chart);
    expect(update).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('clears archive loading after failure and retries its own summary request', () => {
    const response = new Subject<Record<string, ContestantSummary>>();
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData').mockReturnValue(response);
    const states: boolean[] = [];
    const subscription = component.loading$.subscribe(value => states.push(value));
    component.loadAllElectionsData();
    response.error(new Error('Download failed'));
    fixture.detectChanges();
    expect(states).toEqual([false, true, false]);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Данните не могат да бъдат заредени.');

    getAllData.mockReturnValue(of({}));
    const retry = fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(getAllData).toHaveBeenCalledTimes(2);
    expect(component.loadError()).toBe('');
    expect(states).toEqual([false, true, false, true, false]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    subscription.unsubscribe();
  });
});

describe('Presidential historical trends', () => {
  let component: ElectionListComponent;
  let fixture: ComponentFixture<ElectionListComponent>;
  const dates = [
    { date: '2026.10.25', name: 'Октомври 2026 - Тур 1' },
    { date: '2021.11.21', name: 'Ноември 2021 - Тур 2' },
    { date: '2021.11.14', name: 'Ноември 2021 - Тур 1' },
    { date: '2016.11.13', name: 'Ноември 2016 - Тур 2' },
    { date: '2016.11.06', name: 'Ноември 2016 - Тур 1' },
  ];
  const summary = (parties: Record<string, string>, partyVotes: Record<string, number>): ContestantSummary => ({
    parties,
    regions: ['23', '24'].map(id => ({ id, name: id, total: 2000, voted: 1000, partyVotes })),
  });
  const summaries: Record<string, ContestantSummary> = {
    '2016.11.06': summary({
      '0': 'Други', '1': 'Кандидат Алфа и Партньор Алфа', '2': 'Кандидат Бета',
      '3': 'Кандидат Гама', '4': 'Кандидат Делта', '5': 'Кандидат Епсилон',
      '6': 'Кандидат Шести', '7': 'Кандидат Нулев',
    }, { '0': 10000, '1': 60, '2': 50, '3': 40, '4': 30, '5': 20, '6': 10, '7': 0 }),
    '2016.11.13': summary({
      '1': 'Кандидат Алфа и Партньор Алфа', '2': 'Кандидат Бета',
    }, { '1': 80, '2': 50 }),
    '2021.11.14': summary({
      '1': 'Кандидат Нов', '2': 'Кандидат Алфа и Партньор Бета', '3': 'Кандидат Бета',
      '4': 'Кандидат Гама', '5': 'Кандидат Делта', '6': 'Кандидат Друг',
    }, { '1': 60, '2': 50, '3': 40, '4': 30, '5': 20, '6': 10 }),
    '2021.11.21': summary({
      '1': 'Кандидат Нов', '2': 'Кандидат Алфа и Партньор Бета',
    }, { '1': 80, '2': 50 }),
    '2026.10.25': summary({
      '1': 'Кандидат Последен', '2': 'Кандидат Нов', '3': 'Кандидат Алфа и Партньор Гама',
      '4': 'Кандидат Гама', '5': 'Кандидат Друг', '6': 'Кандидат Делта', '7': 'Кандидат Нулев',
    }, { '1': 100, '2': 80, '3': 60, '4': 40, '5': 20, '6': 10, '7': 0 }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElectionListComponent],
      providers: [
        provideRouter([]),
        provideHighcharts({ instance: () => Promise.resolve(Highcharts as any) }),
        { provide: ThemeService, useValue: { darkMode: () => false } },
        {
          provide: ElectionService,
          useValue: {
            electionType: 'presidential', loading$: of(false), getDates: () => dates,
            getAllData: () => of(summaries), getOfficialNationalElectors: () => null,
            getRegions: (date: string) => of(summaries[date].regions),
            getParties: (date: string) => of(summaries[date].parties),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ElectionListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('selects the top five from every election and combines running-mate changes', () => {
    expect(component.allParties.map(party => party.id).sort()).toEqual([
      'Кандидат Алфа', 'Кандидат Бета', 'Кандидат Гама', 'Кандидат Делта',
      'Кандидат Епсилон', 'Кандидат Нов', 'Кандидат Последен', 'Кандидат Друг',
    ].map(name => contestantIdentity(name, 'presidential')).sort());
    expect(component.selectedHistoricalPartyIds()).toEqual(new Set(component.allParties.map(party => party.id)));
    expect(component.historicalPartyVotes[contestantIdentity('Кандидат Алфа', 'presidential')]).toBe(120);
  });

  it('shows all five rounds chronologically with only each round’s top finishers', () => {
    for (const options of [component.chartOptions, component.percentChartOptions]) {
      expect(options.xAxis).toMatchObject({ categories: [...dates].reverse().map(date => date.name) });
      const series = options.series as Highcharts.SeriesLineOptions[];
      expect(dates.map((_, index) => series.filter(item => item.data![index] !== null).length)).toEqual([5, 2, 5, 2, 5]);
    }
    const series = component.chartOptions.series as Highcharts.SeriesLineOptions[];
    expect(series.find(item => item.name === 'Кандидат Алфа')?.data).toEqual([120, 160, 100, 100, 120]);
    expect(series.find(item => item.name === 'Кандидат Последен')?.data).toEqual([null, null, null, null, 200]);
    expect(series.find(item => item.name === 'Кандидат Друг')?.data).toEqual([null, null, null, null, 40]);
    expect(series.find(item => item.name === 'Кандидат Делта')?.data).toEqual([60, null, 40, null, null]);
    const percentSeries = component.percentChartOptions.series as Highcharts.SeriesLineOptions[];
    expect(percentSeries.find(item => item.name === 'Кандидат Алфа')?.data).toEqual([6, 8, 5, 5, 6]);
  });

  it('keeps regional values and candidate filtering local without loading data again', () => {
    const getAllData = vi.spyOn(TestBed.inject(ElectionService), 'getAllData');
    component.level.set('region');
    component.selectedRegionId.set('23');
    component.onHistoricalPartySelectionChange(new Set(['Кандидат Алфа', 'Кандидат Епсилон']
      .map(name => contestantIdentity(name, 'presidential'))));
    fixture.detectChanges();
    const series = component.chartOptions.series as Highcharts.SeriesLineOptions[];
    expect(series).toHaveLength(2);
    expect(series.find(item => item.name === 'Кандидат Алфа')?.data).toEqual([60, 80, 50, 50, 60]);
    expect(series.find(item => item.name === 'Кандидат Епсилон')?.data).toEqual([20, null, null, null, null]);
    expect(component.historicalPartyVotes[contestantIdentity('Кандидат Алфа', 'presidential')]).toBe(60);

    component.selectedRegionId.set('99');
    fixture.detectChanges();
    expect((component.chartOptions.series as Highcharts.SeriesLineOptions[]).every(item => item.data?.every(value => value === null))).toBe(true);
    expect(getAllData).not.toHaveBeenCalled();
  });
});
