import { Component, createEnvironmentInjector, EnvironmentInjector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from './app.routes';
import { ElectionService } from './services/election';
import { ELECTION_TYPE } from './utils/election-type';

@Component({ template: '' })
class WorkspaceDestinationComponent {
  readonly electionType = inject(ELECTION_TYPE);
  readonly electionService = inject(ElectionService);
}

describe('Election routes', () => {
  it.each(['governmental', 'presidential'])('opens the %s directory in its election data scope', async type => {
    const archive = routes.find(route => route.path === type)!;
    const directory = archive.children!.find(route => route.path === 'contestants')!;
    expect(directory.loadComponent).toBeTypeOf('function');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([{
      ...archive,
      children: [{ ...directory, loadComponent: undefined, component: WorkspaceDestinationComponent }],
    }])] });
    const harness = await RouterTestingHarness.create();
    const destination = await harness.navigateByUrl(`/${type}/contestants`, WorkspaceDestinationComponent);
    expect(destination.electionType).toBe(type);
    expect(destination.electionService.getDates().every(election => election.type === type)).toBe(true);
    expect(TestBed.inject(Router).url).toBe(`/${type}/contestants`);
  });

  it.each([
    ['/governmental/election/2026.04.19/compare?region=23&left=1&right=2', '/governmental/election/2026.04.19/region/23', { panel: 'comparison', comparison: 'parties', left: '1', right: '2' }],
    ['/presidential/election/2021.11.21/risks?region=01', '/presidential/election/2021.11.21/region/1', { panel: 'risks' }],
    ['/governmental/election/2026.04.19/compare?region=unknown', '/governmental/election/2026.04.19', { panel: 'comparison', comparison: 'parties' }],
    ['/governmental/election/2026.04.19/geography', '/governmental/election/2026.04.19', { panel: 'geography' }],
    ['/governmental/election/2026.04.19/polls?agency=a', '/governmental/election/2026.04.19', { panel: 'polls', agency: 'a' }],
    ['/governmental/election/2026.04.19/mandates', '/governmental/election/2026.04.19', { panel: 'mandates' }],
    ['/governmental/election/2026.04.19/simulator?threshold=6&coalition=1,2', '/governmental/election/2026.04.19', { panel: 'mandates', tab: 'simulator', threshold: '6', coalition: '1,2' }],
    ['/governmental/election/2026.04.19/simulator?tab=mandates', '/governmental/election/2026.04.19', { panel: 'mandates', tab: 'mandates' }],
  ])('opens the corresponding workspace tab for %s', async (url, destination, queryParams) => {
    const archives = routes.filter(route => route.path === 'governmental' || route.path === 'presidential')
      .map(route => ({ ...route, children: route.children!.map(child => child.redirectTo ? child : { path: child.path, component: WorkspaceDestinationComponent }) }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter(archives)] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const tree = router.parseUrl(router.url);
    expect(router.url.split('?')[0]).toBe(destination);
    expect(tree.queryParams).toEqual(queryParams);
  });

  it('provides separate data services and election types for both archives', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const parent = TestBed.inject(EnvironmentInjector);
    const governmental = routes.find(route => route.path === 'governmental')!;
    const presidential = routes.find(route => route.path === 'presidential')!;
    const first = createEnvironmentInjector(governmental.providers!, parent);
    const second = createEnvironmentInjector(presidential.providers!, parent);
    try {
      expect(first.get(ELECTION_TYPE)).toBe('governmental');
      expect(second.get(ELECTION_TYPE)).toBe('presidential');
      expect(first.get(ElectionService)).not.toBe(second.get(ElectionService));
      expect(first.get(ElectionService).getDates().every(election => election.type === 'governmental')).toBe(true);
      expect(second.get(ElectionService).getDates().map(election => election.date)).toContain('2021.11.21');
      expect(second.get(ElectionService).getDates().every(election => election.type === 'presidential')).toBe(true);
      expect(presidential.children?.map(route => route.path)).toContain('election/:date/all');
      for (const archive of [governmental, presidential]) {
        expect(archive.children?.map(route => route.path)).toContain('election/:date/compare');
        expect(archive.children?.map(route => route.path)).toContain('election/:date/risks');
      }
      for (const view of ['geography', 'polls', 'mandates', 'simulator']) {
        expect(governmental.children?.map(route => route.path)).toContain(`election/:date/${view}`);
        expect(presidential.children?.map(route => route.path)).not.toContain(`election/:date/${view}`);
      }
      for (const view of ['compare', 'risks', 'geography', 'polls', 'mandates', 'simulator']) {
        expect(governmental.children?.find(route => route.path === `election/:date/${view}`)?.redirectTo).toBeTypeOf('function');
      }
    } finally {
      first.destroy();
      second.destroy();
    }
  });
});
