import { Routes } from '@angular/router';
import { APP_ROLE } from '@votes/shared';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'admin/users',
    loadComponent: () => import('./components/admin/users/users').then(m => m.AdminUsersComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  {
    path: 'admin/positions',
    loadComponent: () => import('./components/admin/positions/positions').then(m => m.AdminPositionsComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  {
    path: 'elections/:id',
    loadComponent: () => import('./components/elections-manage/detail/detail').then(m => m.ElectionsManageDetailComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER] }
  },
  {
    path: 'elections/:id/sections',
    loadComponent: () => import('./components/elections-manage/sections-upload/sections-upload').then(m => m.SectionsUploadComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  {
    path: 'elections/:id/people',
    loadComponent: () => import('./components/elections-manage/people-upload/people-upload').then(m => m.PeopleUploadComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  {
    path: 'elections/:id/assignments',
    loadComponent: () => import('./components/elections-manage/assignments/assignments').then(m => m.AssignmentsComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER] }
  },
  {
    path: 'elections/:id/results',
    loadComponent: () => import('./components/elections-manage/results-upload/results-upload').then(m => m.ResultsUploadComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  {
    path: 'elections/:id/results-stats',
    loadComponent: () => import('./components/elections-manage/results-stats/results-stats').then(m => m.ResultsStatsComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN] }
  },
  { 
    path: '', 
    loadComponent: () => import('./components/election-list/election-list').then(m => m.ElectionListComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER, APP_ROLE.VIEWER] }
  },
  { 
    path: 'election/:date', 
    loadComponent: () => import('./components/region-list/region-list').then(m => m.RegionListComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER, APP_ROLE.VIEWER] }
  },
  { 
    path: 'election/:date/all', 
    loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER, APP_ROLE.VIEWER] }
  },
  { 
    path: 'election/:date/region/:regionId', 
    loadComponent: () => import('./components/election-detail/election-detail').then(m => m.ElectionDetailComponent),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [APP_ROLE.ADMIN, APP_ROLE.CAMPAIGN_MANAGER, APP_ROLE.VIEWER] }
  },
  { path: '**', redirectTo: '' }
];
