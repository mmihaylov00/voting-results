import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Section } from '../../models/election.models';
import { ElectionService } from '../../services/election';
import { ModalPageService } from '../../services/modal-page.service';
import { SettlementMapDataService } from '../../services/settlement-map-data.service';
import { ThemeService } from '../../services/theme.service';
import { ContestantSummary } from '../../utils/contestant-profile.util';
import { ContestantDetailModalComponent } from './contestant-detail-modal';

@Component({ template: '' })
class DestinationComponent {}

const section: Section = {
  sectionId: '010100001', regionId: '01', cityName: 'Банско', sectionName: 'Училище', sectionType: 'City',
  total: 100, voted: 80, discardedVotes: 0, noVotes: 0, topParties: [], activityBp: 8000, partyVotes: {},
};

function setup() {
  const service = {
    electionType: 'governmental',
    getDates: () => [
      { date: '2024.10.27', name: '2024', type: 'governmental' },
      { date: '2023.04.02', name: '2023', type: 'governmental' },
    ],
    getAllData: vi.fn((): Observable<Record<string, ContestantSummary>> => of({
      '2024.10.27': { parties: { '1': 'ГЕРБ-СДС', '2': 'БСП' }, regions: [] },
      '2023.04.02': { parties: { '5': 'ПП ГЕРБ', '9': 'БСП' }, regions: [] },
    })),
    getSections: vi.fn(() => of([])),
    getSectionDetails: vi.fn(),
  };
  TestBed.configureTestingModule({ imports: [ContestantDetailModalComponent], providers: [
    provideRouter([
      { path: '', component: DestinationComponent },
      { path: 'governmental', component: DestinationComponent },
      { path: 'governmental/election/:date/region/:regionId', component: DestinationComponent },
    ]),
    { provide: ElectionService, useValue: service },
    { provide: SettlementMapDataService, useValue: { getSettlementsLookup: () => of([]), getMunicipalitiesLookup: () => of([]) } },
    { provide: ThemeService, useValue: { darkMode: () => false } },
  ] }).overrideComponent(ContestantDetailModalComponent, { set: { template: '' } });
  const fixture = TestBed.createComponent(ContestantDetailModalComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  const pages = TestBed.inject(ModalPageService);
  return { fixture, component, router, pages, service };
}

describe('expanded contestant profiles', () => {
  it('restores validated identity, tab, scope and metric from a direct page URL with no popup selection', async () => {
    const { fixture, component, pages, service } = setup();
    await pages.open('contestant', { profileName: 'ГЕРБ-СДС', profileParty: '1', profileDate: '2024.10.27',
      profileTab: 'sections', profileScope: '2023.04.02', profileMetric: 'votes' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.partyName).toBe('');
    expect(component.profileName).toBe('ГЕРБ-СДС');
    expect(component.participations().map(election => election.partyId)).toEqual(['1', '5']);
    expect(component.activeTab()).toBe('sections');
    expect(component.scope()).toBe('2023.04.02');
    expect(component.chartMetric()).toBe('votes');
    await vi.waitFor(() => expect(service.getSections).toHaveBeenCalledWith('2023.04.02', undefined, false));
    expect(service.getAllData).toHaveBeenCalledOnce();

    await pages.collapse('contestant');
    await fixture.whenStable();
    expect(pages.isActive('contestant')).toBe(true);
    expect(pages.isPage('contestant')).toBe(false);
    expect(component.profileName).toBe('ГЕРБ-СДС');
    expect(component.activeTab()).toBe('sections');
    expect(component.scope()).toBe('2023.04.02');
    expect(component.chartMetric()).toBe('votes');
    expect(service.getAllData).toHaveBeenCalledOnce();
    expect(service.getSections).toHaveBeenCalledOnce();
  });

  it('rejects identities that do not belong to the selected election archive', async () => {
    const { fixture, component, pages } = setup();
    await pages.open('contestant', { profileName: 'БСП', profileParty: '1', profileDate: '2024.10.27' });
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.error()).toContain('Невалиден профил');
    expect(component.participations()).toEqual([]);
  });

  it('opens an exact ambiguous ballot without attaching the other alias or older history', async () => {
    const { fixture, component, pages, service } = setup();
    service.getAllData.mockReturnValue(of({
      '2024.10.27': { parties: { '1': 'ГЕРБ', '2': 'ГЕРБ-СДС' }, regions: [
        { id: '01', name: 'Район', total: 100, voted: 80, partyVotes: { '1': 30, '2': 20 } },
      ] },
      '2023.04.02': { parties: { '5': 'ПП ГЕРБ' }, regions: [] },
    }));
    await pages.open('contestant', { profileName: 'ГЕРБ', profileParty: '1', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.error()).toBe('');
    expect(component.participations().map(row => [row.date, row.partyId, row.votes])).toEqual([['2024.10.27', '1', 30]]);
    expect(component.profileName).toBe('ГЕРБ');
  });

  it('opens an uncatalogued real ballot from its canonical expanded URL', async () => {
    const { fixture, component, pages, service } = setup();
    service.getAllData.mockReturnValue(of({
      '2024.10.27': { parties: { '1': 'ГЕРБ-СДС' }, regions: [
        { id: '01', name: 'Район', total: 100, voted: 80, partyVotes: { '1': 40, '25': 10 } },
      ] },
      '2023.04.02': { parties: { '25': 'Друга партия' }, regions: [] },
    }));
    await pages.open('contestant', { profileName: 'Бюлетина № 25', profileParty: '25', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(pages.isPage('contestant')).toBe(true);
    expect(component.error()).toBe('');
    expect(component.participations().map(row => [row.date, row.partyId, row.fullName, row.votes]))
      .toEqual([['2024.10.27', '25', 'Бюлетина № 25', 10]]);
    expect(component.pageQueryParams).toMatchObject({ profileName: 'Бюлетина № 25', profileParty: '25', profileDate: '2024.10.27' });
  });

  it('rejects a forged party name for an uncatalogued ballot in an expanded URL', async () => {
    const { fixture, component, pages, service } = setup();
    service.getAllData.mockReturnValue(of({
      '2024.10.27': { parties: {}, regions: [
        { id: '01', name: 'Район', total: 100, voted: 80, partyVotes: { '25': 10 } },
      ] },
    }));
    await pages.open('contestant', { profileName: 'ГЕРБ-СДС', profileParty: '25', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.error()).toContain('Невалиден профил');
    expect(component.participations()).toEqual([]);
  });

  it('reuses the root for an expanded nested profile and preserves its original popup identity on Back', async () => {
    const { fixture, component, pages, router } = setup();
    component.partyName = 'ГЕРБ-СДС'; component.partyId = '1'; component.currentDate = '2024.10.27';
    await component.load();
    fixture.detectChanges();
    component.nestedContestant.set({ partyName: 'БСП', partyId: '2', date: '2024.10.27' });
    await pages.open('contestant', { profileName: 'БСП', profileParty: '2', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.profileName).toBe('БСП');
    expect(component.nestedContestant()).toBeNull();
    expect(component.partyName).toBe('ГЕРБ-СДС');
    expect(component.currentDate).toBe('2024.10.27');
    await router.navigateByUrl('/governmental');
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.profileName).toBe('ГЕРБ-СДС');
    expect(component.participations().map(election => election.partyId)).toEqual(['1', '5']);
  });

  it('opens a historical section on its own election and region URL from an expanded archive profile', async () => {
    const { fixture, component, pages, router, service } = setup();
    await pages.open('contestant', { profileName: 'ГЕРБ-СДС', profileParty: '1', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable();
    await component.openSection({ date: '2023.04.02', section });
    expect(router.url.split('?')[0]).toBe('/governmental/election/2023.04.02/region/01');
    expect(router.parseUrl(router.url).queryParams).toMatchObject({ dialog: 'section', section: section.sectionId });
    expect(component.openedSection()).toBeNull();
    expect(service.getSectionDetails).not.toHaveBeenCalled();
  });

  it('opens a historical preference candidate at its region with its original ballot identity', async () => {
    const { fixture, component, pages, router } = setup();
    await pages.open('contestant', { profileName: 'ГЕРБ-СДС', profileParty: '1', profileDate: '2024.10.27' }, ['/', 'governmental']);
    fixture.detectChanges();
    await fixture.whenStable();
    component.openCandidate({ date: '2023.04.02', sections: [section], candidate: {
      candidateId: '101', candidateName: 'Кандидат', partyId: '5', partyName: 'ПП ГЕРБ',
      paper: 1, machine: 0, total: 1, totalInRegion: 1, partyPercentInRegion: 100, preferencePercentOfPartyVotes: 100,
    } });
    await vi.waitFor(() => expect(router.parseUrl(router.url).queryParams).toMatchObject({ dialog: 'candidate', candidate: '5_101' }));
    expect(router.url.split('?')[0]).toBe('/governmental/election/2023.04.02/region/01');
    expect(component.openedCandidate()).toBeNull();
  });
});
