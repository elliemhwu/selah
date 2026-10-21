import { Route } from '@angular/router';
import { FinanceShell } from './finance-shell';

/** Form routes hide the bottom navigation and fill the screen on a phone (ADR 0022). */
const form = { form: true };

// Finance, lazy-loaded at /finance (ADR 0030). Its screens are lazy-loaded per route (ADR 0020).
export const financeRoutes: Route[] = [
  {
    path: '',
    component: FinanceShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: $localize`:@@nav.home:Home`,
        loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
      },
      {
        path: 'records/new',
        title: $localize`:@@record.title:New entry`,
        data: form,
        loadComponent: () => import('./records/record-form-page').then((m) => m.RecordFormPage),
      },
      {
        path: 'records/batch',
        title: $localize`:@@batch.routeTitle:Record items`,
        data: form,
        loadComponent: () => import('./records/batch-record-page').then((m) => m.BatchRecordPage),
      },
      {
        path: 'records/catch-up',
        title: $localize`:@@catchUp.title:Catch up`,
        data: form,
        loadComponent: () => import('./records/catch-up-page').then((m) => m.CatchUpPage),
      },
      {
        path: 'records',
        title: $localize`:@@nav.records:Records`,
        loadComponent: () => import('./records/records-page').then((m) => m.RecordsPage),
      },
      {
        path: 'records/:id',
        title: $localize`:@@record.editTitle:Edit entry`,
        data: form,
        loadComponent: () => import('./records/record-form-page').then((m) => m.RecordFormPage),
      },
      {
        path: 'budget',
        title: $localize`:@@nav.budget:Budget`,
        loadComponent: () => import('./budget/budget-page').then((m) => m.BudgetPage),
      },
      {
        path: 'budget/versions',
        title: $localize`:@@versions.title:Plan versions`,
        data: form,
        loadComponent: () => import('./budget/budget-versions-page').then((m) => m.BudgetVersionsPage),
      },
      {
        path: 'budget/items/:id',
        title: $localize`:@@budgetItem.routeTitle:Budget item`,
        data: form,
        loadComponent: () => import('./budget/budget-item-page').then((m) => m.BudgetItemPage),
      },
      {
        path: 'budget/transfers/new',
        title: $localize`:@@budgetTransfer.title:Move budget`,
        data: form,
        loadComponent: () => import('./budget/budget-transfer-page').then((m) => m.BudgetTransferPage),
      },
      {
        path: 'budget/transfers/:id',
        title: $localize`:@@budgetTransfer.editTitle:Edit budget move`,
        data: form,
        loadComponent: () => import('./budget/budget-transfer-page').then((m) => m.BudgetTransferPage),
      },
      {
        path: 'review',
        title: $localize`:@@nav.review:Review`,
        loadComponent: () => import('./review/review-page').then((m) => m.ReviewPage),
      },
      {
        path: 'accounts',
        title: $localize`:@@nav.accounts:Accounts`,
        loadComponent: () => import('./accounts/accounts-page').then((m) => m.AccountsPage),
      },
      {
        path: 'accounts/new',
        title: $localize`:@@account.newTitle:New account`,
        data: form,
        loadComponent: () => import('./accounts/account-form-page').then((m) => m.AccountFormPage),
      },
      {
        path: 'accounts/transfer',
        title: $localize`:@@transfer.title:Transfer`,
        data: form,
        loadComponent: () => import('./accounts/transfer-page').then((m) => m.TransferPage),
      },
      {
        path: 'accounts/adjust',
        title: $localize`:@@adjust.title:Adjust balance`,
        data: form,
        loadComponent: () => import('./accounts/adjust-page').then((m) => m.AdjustPage),
      },
      {
        path: 'accounts/transfer/:id',
        title: $localize`:@@transfer.editTitle:Edit transfer`,
        data: form,
        loadComponent: () => import('./accounts/transfer-page').then((m) => m.TransferPage),
      },
      {
        path: 'accounts/adjust/:id',
        title: $localize`:@@adjust.editTitle:Edit adjustment`,
        data: form,
        loadComponent: () => import('./accounts/adjust-page').then((m) => m.AdjustPage),
      },
      {
        path: 'accounts/:id',
        title: $localize`:@@account.editTitle:Edit account`,
        data: form,
        loadComponent: () => import('./accounts/account-form-page').then((m) => m.AccountFormPage),
      },
      {
        path: 'categories/new',
        title: $localize`:@@category.newTitle:New category`,
        data: form,
        loadComponent: () => import('./categories/category-form-page').then((m) => m.CategoryFormPage),
      },
      {
        path: 'categories/:id',
        title: $localize`:@@category.editTitle:Edit category`,
        data: form,
        loadComponent: () => import('./categories/category-form-page').then((m) => m.CategoryFormPage),
      },
    ],
  },
];
