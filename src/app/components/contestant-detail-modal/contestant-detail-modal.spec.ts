import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Component, Input } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { HighchartsChartComponent } from 'highcharts-angular';
import { Region, Section, SectionDetails } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { SettlementMapDataService } from '../../services/settlement-map-data.service';
import { ThemeService } from '../../services/theme.service';
import { ContestantDetailModalComponent } from './contestant-detail-modal';

const dates = [
  { date: '2024.10.27', name: 'Октомври 2024', type: 'governmental' },
  { date: '2023.04.02', name: 'Април 2023', type: 'governmental' },
];
const region = (id: string, votes: number): Region => ({
  id: '01', name: 'Благоевград', total: 100, voted: 80, partyVotes: { [id]: votes },
});
const section: Section = {
  sectionId: '010100001', regionId: '01', regionName: 'Благоевград', settlementEkatte: '02676',
  cityName: 'Банско', sectionName: 'Училище', sectionType: 'City', total: 100, voted: 80,
  discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 8000,
  partyVotes: { '1': { total: 40, paper: 30, machine: 10 }, '5': { total: 20, paper: 20, machine: 0 } },
};
const details: SectionDetails = { sectionId: section.sectionId, cityName: section.cityName,
  sectionName: section.sectionName, partyResults: [] };

@Component({ selector: 'highcharts-chart', standalone: true, template: '' })
class ChartStub { @Input() options: unknown; }

function setup(render = false, presidential = false) {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const catalog = presidential ? [
    { date: '2024.10.27', name: '2024 - Тур 2', type: 'presidential', round: 2 },
    { date: '2024.10.20', name: '2024 - Тур 1', type: 'presidential', round: 1 },
  ] : dates;
  const service = {
    electionType: presidential ? 'presidential' : 'governmental',
    getDates: () => catalog,
    getAllData: vi.fn(() => of({
      [catalog[0].date]: { parties: { '1': presidential ? 'Георги Георгиев и Мария Маринова' : 'ГЕРБ-СДС' }, regions: [region('1', 40)] },
      [catalog[1].date]: { parties: { '5': presidential ? 'Георги Георгиев и Елена Иванова' : 'ПП ГЕРБ' }, regions: [region('5', 20)] },
    })),
    getSections: vi.fn((_date: string, _region?: string, _comparisons?: boolean) => of([{ ...section }])),
    getSectionDetails: vi.fn((_date: string, _id: string) => of(details)),
  };
  const maps = { getSettlementsLookup: () => of([{ ekatte: '02676', obshtina: 'BLG01' }]),
    getMunicipalitiesLookup: () => of([{ obshtina: 'BLG01', name: 'Банско' }]) };
  TestBed.configureTestingModule({ imports: [ContestantDetailModalComponent], providers: [provideRouter([]),
    { provide: ElectionService, useValue: service }, { provide: SettlementMapDataService, useValue: maps },
    { provide: ThemeService, useValue: { darkMode: () => false } },
  ] }).overrideComponent(ContestantDetailModalComponent, {
    remove: { imports: [HighchartsChartComponent] }, add: { imports: [ChartStub] },
  });
  if (!render) TestBed.overrideComponent(ContestantDetailModalComponent, { set: { template: '' } });
  const fixture = TestBed.createComponent(ContestantDetailModalComponent);
  const component = fixture.componentInstance;
  component.partyName = presidential ? 'Георги Георгиев и Мария Маринова' : 'ГЕРБ-СДС';
  component.partyId = '1';
  component.currentDate = '2024.10.27';
  return { fixture, component, service };
}

describe('contestant profile', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('opens on the complete history without fetching section archives', async () => {
    const { component, service } = setup();
    await component.load();
    expect(component.activeTab()).toBe('overview');
    expect(component.scope()).toBe('all');
    expect(component.participations().map(row => [row.date, row.partyId, row.votes])).toEqual([
      ['2024.10.27', '1', 40], ['2023.04.02', '5', 20],
    ]);
    expect(service.getSections).not.toHaveBeenCalled();
    component.selectTab('elections');
    expect(service.getSections).not.toHaveBeenCalled();
  });

  it('shares election scope between tabs, caches details and keeps overview global', async () => {
    const { component, service } = setup();
    await component.load();
    component.activeTab.set('geography');
    component.scope.set('2023.04.02');
    await component.loadDetails();
    expect(service.getSections).toHaveBeenCalledWith('2023.04.02', undefined, false);
    expect(component.detailElections()[0].sections[0].municipalityName).toBe('Банско');
    component.selectTab('sections');
    await component.loadDetails();
    expect(component.scope()).toBe('2023.04.02');
    expect(service.getSections).toHaveBeenCalledTimes(1);
    component.selectTab('overview');
    expect(component.participations()).toHaveLength(2);
    expect(component.scope()).toBe('2023.04.02');
  });

  it('keeps all-election detail results separate and uses each historical ballot ID', async () => {
    const { component, service } = setup();
    await component.load();
    component.activeTab.set('sections');
    await component.loadDetails();
    expect(component.detailElections().map(row => row.participation.partyId)).toEqual(['1', '5']);
    expect(service.getSections.mock.calls.map(call => call[0])).toEqual(['2024.10.27', '2023.04.02']);
  });

  it('discards obsolete scope requests and prevents late results from replacing newer data', async () => {
    const { component, service } = setup();
    const older = new Subject<Section[]>();
    const newer = new Subject<Section[]>();
    service.getSections.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    await component.load();
    component.activeTab.set('sections');
    component.scope.set('2023.04.02');
    const oldLoad = component.loadDetails();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    component.scope.set('2024.10.27');
    const newLoad = component.loadDetails();
    await Promise.resolve(); await Promise.resolve();
    newer.next([section]); newer.complete();
    await newLoad;
    older.next([section]); older.complete();
    await oldLoad;
    expect(component.detailElections().map(row => row.participation.date)).toEqual(['2024.10.27']);
    expect(component.detailLoading()).toBe(false);
    expect(component.detailProgress()).toBe(100);
  });

  it('fills a text-free progress bar only after each requested election finishes loading', async () => {
    const { fixture, component, service } = setup(true);
    const first = new Subject<Section[]>();
    const second = new Subject<Section[]>();
    service.getSections.mockReturnValueOnce(first).mockReturnValueOnce(second);
    await component.load();
    fixture.detectChanges(); await fixture.whenStable();
    component.activeTab.set('sections');
    const loading = component.loadDetails();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const progress = () => element.querySelector<HTMLElement>('[role="progressbar"]');
    expect(progress()?.getAttribute('aria-valuenow')).toBe('0');
    expect(progress()?.textContent?.trim()).toBe('');
    await vi.waitFor(() => expect(service.getSections).toHaveBeenCalledOnce());
    first.next([section]); first.complete();
    await vi.waitFor(() => expect(service.getSections).toHaveBeenCalledTimes(2));
    fixture.detectChanges();
    expect(progress()?.getAttribute('aria-valuenow')).toBe('50');
    expect(progress()?.firstElementChild?.getAttribute('style')).toContain('width: 50%');
    second.next([section]); second.complete();
    await loading;
    fixture.detectChanges();
    expect(component.detailProgress()).toBe(100);
    expect(progress()).toBeNull();
    expect(component.detailElections()).toHaveLength(2);
  });

  it('allows retry after detail failure without losing the summary', async () => {
    const { component, service } = setup();
    await component.load();
    service.getSections.mockReturnValueOnce(throwError(() => new Error('offline')));
    component.activeTab.set('sections');
    component.scope.set('2024.10.27');
    await component.loadDetails();
    expect(component.detailError()).not.toBe('');
    expect(component.participations()).toHaveLength(2);
    await component.loadDetails();
    expect(component.detailError()).toBe('');
    expect(component.detailElections()).toHaveLength(1);
  });

  it('opens historical sections using their actual election date and ignores stale section requests', async () => {
    const { component, service } = setup();
    await component.load();
    const first = new Subject<SectionDetails>();
    service.getSectionDetails.mockReturnValueOnce(first);
    const oldLoad = component.openSection({ date: '2023.04.02', section });
    await component.openSection({ date: '2024.10.27', section });
    first.next(details); first.complete();
    await oldLoad;
    expect(service.getSectionDetails).toHaveBeenCalledWith('2023.04.02', section.sectionId);
    expect(component.openedSection()?.date).toBe('2024.10.27');
    component.closeSection();
    expect(component.openedSection()).toBeNull();
  });

  it('keeps the participation table in Elections and renders a distinct election report', async () => {
    const { fixture, component } = setup(true);
    await component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('nav[aria-label="Профил"]')?.textContent).toContain('Кандидати и преференции');
    expect(element.textContent).toContain('Представяне във времето');
    expect(element.querySelectorAll('app-stat-card')).toHaveLength(4);
    expect(element.querySelector('table')).toBeNull();
    component.selectTab('elections');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.querySelectorAll('tbody button')).toHaveLength(2);
    expect(element.textContent).not.toContain('Отвори');
    element.querySelectorAll<HTMLButtonElement>('tbody button')[1].click();
    await component.loadDetails();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.scope()).toBe('2023.04.02');
    expect(element.querySelector('[role="combobox"][id^="profile-election-scope-"]')?.textContent).toContain('Април 2023');
    expect(element.querySelector('[aria-label="Резултат за избраните избори"]')?.textContent).toContain('ПП ГЕРБ');
    expect(element.textContent).toContain('Бюлетина № 5');
    expect(element.querySelectorAll('app-stat-card')).toHaveLength(6);
    expect(element.querySelector('[aria-label="Резултат за избраните избори"] button')).toBeNull();
  });

  it('tracks a presidential person across tickets and keeps round comparisons explicit', async () => {
    const { component } = setup(false, true);
    await component.load();
    expect(component.tabs.some(tab => tab.id === 'candidates')).toBe(false);
    expect(component.displayName).toBe('Георги Георгиев');
    expect(component.participations()).toHaveLength(2);
    expect(component.best()).toHaveLength(2);
    component.scope.set('2024.10.27');
    expect(component.roundComparison()).toMatchObject({ voteChange: 20, shareChange: 25 });
    expect(component.roundComparison()?.first.fullName).toContain('Елена Иванова');
    expect(component.roundComparison()?.second.fullName).toContain('Мария Маринова');
  });

  it('links the portrait source without a credit disclosure and keeps a text header if the image cannot load', async () => {
    const { fixture, component } = setup(true, true);
    component.partyName = 'Румен Георгиев Радев и Илияна Малинова Йотова';
    await component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const image = element.querySelector<HTMLImageElement>('img.profile-image');
    expect(image?.getAttribute('src')).toBe('/images/contestants/person-rumen-radev.jpg');
    expect(image?.alt).toContain('Румен Георгиев Радев');
    expect(image?.closest('a')?.href).toBe(component.profileImage()?.sourceUrl);
    expect(image?.closest('a')?.title).toContain('CC BY');
    expect(element.querySelector('details')).toBeNull();
    expect(element.textContent).not.toContain('Изображение и лиценз');
    image?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img.profile-image')).toBeNull();
    expect(element.querySelector('h2')?.textContent).toContain('Румен Георгиев Радев');
  });

  it('updates the header image when an existing profile receives a different candidate', async () => {
    const { component } = setup(false, true);
    component.partyName = 'Румен Георгиев Радев';
    await component.load();
    expect(component.profileImage()?.id).toBe('rumen-radev');
    component.partyName = 'Анастас Георгиев Герджиков';
    await component.load();
    expect(component.profileImage()?.id).toBe('anastas-gerdzhikov');
    component.partyName = 'Неизвестен кандидат';
    await component.load();
    expect(component.profileImage()).toBeNull();
  });

  it('shares a historical section with its own election and supplies the link if copying fails', async () => {
    const { component } = setup();
    await component.load();
    await component.openSection({ date: '2023.04.02', section });
    const copy = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await component.shareSection()).toBe(false);
      expect(copy).toHaveBeenCalledWith(expect.stringContaining('/governmental/election/2023.04.02/region/01?section=010100001&dialog=section'));
      expect(component.sectionShareMessage()).toContain('2023.04.02');
      copy.mockResolvedValueOnce(undefined);
      expect(await component.shareSection()).toBe(true);
      expect(component.sectionShareMessage()).toBe('');
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      log.mockRestore();
    }
  });
});
