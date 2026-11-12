import { Routes } from '@angular/router';
import { authGuard, guestGuard, profileGuard, startTarget } from './guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: () => startTarget() },
  { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage) },
  {
    path: 'profile-setup',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile-setup/profile-setup.page').then((m) => m.ProfileSetupPage),
  },
  {
    path: 'tabs',
    canActivate: [authGuard, profileGuard],
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'home', loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage) },
      { path: 'meds', loadComponent: () => import('./pages/meds/meds.page').then((m) => m.MedsPage) },
      { path: 'add', loadComponent: () => import('./pages/add/add.page').then((m) => m.AddPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'home' },
    ],
  },
  { path: 'scan', canActivate: [authGuard], loadComponent: () => import('./pages/scan/scan.page').then((m) => m.ScanPage) },
  { path: 'scan-review', canActivate: [authGuard], loadComponent: () => import('./pages/scan-review/scan-review.page').then((m) => m.ScanReviewPage) },
  { path: 'add-med', canActivate: [authGuard], loadComponent: () => import('./pages/add-med/add-med.page').then((m) => m.AddMedPage) },
  { path: 'safety', canActivate: [authGuard], loadComponent: () => import('./pages/safety/safety.page').then((m) => m.SafetyPage) },
  { path: '**', redirectTo: '' },
];
