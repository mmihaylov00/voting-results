import { Routes } from '@angular/router';
import { ElectionListComponent } from './components/election-list/election-list';
import { RegionListComponent } from './components/region-list/region-list';
import { ElectionDetailComponent } from './components/election-detail/election-detail';

export const routes: Routes = [
  { path: '', component: ElectionListComponent },
  { path: 'election/:date', component: RegionListComponent },
  { path: 'election/:date/all', component: ElectionDetailComponent },
  { path: 'election/:date/region/:regionId', component: ElectionDetailComponent },
  { path: '**', redirectTo: '' }
];
