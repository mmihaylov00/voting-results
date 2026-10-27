import { inject } from '@angular/core';
import { Params, RedirectFunction, Route, Router, Routes } from '@angular/router';
import { ElectionService } from './services/election';
import { ELECTION_TYPE, ElectionType } from './utils/election-type';
import { ElectionPanel } from './utils/election-workspace.util';
import { REGION_ID_TO_NAME } from './utils/region-names';

function workspaceRedirect(type: ElectionType, panel: ElectionPanel, defaults: Params = {}): RedirectFunction {
  return ({ params, queryParams }) => {
    const region = typeof queryParams['region'] === 'string' ? queryParams['region'].replace(/^0+(?=\d)/, '') : '';
    const commands = ['/', type, 'election', params['date']];
    if ((panel === 'comparison' || panel === 'risks') && Object.hasOwn(REGION_ID_TO_NAME, region)) commands.push('region', region);
    const nextQuery: Params = { ...defaults, ...queryParams, panel };
    delete nextQuery['region'];
    return inject(Router).createUrlTree(commands, { queryParams: nextQuery });
  };
}

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/election-type-select/election-type-select').then(m => m.ElectionTypeSelectComponent)
  },
  ...(['governmental', 'presidential'] as ElectionType[]).map<Route>(type => ({
    path: type,
    providers: [ElectionService, { provide: ELECTION_TYPE, useValue: type }],
    children: [
      {
        path: 'contestants',
        loadComponent: () => import('./components/contestant-directory/contestant-directory').then(m => m.ContestantDirectoryComponent)
      },
      {
        path: 'election/:date/compare',
        redirectTo: workspaceRedirect(type, 'comparison', { comparison: 'parties' }), pathMatch: 'full',
      },
      {
        path: 'election/:date/risks',
        redirectTo: workspaceRedirect(type, 'risks'), pathMatch: 'full',
      },
      ...(type === 'governmental' ? [{
        path: 'election/:date/geography',
        redirectTo: workspaceRedirect(type, 'geography'), pathMatch: 'full' as const,
      }, {
        path: 'election/:date/polls',
        redirectTo: workspaceRedirect(type, 'polls'), pathMatch: 'full' as const,
      }, {
        path: 'election/:date/mandates',
        redirectTo: workspaceRedirect(type, 'mandates'), pathMatch: 'full' as const,
      }, {
        path: 'election/:date/simulator',
        redirectTo: workspaceRedirect(type, 'mandates', { tab: 'simulator' }), pathMatch: 'full' as const,
      }] : []),
      {
        path: '',
        loadComponent: () => import('./components/election-list/election-list').then(m => m.ElectionListComponent)
      },
      {
        path: 'election/:date',
        loadComponent: () => import('./components/region-list/region-list').then(m => m.RegionListComponent)
      },
      {
        path: 'election/:date/all',
        loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent)
      },
      {
        path: 'election/:date/region/:regionId',
        loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent)
      },
    ],
  })),
  { path: 'election/:date/region/:regionId', redirectTo: 'governmental/election/:date/region/:regionId', pathMatch: 'full' },
  { path: 'election/:date/all', redirectTo: 'governmental/election/:date/all', pathMatch: 'full' },
  { path: 'election/:date', redirectTo: 'governmental/election/:date', pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];
