import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/election-type-select/election-type-select').then(m => m.ElectionTypeSelectComponent)
  },
  {
    path: 'governmental',
    loadComponent: () => import('./components/election-list/election-list').then(m => m.ElectionListComponent)
  },
  {
    path: 'governmental/election/:date',
    loadComponent: () => import('./components/region-list/region-list').then(m => m.RegionListComponent)
  },
  {
    path: 'governmental/election/:date/all',
    loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent)
  },
  {
    path: 'governmental/election/:date/region/:regionId',
    loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent)
  },
  { path: 'election/:date/region/:regionId', redirectTo: 'governmental/election/:date/region/:regionId', pathMatch: 'full' },
  { path: 'election/:date/all', redirectTo: 'governmental/election/:date/all', pathMatch: 'full' },
  { path: 'election/:date', redirectTo: 'governmental/election/:date', pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];
