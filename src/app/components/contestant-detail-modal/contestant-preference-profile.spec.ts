import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HighchartsChartComponent } from 'highcharts-angular';
import { of, Subject, throwError } from 'rxjs';
import { RegionCandidate, Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ModalPageService } from '../../services/modal-page.service';
import { SettlementMapDataService } from '../../services/settlement-map-data.service';
import { ThemeService } from '../../services/theme.service';
import { ContestantDetailModalComponent } from './contestant-detail-modal';

@Component({ selector: 'highcharts-chart', standalone: true, template: '' })
class ChartStub { @Input() options: unknown; }
@Component({ template: '' })
class Destination {}

const catalog = [
  { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
  { date: '2023.04.02', name: 'Април 2023', type: 'governmental' },
];
const candidate: RegionCandidate = { candidateName: 'Иван Петров Иванов', candidateId: '102', partyId: '1', partyName: 'ГЕРБ-СДС',
  total: 10, paper: 6, machine: 4, totalInRegion: 10, partyPercentInRegion: 50, preferencePercentOfPartyVotes: 25 };

function section(old: boolean): Section {
  const partyId = old ? '5' : '1';
  const candidateId = old ? '103' : '102';
  return { sectionId: '010100001', regionId: '01', regionName: 'Благоевград', cityName: 'Банско', sectionName: 'Училище',
    sectionType: 'City', settlementEkatte: '02676', total: 100, voted: 80, activityBp: 8000,
    discardedVotes: 0, noVotes: 0, topParties: [], riskScore: 0,
    riskIndicators: old ? [] : [{ code: 'R6.2', category: 'R6', severity: 'medium', details: { partyId, candidateId, gini: 0.6 } }],
    partyVotes: { [partyId]: { total: old ? 20 : 40, paper: old ? 20 : 30, machine: old ? 0 : 10 } },
    candidateVotes: {
      [`${partyId}_${candidateId}`]: { ...candidate, partyId, candidateId, total: old ? 4 : 10, paper: old ? 4 : 6, machine: old ? 0 : 4 },
      [`${partyId}_101`]: { ...candidate, partyId, candidateId: '101', candidateName: 'Петър Петров Петров', total: old ? 2 : 20, paper: old ? 2 : 15, machine: old ? 0 : 5 },
    } };
}

function setup(render = false) {
  const current = section(false);
  const older = section(true);
  const sources = { '2024.10.27': current, '2023.04.02': older };
  const service = { electionType: 'governmental', getDates: () => catalog,
    getAllData: vi.fn(() => of({
      '2024.10.27': { parties: { '1': 'ГЕРБ-СДС' }, regions: [] },
      '2023.04.02': { parties: { '5': 'ПП ГЕРБ' }, regions: [] },
    })), getSections: vi.fn((date: string) => of([sources[date as keyof typeof sources]])),
    getSectionDetails: vi.fn(() => of({ sectionId: current.sectionId, cityName: current.cityName, sectionName: current.sectionName, partyResults: [] })),
  };
  TestBed.configureTestingModule({ imports: [ContestantDetailModalComponent], providers: [
    provideRouter([{ path: '**', component: Destination }]),
    { provide: ElectionService, useValue: service }, { provide: ThemeService, useValue: { darkMode: () => false } },
    { provide: SettlementMapDataService, useValue: { getSettlementsLookup: () => of([{ ekatte: '02676', obshtina: 'BLG01' }]),
      getMunicipalitiesLookup: () => of([{ obshtina: 'BLG01', name: 'Банско' }]) } },
  ] }).overrideComponent(ContestantDetailModalComponent, {
    remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] },
  });
  if (!render) TestBed.overrideComponent(ContestantDetailModalComponent, { set: { template: '' } });
  const fixture = TestBed.createComponent(ContestantDetailModalComponent);
  const component = fixture.componentInstance;
  component.preferenceCandidate = candidate;
  component.preferenceSections = [current];
  component.partyName = candidate.candidateName; component.partyId = candidate.partyId; component.currentDate = catalog[0].date;
  return { fixture, component, service, current, older, router: TestBed.inject(Router), pages: TestBed.inject(ModalPageService) };
}

describe('preference candidate profiles', () => {
  it('shows the same five profile tabs and all matched history with preference denominators', async () => {
    const { fixture, component, service } = setup(true);
    await component.load(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect([...element.querySelectorAll('nav button')].map(button => button.textContent?.trim())).toEqual([
      'Обобщение', 'Избори', 'География', 'Секции', 'Рискове',
    ]);
    expect(component.participations().map(row => [row.date, row.votes, row.share])).toEqual([
      ['2024.10.27', 10, 25], ['2023.04.02', 4, 20],
    ]);
    expect(element.textContent).toContain('Кандидат за народен представител');
    expect(element.textContent).toContain('по пълно име и партия');
    component.openElection('2023.04.02'); fixture.detectChanges();
    expect(element.querySelector('[aria-label="Листи на кандидата"]')?.textContent).toContain('103');
    expect(element.textContent).toContain('Дял от партийните гласове');
    expect(component.mandate()).toBeNull();
    expect(component.roundComparison()).toBeNull();
    fixture.componentRef.setInput('preferencePageQueryParams', { analysis: 'updated-page-context' });
    fixture.detectChanges(); await fixture.whenStable();
    expect(component.activeTab()).toBe('elections');
    expect(component.scope()).toBe('2023.04.02');
    expect(service.getSections).toHaveBeenCalledTimes(2);
    component.selectScope('all'); component.selectTab('risks'); fixture.detectChanges();
    expect(element.querySelector('[aria-label="Рискове за кандидатските листи"]')?.textContent).toContain('R6.2');
  });

  it('shares election scope across data tabs and keeps the overview global without reloading archives', async () => {
    const { component, service } = setup();
    await component.load();
    component.selectTab('sections');
    expect(component.detailElections()).toHaveLength(2);
    component.selectScope('2023.04.02'); component.selectTab('geography');
    expect(component.detailElections().map(row => row.participation.date)).toEqual(['2023.04.02']);
    component.selectTab('risks');
    expect(component.scope()).toBe('2023.04.02');
    component.selectTab('overview');
    expect(component.participations()).toHaveLength(2);
    expect(service.getSections).toHaveBeenCalledTimes(2);
  });

  it('opens original historical section data rather than projected preference totals', async () => {
    const { component, service, older } = setup();
    await component.load();
    const projected = component.preferenceElections()[1].sections[0];
    expect(projected.voted).toBe(20);
    await component.openSection({ date: '2023.04.02', section: projected });
    expect(service.getSectionDetails).toHaveBeenCalledWith('2023.04.02', older.sectionId);
    expect(component.openedSection()?.section).toBe(older);
    expect(component.openedSection()?.section.voted).toBe(80);
    expect(component.openedSection()?.section.partyVotes['preference']).toBeUndefined();
  });

  it('restores expanded profile state and opens historical sections at their own election and district', async () => {
    const { fixture, component, router, pages, service, older } = setup();
    await pages.open('candidate', { candidate: '1_102', profileTab: 'sections', profileScope: '2023.04.02', profileMetric: 'votes' },
      ['/', 'governmental', 'election', '2024.10.27', 'region', '01']);
    await component.load(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.activeTab()).toBe('sections');
    expect(component.scope()).toBe('2023.04.02');
    expect(component.chartMetric()).toBe('votes');
    expect(component.pageQueryParams['candidate']).toBe('1_102');
    expect(component.pageRoute).toEqual(['/', 'governmental', 'election', '2024.10.27', 'region', '01']);
    await component.openSection({ date: '2023.04.02', section: component.preferenceElections()[1].sections[0] });
    expect(router.url.split('?')[0]).toBe('/governmental/election/2023.04.02/region/01');
    expect(router.parseUrl(router.url).queryParams).toMatchObject({ dialog: 'section', section: older.sectionId });
    expect(service.getSectionDetails).not.toHaveBeenCalled();
  });

  it('discards a superseded person while an old archive request is pending', async () => {
    const { component, service, current } = setup();
    const pending = new Subject<Section[]>(); service.getSections.mockReturnValueOnce(pending);
    const oldLoad = component.load();
    await vi.waitFor(() => expect(service.getSections).toHaveBeenCalledOnce());
    component.preferenceCandidate = { ...candidate, candidateName: 'Петър Петров Петров', candidateId: '101' };
    await component.load();
    pending.next([current]); pending.complete(); await oldLoad;
    expect(component.displayName).toBe('Петър Петров Петров');
    expect(component.participations().map(row => row.votes)).toEqual([20, 2]);
    expect(component.detailProgress()).toBe(100);
  });

  it('keeps request failures local and retries loading the preference history', async () => {
    const { component, service } = setup();
    service.getSections.mockReturnValueOnce(throwError(() => new Error('offline')));
    await component.load();
    expect(component.error()).toContain('Профилът не може');
    expect(component.loading()).toBe(false);
    await component.load();
    expect(component.error()).toBe('');
    expect(component.participations()).toHaveLength(2);
  });
});
