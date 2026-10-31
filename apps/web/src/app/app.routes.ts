import { inject } from '@angular/core';
import { Route, Router, type UrlMatcher } from '@angular/router';

/** Where Finance's screens were before it moved to /finance (ADR 0030). */
const OLD_FINANCE_PATHS = new Set(['records', 'budget', 'review', 'accounts']);

/** Matches a link from before the move, such as `/records/:id` or `/settings/categories/new`. */
const oldFinanceLink: UrlMatcher = (segments) => {
  const [first, second] = segments.map((segment) => segment.path);
  const old = OLD_FINANCE_PATHS.has(first) || (first === 'settings' && second === 'categories');
  return old ? { consumed: segments } : null;
};

// Each module is lazy-loaded under its own route (ADR 0030); the /selah/ prefix
// on Pages comes from the base href, not from these paths.
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: $localize`:@@selahHome.title:Selah`,
    loadComponent: () => import('./home/selah-home-page').then((m) => m.SelahHomePage),
  },
  {
    path: 'finance',
    loadChildren: () => import('./finance/finance.routes').then((m) => m.financeRoutes),
  },
  {
    // The module lock (PIN or biometric) will sit here as a canMatch guard.
    path: 'journal',
    loadChildren: () => import('./journal/journal.routes').then((m) => m.journalRoutes),
  },
  {
    path: 'planner',
    loadChildren: () => import('./planner/planner.routes').then((m) => m.plannerRoutes),
  },
  {
    path: 'settings',
    title: $localize`:@@settings.title:Settings`,
    loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    // Old links keep working: the same path under /finance, with its query and fragment.
    matcher: oldFinanceLink,
    redirectTo: ({ url, queryParams, fragment }) => {
      const paths = url.map((segment) => segment.path);
      const rest = paths[0] === 'settings' ? paths.slice(1) : paths;
      return inject(Router).createUrlTree(['/finance', ...rest], { queryParams, fragment: fragment ?? undefined });
    },
  },
  { path: '**', redirectTo: '' },
];
