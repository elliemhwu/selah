import { Route } from '@angular/router';

const placeholder = () => import('./shell/placeholder-page').then((m) => m.PlaceholderPage);
/** Form routes hide the bottom navigation and fill the screen on a phone (ADR 0022). */
const form = { form: true };

// Feature screens are lazy-loaded per route (ADR 0020).
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: $localize`:@@nav.home:Home`,
    loadComponent: () => import('./finance/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'records/new',
    title: $localize`:@@record.title:New entry`,
    data: form,
    loadComponent: () => import('./finance/records/record-form-page').then((m) => m.RecordFormPage),
  },
  {
    path: 'records/batch',
    title: $localize`:@@batch.routeTitle:Record items`,
    data: form,
    loadComponent: () => import('./finance/records/batch-record-page').then((m) => m.BatchRecordPage),
  },
  { path: 'records', title: $localize`:@@nav.records:Records`, loadComponent: placeholder },
  {
    path: 'budget',
    title: $localize`:@@nav.budget:Budget`,
    loadComponent: () => import('./finance/budget/budget-page').then((m) => m.BudgetPage),
  },
  {
    path: 'budget/versions',
    title: $localize`:@@versions.title:Plan versions`,
    data: form,
    loadComponent: () => import('./finance/budget/budget-versions-page').then((m) => m.BudgetVersionsPage),
  },
  {
    path: 'budget/items/:id',
    title: $localize`:@@budgetItem.routeTitle:Budget item`,
    data: form,
    loadComponent: () => import('./finance/budget/budget-item-page').then((m) => m.BudgetItemPage),
  },
  { path: 'review', title: $localize`:@@nav.review:Review`, loadComponent: placeholder },
  {
    path: 'accounts',
    title: $localize`:@@nav.accounts:Accounts`,
    loadComponent: () => import('./finance/accounts/accounts-page').then((m) => m.AccountsPage),
  },
  {
    path: 'accounts/new',
    title: $localize`:@@account.newTitle:New account`,
    data: form,
    loadComponent: () => import('./finance/accounts/account-form-page').then((m) => m.AccountFormPage),
  },
  {
    path: 'accounts/transfer',
    title: $localize`:@@transfer.title:Transfer`,
    data: form,
    loadComponent: () => import('./finance/accounts/transfer-page').then((m) => m.TransferPage),
  },
  {
    path: 'accounts/adjust',
    title: $localize`:@@adjust.title:Adjust balance`,
    data: form,
    loadComponent: () => import('./finance/accounts/adjust-page').then((m) => m.AdjustPage),
  },
  {
    path: 'accounts/:id',
    title: $localize`:@@account.editTitle:Edit account`,
    data: form,
    loadComponent: () => import('./finance/accounts/account-form-page').then((m) => m.AccountFormPage),
  },
  { path: '**', redirectTo: '' },
];
