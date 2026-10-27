import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { AppHeaderComponent } from './app-header';
import elections from '../../../assets/elections.json';

@Component({ template: '' })
class DestinationComponent {}

describe('AppHeaderComponent breadcrumb navigation', () => {
  const darkMode = signal(false);
  const toggleDarkMode = vi.fn(() => darkMode.update(value => !value));

  beforeEach(() => {
    darkMode.set(false);
    toggleDarkMode.mockClear();
    TestBed.configureTestingModule({
      imports: [AppHeaderComponent],
      providers: [provideRouter([{ path: '**', component: DestinationComponent }]),
        { provide: ThemeService, useValue: { darkMode, toggleDarkMode } },
      ],
    });
  });

  async function render(url: string, dates?: ReturnType<AppHeaderComponent['dates']>) {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(AppHeaderComponent);
    if (dates) vi.spyOn(fixture.componentInstance, 'dates').mockReturnValue(dates);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, router, element: fixture.nativeElement as HTMLElement };
  }

  it.each([
    ['/governmental', '/'],
    ['/presidential', '/'],
    ['/governmental/contestants', '/'],
    ['/presidential/contestants', '/'],
    ['/governmental/election/2026.04.19', '/governmental'],
    ['/presidential/election/2021.11.21', '/presidential'],
    ['/governmental/election/2026.04.19/all', '/governmental/election/2026.04.19'],
    ['/presidential/election/2021.11.21/region/23?section=230000001', '/presidential/election/2021.11.21'],
    ...['compare', 'risks', 'geography', 'polls', 'mandates', 'simulator'].map(view => [
      `/governmental/election/2026.04.19/${view}?region=23`, '/governmental/election/2026.04.19',
    ]),
  ])('places Back first in the breadcrumb and uses the logo for Home on %s', async (url, parent) => {
    const { element } = await render(url);
    const header = element.querySelector('header')!;
    expect(header.querySelector('a[aria-label="Назад"]')?.getAttribute('href')).toBe(parent);
    expect(header.querySelector('nav ol')?.firstElementChild?.querySelector('a[aria-label="Назад"]')).not.toBeNull();
    expect(header.querySelector('a[aria-label="Начало"]')).toBeNull();
    expect(header.querySelector('a[aria-label="Изборни резултати - начало"]')?.getAttribute('href')).toBe('/');
  });

  it('updates Back after navigation and returns Home through the logo', async () => {
    const { fixture, element, router } = await render('/governmental/election/2026.04.19/region/23');
    element.querySelector<HTMLAnchorElement>('a[aria-label="Назад"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/governmental/election/2026.04.19');
    expect(element.querySelector('a[aria-label="Назад"]')?.getAttribute('href')).toBe('/governmental');

    element.querySelector<HTMLAnchorElement>('a[aria-label="Изборни резултати - начало"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/');
    expect(element.querySelector('a[aria-label="Назад"]')).toBeNull();
    expect(element.querySelector('a[aria-label="Начало"]')).toBeNull();
    expect(element.querySelector('a[aria-label="Изборни резултати - начало"]')).not.toBeNull();
  });

  it.each([
    ['governmental', 'presidential', 'Парламентарни', 'Президентски'],
    ['presidential', 'governmental', 'Президентски', 'Парламентарни'],
  ])('keeps the directory when switching from %s to %s', async (type, nextType, label, nextLabel) => {
    const { fixture, element, router } = await render(`/${type}/contestants?contestant=old`);
    expect(element.querySelector('#navigation-type--trigger')?.textContent).toContain(label);
    expect(element.querySelector('nav [aria-current="page"]')?.textContent).toContain('Партии и кандидати');
    expect(element.querySelector('#navigation-date--trigger')).toBeNull();
    expect(element.querySelector('#navigation-region--trigger')).toBeNull();
    expect(element.querySelector('[role="status"]')).toBeNull();

    fixture.componentInstance.changeType(nextType);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe(`/${nextType}/contestants`);
    expect(element.querySelector('#navigation-type--trigger')?.textContent).toContain(nextLabel);
    expect(element.querySelector('#navigation-date--trigger')).toBeNull();

    element.querySelector<HTMLAnchorElement>('a[aria-label="Назад"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/');
  });

  it('shows provisional source metadata in Sofia time only for the selected election', async () => {
    const provisional = {
      sourceUrl: 'https://results.cik.bg/pvr202610/rezultati/index.html',
      updatedAt: '2026-10-26T08:00:00Z',
      processedPercent: 99.95,
      reportedSections: 12713,
      totalSections: 12719,
    };
    const dates = [
      { date: '2026.10.25', name: 'Октомври 2026 - Тур 1', type: 'presidential', round: 1, provisional },
      { date: '2021.11.21', name: 'Ноември 2021 - Тур 2', type: 'presidential', round: 2 },
    ];
    const { fixture, router, element } = await render('/presidential/election/2026.10.25/all', dates);
    const banner = element.querySelector('[role="status"]');
    expect(banner?.textContent).toContain('Предварителни резултати');
    expect(banner?.textContent).toContain('99.95%');
    expect(banner?.querySelector('time')?.textContent).toContain('26.10.2026');
    expect(banner?.querySelector('time')?.textContent).toContain('10:00');
    expect(banner?.querySelector('a')?.getAttribute('href')).toBe(provisional.sourceUrl);

    await router.navigateByUrl('/presidential/election/2021.11.21/all');
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')).toBeNull();
    await router.navigateByUrl('/presidential');
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')).toBeNull();
  });

  it('keeps only election breadcrumbs in the header', async () => {
    const { element } = await render('/governmental/election/2026.04.19/region/23?panel=risks');
    expect(element.querySelector('a[href="#main-content"]')).not.toBeNull();
    const selects = [...element.querySelectorAll<HTMLButtonElement>('header [role="combobox"]')];
    expect(selects.every(select => Boolean(element.querySelector('#' + select.getAttribute('aria-labelledby'))))).toBe(true);
    expect(selects.map(select => select.textContent?.trim())).toEqual(['Парламентарни', 'Април 2026', 'СОФИЯ 23 МИР']);
    expect(selects.every(select => select.querySelector('app-map-icon'))).toBe(true);
    expect(element.querySelector('nav[aria-label="Раздели на изборите"]')).toBeNull();
    expect(element.querySelector('[data-view]')).toBeNull();
  });

  it('offers regional scope on the national page and updates breadcrumbs after navigation', async () => {
    const { fixture, element, router } = await render('/governmental/election/2026.04.19?panel=geography');
    expect(element.querySelector('#navigation-region--trigger')?.textContent).toContain('Всички райони');
    await router.navigateByUrl('/governmental/election/2024.10.27/region/24?panel=risks');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(element.querySelector('#navigation-date--trigger')?.textContent).toContain('Октомври 2024');
    expect(element.querySelector('#navigation-region--trigger')?.textContent).toContain('СОФИЯ 24 МИР');
  });

  it.each(['geography', 'polls', 'mandates'])('keeps the national %s tab when changing date', async panel => {
    const { fixture, router } = await render(`/governmental/election/2026.04.19?panel=${panel}`);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.changeDate('2024.10.27');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2024.10.27'], { queryParams: { panel } });
    fixture.componentInstance.changeRegion('23');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2026.04.19', 'region', '23'], { queryParams: {} });
  });

  it('keeps the simulator tab while dropping the old election coalition and threshold', async () => {
    const { fixture, router } = await render('/governmental/election/2026.04.19?panel=mandates&tab=simulator&threshold=6&coalition=21');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.changeDate('2024.10.27');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2024.10.27'], {
      queryParams: { panel: 'mandates', tab: 'simulator' },
    });
  });

  it('preserves a supported tab and regional scope when changing date and validates selections', async () => {
    const { fixture, router } = await render('/presidential/election/2021.11.21/region/23?panel=risks');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.changeDate('2016.11.13');
    expect(navigate).toHaveBeenCalledWith(['/', 'presidential', 'election', '2016.11.13', 'region', '23'], { queryParams: { panel: 'risks' } });
    navigate.mockClear();
    fixture.componentInstance.changeDate('2026.04.19');
    fixture.componentInstance.changeType('unknown');
    fixture.componentInstance.changeRegion('999');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('preserves the below-threshold metric and region when switching date or region', async () => {
    const { fixture, router } = await render('/governmental/election/2026.04.19/region/23?metric=below-threshold&section=230000001');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.changeDate('2024.10.27');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2024.10.27', 'region', '23'], { queryParams: { metric: 'below-threshold' } });
    fixture.componentInstance.changeRegion('32');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2026.04.19', 'region', '32'], { queryParams: { metric: 'below-threshold' } });
    fixture.componentInstance.changeRegion('');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2026.04.19', 'all'], { queryParams: { metric: 'below-threshold' } });
  });

  it('preserves comparison mode and clears selected participants when changing region', async () => {
    const { fixture, router } = await render('/governmental/election/2026.04.19/region/23?panel=comparison&comparison=parties&mode=candidates&left=old-left&right=old-right');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const queryParams = { panel: 'comparison', comparison: 'parties', mode: 'candidates' };
    fixture.componentInstance.changeRegion('24');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2026.04.19', 'region', '24'], { queryParams });
    fixture.componentInstance.changeRegion('');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'governmental', 'election', '2026.04.19', 'all'], { queryParams });
  });

  it('keeps supported tabs on type changes and drops parliamentary-only tools', async () => {
    const { fixture, router } = await render('/governmental/election/2026.04.19/region/23?panel=comparison&comparison=parties&mode=candidates');
    const navigate = vi.spyOn(router, 'navigate');
    const latest = elections.filter(election => election.type === 'presidential').map(election => election.date).sort().at(-1);
    fixture.componentInstance.changeType('presidential');
    await vi.waitFor(() => expect(router.url).toBe(`/presidential/election/${latest}/region/23?panel=comparison&comparison=parties`));
    await router.navigateByUrl('/governmental/election/2026.04.19?panel=mandates');
    fixture.componentInstance.changeType('presidential');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'presidential', 'election', latest], { queryParams: {} });
    await vi.waitFor(() => expect(router.url).toBe(`/presidential/election/${latest}`));
  });

  it('opens the region list when choosing an election date from the archive', async () => {
    const { fixture, router, element } = await render('/governmental');
    expect(element.querySelector('#navigation-date--trigger')?.textContent).toContain('Всички дати');
    expect(element.querySelector('nav[aria-label="Раздели на изборите"]')).toBeNull();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.changeDate('2024.10.27');
    expect(navigate).toHaveBeenCalledWith(['/', 'governmental', 'election', '2024.10.27'], { queryParams: {} });
  });

  it('keeps the labelled native theme button', async () => {
    const { element, fixture } = await render('/governmental');
    (element.querySelector('button[aria-label="Тъмна тема"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(toggleDarkMode).toHaveBeenCalledOnce();
    expect(element.querySelector('button[aria-label="Светла тема"]')).not.toBeNull();
  });
});
