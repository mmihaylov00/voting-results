import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { Region, Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { RegionListComponent } from './region-list';

const section = (id: string, regionId: string): Section => ({
  sectionId: id, regionId, cityName: 'София', sectionName: '', sectionType: 'normal', settlementEkatte: id,
  total: 100, voted: 50, discardedVotes: 1, noVotes: 2, activityBp: 5000, partyVotes: {}, topParties: [],
});

describe('RegionList map scope', () => {
  let component: RegionListComponent;
  let response: Subject<Section[]>;
  let requests: number;
  let globalLoading: BehaviorSubject<boolean>;
  let queries: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    response = new Subject<Section[]>();
    requests = 0;
    globalLoading = new BehaviorSubject(false);
    queries = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [RegionListComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: of({}), queryParamMap: queries } },
        { provide: ThemeService, useValue: { darkMode: () => false } },
        { provide: ElectionService, useValue: {
          electionType: 'governmental', loading$: globalLoading, getDates: () => [], getOfficialNationalElectors: () => null,
          getRegions: () => of([]), getParties: () => of({}),
          getSections: () => { requests++; return response.asObservable(); },
        } },
      ],
    }).overrideComponent(RegionListComponent, { set: { template: '' } }).compileComponents();
    component = TestBed.createComponent(RegionListComponent).componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.date = '2026.04.19';
  });

  it('selects regions for the region list and preserves exploration while opening analysis', () => {
    expect(component.mapView()).toBe('regions');
    component.mapView.set('municipalities');
    component.setLeftPanel('history');
    expect(component.mapView()).toBe('municipalities');
    component.setLeftPanel('cards');
    expect(component.mapView()).toBe('regions');
  });

  it('opens an activity history point using its election type', () => {
    const dates = vi.spyOn(TestBed.inject(ElectionService), 'getDates').mockReturnValue([
      { date: '2026.10.25', name: 'Октомври 2026 - Тур 1', type: 'presidential', round: 1 },
    ]);

    component.changeAnalysisElection('2026.10.25');

    expect(dates).toHaveBeenCalledWith(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/presidential/election', '2026.10.25']);
  });

  it('opens a contestant profile with its full source identity without changing map scope', () => {
    component.partiesById = { '12': 'Пълно име на партията' };
    component.mapSelectedPartyId.set('2');
    component.openContestant('Кратко име', '12');
    expect(component.selectedContestant()).toEqual({ partyName: 'Пълно име на партията', partyId: '12' });
    expect(component.mapSelectedPartyId()).toBe('2');
    component.openContestant('Други', '0');
    expect(component.selectedContestant()?.partyId).toBe('12');
    expect(requests).toBe(0);
  });

  it('restores local tool tabs and preserves them on unrelated query changes', () => {
    component.ngOnInit();
    expect(component.overviewTabs.slice(-5).map(tab => tab.id)).toEqual(['comparison', 'risks', 'geography', 'polls', 'mandates']);
    queries.next(convertToParamMap({ panel: 'risks' }));
    expect(component.leftPanel()).toBe('risks');
    expect(component.widePanel).toBe(true);
    component.settlementMapMetric.set('invalid-votes');
    queries.next(convertToParamMap({ panel: 'risks', left: '2' }));
    expect(component.leftPanel()).toBe('risks');
    queries.next(convertToParamMap({ panel: 'comparison', comparison: 'parties' }));
    expect(component.leftPanel()).toBe('comparison');
    expect(component.comparisonMode()).toBe('parties');
    expect(component.widePanel).toBe(true);
    expect(component.settlementMapMetric()).toBe('invalid-votes');
    expect(requests).toBe(0);
  });

  it('shares pending map loads and applies the requested region when the data arrives', () => {
    component.focusAnalysisRegion('23');
    component.loadMapSectionsIfNeeded();
    expect(requests).toBe(1);
    const sofia = section('230000001', '23');
    response.next([sofia, section('240000001', '24')]);
    expect(component.mapSelection?.kind).toBe('region');
    expect(component.analysisSections).toEqual([sofia]);
    expect(component.totalVoted).toBe(50);
  });

  it('keeps the mobile map open when its content tab is reconciled with the URL', () => {
    component.ngOnInit();
    component.date = '2026.04.19';
    queries.next(convertToParamMap({ panel: 'stats' }));
    component.setOverviewMode('map');
    expect(component.leftPanel()).toBe('cards');
    queries.next(convertToParamMap({}));
    expect(component.overviewMode()).toBe('map');
    component.selectContentTab('cards');
    expect(component.overviewMode()).toBe('cards');
    expect(requests).toBe(1);
  });

  it('preserves a foreign selection made while the full map data is pending', () => {
    const abroad = section('320000001', '32');
    component.abroadSections = [abroad];
    component.loadMapSectionsIfNeeded();
    component.onMapSelection({ sectionIds: [abroad.sectionId], label: 'Мадрид', kind: 'city' });
    expect(component.totalVoted).toBe(50);
    response.next([abroad, section('230000001', '23')]);
    expect(component.analysisSections).toEqual([abroad]);
    component.clearMapSelection();
    expect(component.analysisSections?.length).toBe(2);
    expect(component.mapSelection).toBeNull();
  });



  it('keeps statistics populated and scoped after a map selection', () => {
    component.loadMapSectionsIfNeeded();
    const selected = { ...section('230000001', '23'), partyVotes: { '1': { total: 40, paper: 40, machine: 0 } } };
    response.next([selected, section('240000001', '24')]);
    component.onMapSelection({ sectionIds: [selected.sectionId], label: 'София', kind: 'settlement' });
    component.setLeftPanel('stats');
    expect(component.partyVotesMap).toEqual({ '1': 40 });
    expect(component.activityChartOptions.series?.[1]).toMatchObject({ type: 'column', data: [50] });
    expect(component.analysisSections).toEqual([selected]);
  });

  it('updates only the party chart when the statistics party filter changes', () => {
    component.regions = [{ id: '23', name: 'София', total: 100, voted: 50, partyVotes: { '1': 40, '2': 10 } }];
    component.allParties = [{ id: '1', name: 'Партия 1' }, { id: '2', name: 'Партия 2' }];
    component.selectedPartyIds.set(new Set(['1']));
    TestBed.tick();
    const activityOptions = component.activityChartOptions;
    const partyOptions = component.partyChartOptions;
    component.onPartySelectionChange(new Set(['2']));
    TestBed.tick();
    expect(component.activityChartOptions).toBe(activityOptions);
    expect(component.partyChartOptions).not.toBe(partyOptions);
    expect(component.partyChartOptions.series?.[0]).toMatchObject({ name: 'Партия 2', data: [20] });
    expect(requests).toBe(0);
  });

  it('keeps background history and map requests out of the page loading state', () => {
    const regions = new Subject<Region[]>();
    vi.spyOn(TestBed.inject(ElectionService), 'getRegions').mockReturnValue(regions);
    const states: boolean[] = [];
    const subscription = component.loading$.subscribe(loading => states.push(loading));
    globalLoading.next(true);
    component.loadMapSectionsIfNeeded();
    expect(states).toEqual([false]);
    component.loadRegions();
    expect(states.at(-1)).toBe(true);
    globalLoading.next(false);
    expect(states.at(-1)).toBe(true);
    regions.next([]);
    regions.complete();
    expect(states.at(-1)).toBe(false);
    subscription.unsubscribe();
  });

  it('loads analysis only after history, comparison, or change-map is requested', () => {
    expect(component.analysisVisited()).toBe(false);
    component.setLeftPanel('stats');
    expect(component.analysisVisited()).toBe(false);
    component.setLeftPanel('history');
    expect(component.analysisVisited()).toBe(true);
    component.setLeftPanel('cards');
    expect(component.analysisVisited()).toBe(true);
  });

  it('visits statistics charts lazily and retains them across tab changes', () => {
    expect(component.visitedCharts().size).toBe(0);
    component.setLeftPanel('stats');
    expect([...component.visitedCharts()]).toEqual(['activity']);
    component.setActiveChart('party');
    const charts = component.visitedCharts();
    component.setLeftPanel('cards');
    component.setLeftPanel('stats');
    component.setActiveChart('activity');
    expect(component.visitedCharts()).toBe(charts);
    expect([...charts]).toEqual(['activity', 'party']);
    expect(requests).toBe(0);
  });

  it('keeps the map indicator independent of content tabs without reloading its scope', () => {
    component.loadMapSectionsIfNeeded();
    response.next([section('230000001', '23')]);
    const places = component.settlementMapData;
    const scope = component.analysisSections;
    component.setSettlementMapMetric('invalid-votes');
    component.setLeftPanel('stats');
    component.setLeftPanel('history');
    component.setLeftPanel('comparison');
    component.setLeftPanel('cards');
    expect(component.settlementMapMetric()).toBe('invalid-votes');
    expect(component.analysisSections).toBe(scope);
    expect(component.settlementMapData).toBe(places);
    expect(requests).toBe(1);
  });

  it('reserves the map column for the list and restores it when following a place from analysis', () => {
    component.loadMapSectionsIfNeeded();
    const selected = section('230000001', '23');
    response.next([selected]);
    const places = component.settlementMapData;
    const scope = component.analysisSections;
    expect(component.widePanel).toBe(false);
    for (const panel of ['stats', 'history', 'comparison', 'risks', 'geography', 'polls', 'mandates'] as const) {
      component.setLeftPanel(panel);
      expect(component.widePanel).toBe(true);
    }
    component.focusAnalysisSection(selected);
    expect(component.leftPanel()).toBe('cards');
    expect(component.overviewMode()).toBe('map');
    expect(component.widePanel).toBe(false);
    expect(component.mapFocusSectionId).toBe(selected.sectionId);
    expect(component.settlementMapData).toBe(places);
    expect(component.analysisSections).toBe(scope);
    expect(requests).toBe(1);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { panel: null } }));
  });
});
