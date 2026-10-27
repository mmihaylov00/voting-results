import { ApplicationRef, Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { ModalPageService } from './modal-page.service';

@Component({ template: '' })
class ElectionPageComponent {}

describe('ModalPageService', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'election/:date/region/:region', component: ElectionPageComponent }])],
  }));

  it('opens a specific page while retaining election scope and query selections', async () => {
    const router = TestBed.inject(Router);
    const pages = TestBed.inject(ModalPageService);
    await router.navigateByUrl('/election/2026.04.19/region/23?panel=results&metric=activity');
    await pages.open('section', { section: '230000001', analysis: 'selected filters' });
    expect(router.url.split('?')[0]).toBe('/election/2026.04.19/region/23');
    expect(router.parseUrl(router.url).queryParams).toEqual({
      panel: 'results', metric: 'activity', section: '230000001', analysis: 'selected filters', dialog: 'section',
    });
    expect(pages.isPage('section')).toBe(true);
    pages.close('candidate');
    expect(pages.isPage('section')).toBe(true);
    pages.close('section');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(pages.activeId()).toBeNull();
    expect(router.parseUrl(router.url).queryParams['section']).toBeUndefined();
    expect(router.parseUrl(router.url).queryParams['analysis']).toBe('selected filters');
  });

  it('reads direct links and responds to navigation back to the original URL', async () => {
    const router = TestBed.inject(Router);
    const pages = TestBed.inject(ModalPageService);
    const original = '/election/2026.04.19/region/23?panel=results';
    await router.navigateByUrl(`${original}&dialog=protocol-errors`);
    expect(pages.isPage('protocol-errors')).toBe(true);
    await router.navigateByUrl(original);
    expect(pages.activeId()).toBeNull();
  });

  it('opens nested details at their own election and region', async () => {
    const router = TestBed.inject(Router);
    const pages = TestBed.inject(ModalPageService);
    await router.navigateByUrl('/election/2026.04.19/region/23');
    await pages.open('section', { section: '010000001' }, ['/election', '2024.10.27', 'region', '1']);
    expect(router.url).toBe('/election/2024.10.27/region/1?section=010000001&dialog=section');
  });

  it('keeps the modal presentation when navigating to another selected detail', async () => {
    const router = TestBed.inject(Router);
    const pages = TestBed.inject(ModalPageService);
    await router.navigateByUrl('/election/2026.04.19/region/23?dialog=section&section=230000001');
    pages.collapse('section');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(pages.isActive('section')).toBe(true);
    expect(pages.isPage('section')).toBe(false);
    await pages.open('candidate', { candidate: '1_101', section: null });
    expect(router.parseUrl(router.url).queryParams).toEqual({ dialog: 'candidate', candidate: '1_101', dialogMode: 'modal' });
    expect(pages.isActive('candidate')).toBe(true);
    expect(pages.isPage('candidate')).toBe(false);
    pages.close('candidate');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(router.parseUrl(router.url).queryParams).toEqual({});
  });

  it('keeps expanded pages in browser back and forward history', async () => {
    const router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    const location = TestBed.inject(Location);
    const pages = TestBed.inject(ModalPageService);
    await router.navigateByUrl('/election/2026.04.19/region/23');
    await pages.open('section', { section: '230000001' });
    const back = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.back();
    await back;
    expect(pages.activeId()).toBeNull();
    const forward = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.forward();
    await forward;
    expect(pages.isPage('section')).toBe(true);
    expect(router.parseUrl(router.url).queryParams['section']).toBe('230000001');
    pages.collapse('section');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(pages.isPage('section')).toBe(false);
    const restorePage = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.back();
    await restorePage;
    expect(pages.isPage('section')).toBe(true);
    const restoreModal = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd), take(1)));
    location.forward();
    await restoreModal;
    expect(pages.isActive('section')).toBe(true);
    expect(pages.isPage('section')).toBe(false);
  });
});
