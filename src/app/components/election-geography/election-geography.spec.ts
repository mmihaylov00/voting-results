import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ElectionService } from '../../services/election';
import { ElectionContextService } from '../../services/election-context.service';
import { ThemeService } from '../../services/theme.service';
import { ModalPageService } from '../../services/modal-page.service';
import { ElectionGeographyComponent } from './election-geography';

describe('ElectionGeographyComponent', () => {
  let dates: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let getRegions: ReturnType<typeof vi.fn>;
  let getParties: ReturnType<typeof vi.fn>;
  let getDemographics: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dates = new BehaviorSubject(convertToParamMap({ date: '2026.04.19' }));
    getRegions = vi.fn(() => of([{ id: '23', name: 'София', total: 1000, voted: 500, partyVotes: { '1': 500 } }]));
    getParties = vi.fn(() => of({ '1': 'Партия' }));
    getDemographics = vi.fn(() => throwError(() => new Error('Demographics unavailable')));
    TestBed.configureTestingModule({ imports: [ElectionGeographyComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: dates, queryParamMap: of(convertToParamMap({})), snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: ElectionService, useValue: { electionType: 'governmental', getDates: () => [{ date: '2026.04.19', name: 'Април 2026' }, { date: '2024.10.27', name: 'Октомври 2024' }], getRegions, getParties } },
      { provide: ElectionContextService, useValue: { getDemographics, getVoteFlows: () => throwError(() => new Error('Flows unavailable')) } },
      { provide: ThemeService, useValue: { darkMode: () => false } },
    ] });
  });

  it('loads only the selected and baseline summaries, and keeps districts visible if demographics fail', async () => {
    const fixture = TestBed.createComponent(ElectionGeographyComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(getRegions.mock.calls).toEqual([['2026.04.19'], ['2024.10.27']]);
    expect(getParties).toHaveBeenCalledOnce();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('tbody')?.textContent).toContain('София');
    expect(host.querySelector('a[href="/governmental/election/2026.04.19/region/23"]')).not.toBeNull();
    expect(host.querySelector('app-demographic-breakdown')).toBeNull();
    expect(host.querySelector('app-vote-origins')).toBeNull();
    expect(getDemographics).not.toHaveBeenCalled();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('nav button')];
    expect(tabs).toHaveLength(3);
    tabs[2].click();
    await fixture.whenStable(); fixture.detectChanges();
    const demographicSection = host.querySelector('app-demographic-breakdown');
    expect(demographicSection?.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('section[aria-labelledby="top-regions-title"]')?.hidden).toBe(true);
    tabs[0].click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('app-demographic-breakdown')).toBe(demographicSection);
    expect(demographicSection?.parentElement?.hidden).toBe(true);
    dates.next(convertToParamMap({ date: '2026.04.19', unrelated: 'change' }));
    await fixture.whenStable();
    expect(getRegions).toHaveBeenCalledTimes(2);
    expect(getDemographics).toHaveBeenCalledOnce();
  });

  it('preserves the current ranking when its baseline fails', async () => {
    getRegions.mockImplementation(date => date === '2024.10.27' ? throwError(() => new Error('missing')) : of([{ id: '1', name: 'Район', total: 100, voted: 50, partyVotes: {} }]));
    const fixture = TestBed.createComponent(ElectionGeographyComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.componentInstance.rows()[0].priorShare).toBeNull();
    expect(fixture.componentInstance.rows()).toHaveLength(1);
  });

  it('keeps the popup on same-date Back but clears it when an expanded view changes election date', async () => {
    const fixture = TestBed.createComponent(ElectionGeographyComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    const pages = TestBed.inject(ModalPageService);
    const router = TestBed.inject(Router);
    component.methodOpen.set(true);
    fixture.detectChanges();
    await pages.open('region-method', { panel: 'geography' });
    fixture.detectChanges();
    expect(pages.isPage('region-method')).toBe(true);
    expect(component.methodOpen()).toBe(true);

    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(component.methodOpen()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-base-modal')).not.toBeNull();

    await pages.open('region-method', { panel: 'geography' });
    dates.next(convertToParamMap({ date: '2024.10.27' }));
    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(component.methodOpen()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-base-modal')).toBeNull();
  });

  it('keeps a directly linked method mounted when collapsed without reloading its election data', async () => {
    const pages = TestBed.inject(ModalPageService);
    await pages.open('region-method', { panel: 'geography' });
    const fixture = TestBed.createComponent(ElectionGeographyComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const modal = host.querySelector('app-base-modal');
    expect(fixture.componentInstance.methodOpen()).toBe(false);
    expect(modal).not.toBeNull();
    expect(host.querySelector('dialog')).toBeNull();

    await pages.collapse('region-method');
    await fixture.whenStable();
    expect(pages.isActive('region-method')).toBe(true);
    expect(pages.isPage('region-method')).toBe(false);
    expect(host.querySelector('app-base-modal')).toBe(modal);
    expect(host.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true);
    expect(host.textContent).toContain('Източници и методика');
    expect(getRegions).toHaveBeenCalledTimes(2);
    expect(getParties).toHaveBeenCalledOnce();

    host.querySelector<HTMLButtonElement>('button[aria-label="Отвори като страница"]')!.click();
    await fixture.whenStable();
    expect(pages.isPage('region-method')).toBe(true);
    expect(host.querySelector('app-base-modal')).toBe(modal);
    expect(host.querySelector('dialog')).toBeNull();
  });

  it.each([
    ['vote-origin-method', 'origins', 'app-vote-origins'],
    ['demographic-method', 'demographics', 'app-demographic-breakdown'],
  ])('mounts the owning geography tab for the expanded %s view', async (page, tab, selector) => {
    vi.spyOn(TestBed.inject(ModalPageService), 'isActive').mockImplementation(id => id === page);
    const fixture = TestBed.createComponent(ElectionGeographyComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.activeTab()).toBe(tab);
    expect((fixture.nativeElement as HTMLElement).querySelector(selector)).not.toBeNull();
  });
});
