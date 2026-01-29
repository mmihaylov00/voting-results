import { Routes } from '@angular/router';

export const routes: Routes = [
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
  { path: '**', redirectTo: '' }
];
