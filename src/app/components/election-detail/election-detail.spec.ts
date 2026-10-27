import { SelectComponent } from '../ui/select/select';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';

import { ElectionDetailComponent } from './election-detail';
import { ElectionService } from '../../services/election';
import { ThemeService } from '../../services/theme.service';
import { ElectionType } from '../../utils/election-type';
import { ModalPageService } from '../../services/modal-page.service';
import { RegionCandidate, Section, SectionDetails } from '../../models/election.models';
import { decodeElectionViewState, encodeElectionViewState } from '../../utils/election-view-state';
import { SettlementMapComponent } from '../ui/settlement-map/settlement-map';
import { AbroadMapComponent } from '../ui/abroad-map/abroad-map';
import { ExportCsvModalComponent } from './modals/export-csv-modal/export-csv-modal';

describe('ElectionDetailComponent', () => {
  let component: ElectionDetailComponent;
  let fixture: ComponentFixture<ElectionDetailComponent>;
  let electionType: ElectionType;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let serviceLoading: BehaviorSubject<boolean>;

  beforeEach(async () => {
    electionType = 'governmental';
    routeParams = new BehaviorSubject(convertToParamMap({}));
    serviceLoading = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [ElectionDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            paramMap: routeParams,
            data: of({}),
            queryParams: of({}),
            queryParamMap: of(convertToParamMap({})),
            snapshot: { paramMap: { get: () => null } },
          },
        },
        {
          provide: ElectionService,
          useValue: {
            get electionType() { return electionType; },
            loading$: serviceLoading,
            getDates: () => [{ date: '2016.11.13', name: 'Тур 2', type: electionType }],
            getDateName: () => '',
            getAllFullData: () => of({}),
            getParties: () => of({ '1': 'Партия' }),
            getSections: vi.fn(() => of([])),
          },
        },
        {
          provide: ThemeService,
          useValue: {
            darkMode: () => false,
          },
        },
      ],
    }).overrideComponent(ElectionDetailComponent, {
      remove: { imports: [SettlementMapComponent, AbroadMapComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElectionDetailComponent);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reports the clipboard result for share feedback and keeps fallback messages on failure', async () => {
    const router = TestBed.inject(Router);
    const tree = router.parseUrl('/governmental/election/2026.04.19/region/23');
    vi.spyOn(router, 'createUrlTree').mockReturnValue(tree);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const copy = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await component.shareView()).toBe(true);
      expect(copy).toHaveBeenCalledWith(expect.stringContaining('/governmental/election/2026.04.19/region/23'));
      expect(component.shareMessage()).toBe('');
      copy.mockRejectedValueOnce(new Error('Clipboard unavailable'));
      expect(await component.shareView()).toBe(false);
      expect(component.shareMessage()).toContain('Копирайте адреса от браузъра');
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      log.mockRestore();
    }
  });

  it('opens contestant profiles without changing section selection or preference state', () => {
    component.allParties = [{ id: '12', name: 'Пълно име на партията' }];
    component.isModalOpen.set(true);
    component.openContestant('Кратко име', '12');
    expect(component.selectedContestant()).toEqual({ partyName: 'Пълно име на партията', partyId: '12' });
    expect(component.isModalOpen()).toBe(true);
    expect(component.isCandidateModalOpen()).toBe(false);
    component.handleEscape();
    expect(component.isModalOpen()).toBe(true);
    component.openContestant('Други', '0');
    expect(component.selectedContestant()?.partyId).toBe('12');
  });

  it('keeps accessible preference and party profile buttons separate from row clicks', () => {
    const candidate: RegionCandidate = {
      candidateId: '102', candidateName: 'Иван Петров', partyId: '12', partyName: 'Партия',
      total: 10, paper: 6, machine: 4, totalInRegion: 10, partyPercentInRegion: 5,
      preferencePercentOfPartyVotes: 20,
    };
    component.viewMode.set('candidates');
    component.filteredCandidates = [candidate];
    component.visibleCandidateColumns.set(new Set(['candidateName', 'partyName']));
    const open = vi.spyOn(component, 'openCandidateModal').mockImplementation(() => {});
    const openParty = vi.spyOn(component, 'openContestant').mockImplementation(() => {});
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[aria-label="Отвори профил: Иван Петров"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.type).toBe('button');
    expect(button.closest('[title]')).toBeNull();
    button.click();
    expect(open).toHaveBeenCalledExactlyOnceWith(candidate);
    const partyButton = fixture.nativeElement.querySelector('button[aria-label="Отвори профил: Партия"]') as HTMLButtonElement;
    expect(partyButton).not.toBeNull();
    expect(partyButton.type).toBe('button');
    expect(partyButton.closest('[title]')).toBeNull();
    partyButton.click();
    expect(openParty).toHaveBeenCalledExactlyOnceWith(candidate.partyName, candidate.partyId);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps repeating risks next to comparison and national tools off regional pages', () => {
    expect(component.contentTabs.slice(-4).map(tab => tab.id)).toEqual(['risks', 'geography', 'polls', 'mandates']);
    component.regionId = '23';
    expect(component.contentTabs.slice(-2).map(tab => tab.id)).toEqual(['comparison', 'risks']);
    electionType = 'presidential'; component.regionId = '';
    expect(component.contentTabs.slice(-2).map(tab => tab.id)).toEqual(['comparison', 'risks']);
    expect(component.contentTabs.some(tab => tab.id === 'candidates')).toBe(false);
  });

  it('opens linked tool tabs without reloading election data or changing the map indicator', () => {
    component.regionId = '23';
    component['sectionsReady'] = true; component['partiesReady'] = true;
    component.setSettlementMapMetric('invalid-votes');
    component['pendingViewParams'] = { panel: 'risks' };
    component['restoreSharedView']();
    expect(component.leftPanel()).toBe('risks');
    expect(component.widePanel).toBe(true);
    component['pendingViewParams'] = { panel: 'risks', agency: 'a' };
    component['restoreSharedView']();
    expect(component.leftPanel()).toBe('risks');
    expect(component.settlementMapMetric()).toBe('invalid-votes');
    expect(TestBed.inject(ElectionService).getSections).not.toHaveBeenCalled();
    component['pendingViewParams'] = { panel: 'geography' };
    component['restoreSharedView']();
    expect(component.leftPanel()).toBe('results');
  });

  it('visits statistics charts lazily and retains selection without reloading or recalculating data', () => {
    expect(component.visitedCharts().size).toBe(0);
    component.setLeftPanel('stats');
    expect([...component.visitedCharts()]).toEqual(['votes']);
    const options = [component.regionalChartOptions, component.ppdbChartOptions, component.activityChartOptions];
    const scope = component.analysisSections;
    const map = component.settlementMapData;
    const filter = vi.spyOn(component, 'applyFilter');

    component.setActiveChart('ppdb');
    component.setActiveChart('activity');
    const charts = component.visitedCharts();
    component.setViewMode('sections');
    component.setLeftPanel('stats');

    expect(component.activeChart()).toBe('activity');
    expect(component.visitedCharts()).toBe(charts);
    expect([...charts]).toEqual(['votes', 'ppdb', 'activity']);
    expect(component.regionalChartOptions).toBe(options[0]);
    expect(component.ppdbChartOptions).toBe(options[1]);
    expect(component.activityChartOptions).toBe(options[2]);
    expect(component.analysisSections).toBe(scope);
    expect(component.settlementMapData).toBe(map);
    expect(filter).not.toHaveBeenCalled();
    expect(TestBed.inject(ElectionService).getSections).not.toHaveBeenCalled();
  });

  it('selects each statistics subtab and hides parliamentary charts for presidential elections', async () => {
    component.setLeftPanel('stats');
    await fixture.whenStable();
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Статистически графики"]') as HTMLElement;
    const buttons = Array.from(nav.querySelectorAll('button'));
    expect(buttons.map(button => button.textContent?.trim())).toEqual([
      'Разпределение на гласовете', 'Секции по категории (ПП-ДБ)', 'Активност по секции',
    ]);
    buttons[2].click();
    await fixture.whenStable();
    expect(component.activeChart()).toBe('activity');
    expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);

    electionType = 'presidential';
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(Array.from(nav.querySelectorAll('button')).map(button => button.textContent?.trim())).toEqual([
      'Разпределение на гласовете', 'Активност по секции',
    ]);
  });

  it('avoids repeating the section filter when archive loading completes', () => {
    const history = new Subject<{}>();
    vi.spyOn(TestBed.inject(ElectionService), 'getAllFullData').mockReturnValue(history);
    component.ngOnInit();
    component.sections = [{} as Section];
    const filter = vi.spyOn(component, 'applyFilter').mockImplementation(() => {});
    history.next({});
    expect(filter).not.toHaveBeenCalled();
    component.viewMode.set('candidates');
    history.next({});
    expect(filter).toHaveBeenCalledOnce();
    history.complete();
  });

  it('keeps full candidate preference totals and computes historical comparisons in one pass', async () => {
    const section: Section = {
      sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: '', sectionType: 'City',
      total: 100, voted: 50, discardedVotes: 0, noVotes: 0, activityBp: 5000, topParties: [],
      partyVotes: { '1': { total: 40, paper: 30, machine: 10 } },
      candidateVotes: {
        '1_101': { candidateId: '101', candidateName: 'Един', partyId: '1', partyName: 'Партия', total: 15, paper: 10, machine: 5 },
        '1_102': { candidateId: '102', candidateName: 'Друг', partyId: '1', partyName: 'Партия', total: 5, paper: 5, machine: 0 },
      },
    };
    const historyVotes = vi.fn(() => section.candidateVotes);
    component.date = '2026.04.19';
    component.regionId = '23';
    component.sections = [section, { ...section, sectionId: '230000002' }];
    component.allData = {
      '2024.10.27': {
        sections: [{ ...section, get candidateVotes() { return historyVotes(); } }],
        parties: { '1': 'Партия' }, regions: [],
      },
    };

    component.calculateRegionCandidates();
    await fixture.whenStable();
    expect(component.regionCandidates.map(candidate => candidate.total)).toEqual([30, 10]);
    expect(component.regionCandidates.map(candidate => candidate.preferencePercentOfPartyVotes)).toEqual([75, 25]);
    expect(component.regionCandidates.map(candidate => candidate.comparisons)).toEqual([
      [{ d: '2024.10.27', v: 15 }], [{ d: '2024.10.27', v: 5 }],
    ]);
    expect(historyVotes).toHaveBeenCalledOnce();
  });

  it('virtualizes both tables while retaining every matching row for CSV export', async () => {
    const sections: Section[] = Array.from({ length: 13000 }, (_, index) => ({
      sectionId: String(index), regionId: '23', cityName: 'София', sectionName: 'Училище', sectionType: 'City',
      total: 100, voted: 50, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 5000,
    }));
    component.filteredSections = sections;
    component.visibleColumns.set(new Set(['sectionId']));
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('tr[data-virtual-index]').length).toBeLessThan(40);
    expect(component.currentRowCount).toBe(13000);
    component.openExportModal();
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(ExportCsvModalComponent)).componentInstance.tableSections).toBe(sections);
    component.closeExportModal();

    const candidates: RegionCandidate[] = sections.map((section, index) => ({
      candidateId: section.sectionId, candidateName: `Кандидат ${index}`, partyId: '1', partyName: 'Партия',
      paper: 10, machine: 0, total: 10, totalInRegion: 10, partyPercentInRegion: 10, preferencePercentOfPartyVotes: 10,
    }));
    component.filteredCandidates = candidates;
    component.visibleCandidateColumns.set(new Set(['candidateId']));
    component.viewMode.set('candidates');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('tr[data-virtual-index]').length).toBeLessThan(40);
    expect(component.currentRowCount).toBe(13000);
    component.openExportModal();
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(ExportCsvModalComponent)).componentInstance.filteredCandidates).toBe(candidates);
  });

  it('restores a shared place, filters and map level after data is ready', () => {
    const section: Section = {
      sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: 'Училище', sectionType: 'City',
      total: 100, voted: 50, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 5000,
    };
    const state = decodeElectionViewState(JSON.stringify({
      view: 'cities', panel: 'history', mapLevel: 'neighborhoods', search: 'Училище', parties: ['1', 'toString'],
      party: '__proto__', categories: ['R1'], activity: 80, columns: ['sectionId', 'bogus'],
      selection: { kind: 'settlement', label: 'София', sectionIds: '230000001,999999999' },
    }))!;
    component.date = '2016.11.13';
    component.sections = [section];
    component.analysisParties = { '1': 'Партия' };
    component['pendingViewParams'] = { analysis: encodeElectionViewState(state), metric: 'activity' };
    component['restoreSharedView']();
    expect(component.searchTerm).toBe('');
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['restoreSharedView']();
    expect(component.searchTerm).toBe('Училище');
    expect(component.leftPanel()).toBe('history');
    expect(component.mapView()).toBe('neighborhoods');
    expect(component.settlementMapMetric()).toBe('activity');
    expect(component.selectedPartyIds).toEqual(new Set(['1']));
    expect(component.mapSelectedPartyId()).toBeNull();
    expect(component.visibleColumns()).toEqual(new Set(['sectionId']));
    expect(component.mapSelection?.sectionIds).toEqual(['230000001']);
  });

  it('opens individual sections from a grouped view and ignores cancelled detail responses', () => {
    const section = { sectionId: '230000001', regionId: '23' } as Section;
    const details: SectionDetails = { sectionId: section.sectionId, cityName: 'София', sectionName: 'Училище', partyResults: [] };
    const response = new Subject<SectionDetails>();
    const service = TestBed.inject(ElectionService);
    service.getSectionDetails = vi.fn(() => response);
    component.groupByMode.set('city');
    component.loadSectionDetails(section);
    component.closeModal();
    response.next(details);
    expect(component.isModalOpen()).toBe(false);
    component.loadSectionDetails(section);
    response.next(details);
    expect(component.currentSectionData).toBe(section);
    expect(component.selectedSection).toBe(details);
    expect(component.isModalOpen()).toBe(true);
    response.complete();
  });

  it('restores legacy and shared indicator links on the map', () => {
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['pendingViewParams'] = { metric: 'below-threshold' };
    component['restoreSharedView']();
    expect(component.leftPanel()).toBe('results');
    expect(component.mobileMapVisible()).toBe(true);
    expect(component.settlementMapMetric()).toBe('below-threshold');
    const shared = encodeElectionViewState(component['captureViewState']());
    component.setSettlementMapMetric('activity');
    component['pendingViewParams'] = { analysis: shared, metric: 'below-threshold' };
    component['restoredViewVersion'] = -1;
    component['restoreSharedView']();
    expect(component.settlementMapMetric()).toBe('below-threshold');
    expect(component.leftPanel()).toBe('results');
  });

  it('does not restore parliamentary-only indicators on a presidential election', () => {
    electionType = 'presidential';
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['pendingViewParams'] = { metric: 'below-threshold' };
    component['restoreSharedView']();
    expect(component.leftPanel()).toBe('results');
    expect(component.settlementMapMetric()).toBe('leading-party');
  });

  it('hides navigation when there is only one available content tab', async () => {
    vi.spyOn(component, 'contentTabs', 'get').mockReturnValue([{ id: 'sections', label: 'Секции', icon: 'section' }]);
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('nav[aria-label="Изглед на резултатите"]')).toBeNull();
  });

  it('keeps map geography aligned with result tabs and preserves it across analysis and mobile tabs', () => {
    component.selectContentTab('municipalities');
    expect(component.mapView()).toBe('municipalities');
    component.setLeftPanel('history');
    expect(component.mapView()).toBe('municipalities');
    component.mapView.set('regions');
    component.selectContentTab('cities');
    expect(component.mapView()).toBe('cities');
    component.setViewMode('map');
    expect(component.mapView()).toBe('cities');
    expect(component.mobileMapVisible()).toBe(true);
    component.selectContentTab('sections');
    expect(component.mapView()).toBe('sections');
  });

  it('keeps the map selector and its selection independent of content tabs without fetching data', async () => {
    const requests = TestBed.inject(ElectionService).getSections;
    vi.mocked(requests).mockClear();
    component.setSettlementMapMetric('invalid-votes');
    component.selectContentTab('cities');
    component.setLeftPanel('history');
    component.setLeftPanel('comparison');
    component.setLeftPanel('stats');
    component.setViewMode('map');
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.settlementMapMetric()).toBe('invalid-votes');
    const select = fixture.debugElement.query(By.css('app-map-metric-controls app-select')).componentInstance as SelectComponent;
    expect(select.value()).toBe('invalid-votes');
    expect(fixture.nativeElement.querySelector('app-election-metrics')).toBeNull();
    expect(requests).not.toHaveBeenCalled();
  });



  it('shows an icon beside every content tab label', () => {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('nav[aria-label="Изглед на резултатите"] button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.every(button => button.querySelector('svg[aria-hidden="true"]'))).toBe(true);
  });

  it('keeps filtered sections, map aggregates and statistics in the same scope across view changes', () => {
    const section = (sectionId: string, cityName: string, voted: number): Section => ({
      sectionId, regionId: '23', cityName, sectionName: cityName, settlementEkatte: sectionId,
      sectionType: 'normal', total: 100, voted, discardedVotes: 2, noVotes: 1, activityBp: voted * 100,
      partyVotes: { '1': { total: voted - 3, paper: voted - 3, machine: 0 } }, topParties: [],
    });
    component.regionId = '23';
    component.sections = [section('00001', 'София', 50), section('00002', 'Варна', 25)];
    component.searchTerm = '00001';
    component.setViewMode('cities');
    component.setViewMode('map');
    expect(component.analysisSections.map(section => section.sectionId)).toEqual(['00001']);
    expect(component.viewMode()).toBe('sections');
    expect(component.mobileMapVisible()).toBe(true);
    expect(component.filteredSections).toEqual(component.analysisSections);
    expect(component.settlementMapData.flatMap(place => place.sections)).toEqual(component.analysisSections);
    expect(component.totalVoted).toBe(50);
    expect(component.totalInvalid).toBe(2);

    component.onMapSelection({ sectionIds: ['00002'], label: 'Варна', kind: 'settlement' });
    expect(component.analysisSections).toEqual([]);
    expect(component.settlementMapData).toEqual([]);
    expect(component.totalVoted).toBe(0);
    component.clearMapSelection();
    expect(component.totalVoted).toBe(50);
  });

  it('shows the map only with the section list and uses the full width for other tabs', () => {
    expect(component.widePanel).toBe(false);
    for (const tab of component.contentTabs) {
      component.selectContentTab(tab.id);
      expect(component.widePanel).toBe(tab.id !== 'sections');
    }
    component.setLeftPanel('history');
    const section: Section = { sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: '',
      sectionType: 'City', total: 100, voted: 50, discardedVotes: 0, noVotes: 0,
      partyVotes: {}, topParties: [], activityBp: 5000 };
    component.focusAnalysisSection(section);
    expect(component.leftPanel()).toBe('results');
    expect(component.viewMode()).toBe('sections');
    expect(component.widePanel).toBe(false);
    expect(component.mapFocusSectionId).toBe(section.sectionId);
    expect(component.mobileMapVisible()).toBe(true);
  });

  it('keeps analysis and map data stable when only table grouping or sorting changes', () => {
    component.regionId = '23';
    component.analysisParties = { '1': 'Партия' };
    component.allParties = [{ id: '1', name: 'Партия' }];
    component.sections = ['230000002', '230000001'].map((sectionId, index) => ({
      sectionId, regionId: '23', cityName: index ? 'Варна' : 'София', sectionName: 'Училище',
      sectionType: 'City', total: 100, voted: 50, discardedVotes: 0, noVotes: 0, activityBp: 5000,
      partyVotes: { '1': { total: 50, paper: 50, machine: 0 } }, topParties: [],
    }));
    component.applyFilter();
    const scope = component.analysisSections;
    const map = component.settlementMapData;
    component.sortSections('cityName');
    component.setViewMode('cities');
    component.setViewMode('municipalities');
    component.setViewMode('sections');
    expect(component.analysisSections).toBe(scope);
    expect(component.settlementMapData).toBe(map);
    expect(component.analysisSections.map(section => section.sectionId)).toEqual(['230000002', '230000001']);

    const filter = vi.spyOn(component, 'applyFilter');
    component.setViewMode('sections');
    component.setLeftPanel('history');
    component.setLeftPanel('comparison');
    component.setLeftPanel('stats');
    expect(filter).not.toHaveBeenCalled();
    expect(component.analysisSections).toBe(scope);
    expect(component.settlementMapData).toBe(map);

    component.searchTerm = '230000001';
    component.applyFilter();
    expect(component.analysisSections).not.toBe(scope);
    expect(component.settlementMapData).not.toBe(map);
    expect(component.analysisSections.map(section => section.sectionId)).toEqual(['230000001']);
  });

  it('loads a date and region only when their route values change', () => {
    const getSections = TestBed.inject(ElectionService).getSections;
    routeParams.next(convertToParamMap({ date: '2016.11.13', regionId: '23' }));
    expect(getSections).toHaveBeenCalledOnce();
    routeParams.next(convertToParamMap({ date: '2016.11.13', regionId: '23', unrelated: 'value' }));
    expect(getSections).toHaveBeenCalledOnce();
    routeParams.next(convertToParamMap({ date: '2016.11.13', regionId: '24' }));
    expect(getSections).toHaveBeenCalledTimes(2);
  });

  it('updates shared history controls without restoring unrelated filters or reopening a closed section', () => {
    const state = decodeElectionViewState(JSON.stringify({ search: 'Споделен филтър' }))!;
    component.date = '2016.11.13';
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['pendingViewParams'] = { analysis: encodeElectionViewState(state), section: '230000001' };
    component.sections = [{ sectionId: '230000001' } as Section];
    const filter = vi.spyOn(component, 'applyFilter').mockImplementation(() => {});
    const details = vi.spyOn(component, 'loadSectionDetails').mockImplementation(() => {});
    component['restoreSharedView']();
    expect(filter).toHaveBeenCalledOnce();
    expect(details).toHaveBeenCalledOnce();
    component.searchTerm = 'Локална промяна';
    filter.mockClear();
    details.mockClear();

    component['pendingViewParams'] = { ...component['pendingViewParams'], historyMetric: 'turnout' };
    component['restoreSharedView']();
    expect(component.historyMetric).toBe('turnout');
    expect(component.searchTerm).toBe('Локална промяна');
    expect(filter).not.toHaveBeenCalled();
    expect(details).not.toHaveBeenCalled();
  });

  it('restores expanded section and grouped details only after their scope is ready', () => {
    const section = { sectionId: '230000001' } as Section;
    const group = { sectionId: '1', cityName: 'София', sections: [section] };
    component.sections = [section];
    component.groupedSections = [group];
    component['pendingViewParams'] = { dialog: 'section', section: section.sectionId };
    const details = vi.spyOn(component, 'loadSectionDetails').mockImplementation(() => {});
    component['restoreSharedView']();
    expect(details).not.toHaveBeenCalled();
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['restoreSharedView']();
    expect(details).toHaveBeenLastCalledWith(section);
    component['pendingViewParams'] = { dialog: 'section', group: section.sectionId };
    component['restoreSharedView']();
    expect(details).toHaveBeenLastCalledWith(group);
    component['pendingViewParams'] = { dialog: 'section', group: 'missing' };
    component['restoreSharedView']();
    expect(details).toHaveBeenCalledTimes(2);
  });

  it('restores expanded candidates by party and ballot, including candidates outside the active table filters', () => {
    const first = { partyId: '1', candidateId: '101', candidateName: 'Първи' } as RegionCandidate;
    const selected = { partyId: '2', candidateId: '101', candidateName: 'Втори' } as RegionCandidate;
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component.filteredCandidates = [];
    const candidates = vi.spyOn(component, 'calculateRegionCandidates').mockImplementation(() => {
      component.regionCandidates = [first, selected];
    });
    component['pendingViewParams'] = { dialog: 'candidate', candidate: '2_101' };
    component['restoreSharedView']();
    expect(candidates).toHaveBeenCalledOnce();
    expect(component.selectedCandidate).toBe(selected);
    expect(component.isCandidateModalOpen()).toBe(true);
    component['pendingViewParams'] = { dialog: 'candidate', candidate: 'unknown' };
    component['restoreSharedView']();
    expect(component.selectedCandidate).toBeNull();
    expect(component.isCandidateModalOpen()).toBe(false);
    expect(candidates).toHaveBeenCalledOnce();
  });

  it.each([
    ['export', 'isExportModalOpen'], ['protocol-errors', 'isErrorModalOpen'],
  ] as const)('restores the expanded %s view without reopening it for unrelated URL updates', (dialog, flag) => {
    component['sectionsReady'] = true;
    component['partiesReady'] = true;
    component['pendingViewParams'] = { dialog };
    component['restoreSharedView']();
    expect(component[flag]()).toBe(true);
    component[flag].set(false);
    component['pendingViewParams'] = { dialog, historyMetric: 'turnout' };
    component['restoreSharedView']();
    expect(component[flag]()).toBe(false);
  });

  it('captures the expanded view scope when opening a candidate from a section page', () => {
    const pages = TestBed.inject(ModalPageService);
    const open = vi.spyOn(pages, 'open').mockResolvedValue(true);
    vi.spyOn(pages, 'isActive').mockReturnValue(true);
    component.searchTerm = 'Училище';
    const candidate = { partyId: '2', candidateId: '101' } as RegionCandidate;
    component.onSectionCandidateClick(candidate);
    expect(open).toHaveBeenLastCalledWith('candidate', expect.objectContaining({ candidate: '2_101', section: null }));
    const params = open.mock.calls[0][1]!;
    expect(decodeElectionViewState(params['analysis'])?.search).toBe('Училище');
  });

  it('shows page loading only for its own election request', async () => {
    let loading: boolean | undefined;
    const subscription = component.loading$.subscribe(value => { loading = value; });
    serviceLoading.next(true);
    await fixture.whenStable();
    expect(loading).toBe(false);
    component.isProcessingData.set(true);
    await fixture.whenStable();
    expect(loading).toBe(true);
    component.isProcessingData.set(false);
    await fixture.whenStable();
    expect(loading).toBe(false);
    subscription.unsubscribe();
  });

  it('creates analysis only when opened and keeps it mounted when switching panels', async () => {
    component.sections = [{
      sectionId: '230000001', regionId: '23', cityName: 'София', sectionName: 'Училище', sectionType: 'City',
      total: 100, voted: 50, discardedVotes: 0, noVotes: 0, partyVotes: {}, topParties: [], activityBp: 5000,
    }];
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-election-analysis')).toBeNull();
    component.setLeftPanel('history');
    await fixture.whenStable();
    const analysis = fixture.nativeElement.querySelector('app-election-analysis');
    expect(analysis).not.toBeNull();
    component.setLeftPanel('stats');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-election-analysis')).toBe(analysis);
    component.setLeftPanel('comparison');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-election-analysis')).toBe(analysis);
  });

  for (const type of ['governmental', 'presidential'] as ElectionType[]) {
    it(`matches abroad history by ${type} identity instead of ballot number`, () => {
      electionType = type;
      const currentName = type === 'presidential' ? 'Румен Радев и Илияна Йотова' : 'ГЕРБ-СДС';
      const oldName = type === 'presidential' ? currentName : 'ПП ГЕРБ';
      component.date = '2021.11.21';
      component.allParties = [{ id: '6', name: currentName }, { id: '17', name: 'Друг кандидат' }];
      component.allData = {
        '2016.11.13': {
          regions: [],
          parties: { '13': oldName, '17': 'Цецка Цачева и Пламен Манушев' },
          sections: [{
            sectionId: '320000001', regionId: '32', municipalityName: 'Испания',
            cityName: 'Мадрид', sectionName: 'Секция', sectionType: 'Other',
            total: 200, voted: 100, discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 5000,
            partyVotes: { '13': { total: 60, paper: 60, machine: 0 }, '17': { total: 40, paper: 40, machine: 0 } },
          }],
        },
      };

      const result = component['buildAbroadCountryComparisons']('Испания');

      expect(result.partyComparisons).toEqual({ '6': [{ d: '2016.11.13', v: 60 }] });
      expect(result.comparisons['voted']).toEqual([{ d: '2016.11.13', v: 100 }]);
    });
  }
});
