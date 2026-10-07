import { Route } from '@angular/router';

const placeholder = () => import('./shell/placeholder-page').then((m) => m.PlaceholderPage);

// Feature screens are lazy-loaded per route (ADR 0020).
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: $localize`:@@nav.home:Home`,
    loadComponent: () => import('./finance/home/home-page').then((m) => m.HomePage),
  },
  { path: 'records', title: $localize`:@@nav.records:Records`, loadComponent: placeholder },
  { path: 'budget', title: $localize`:@@nav.budget:Budget`, loadComponent: placeholder },
  { path: 'review', title: $localize`:@@nav.review:Review`, loadComponent: placeholder },
  {
    path: 'accounts',
    title: $localize`:@@nav.accounts:Accounts`,
    loadComponent: () => import('./finance/accounts/accounts-page').then((m) => m.AccountsPage),
  },
  { path: '**', redirectTo: '' },
];
