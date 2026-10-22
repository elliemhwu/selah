import { Route } from '@angular/router';

/** Form routes fill the screen on a phone (ADR 0022). */
const form = { form: true };

// Journal, lazy-loaded at /journal so its code ships as its own chunk (ADR 0030).
export const journalRoutes: Route[] = [
  {
    path: '',
    title: $localize`:@@journal.title:Journal`,
    loadComponent: () => import('./list/journal-list-page').then((m) => m.JournalListPage),
  },
  {
    path: 'new',
    title: $localize`:@@journal.diary:Dear Diary`,
    loadComponent: () => import('./diary/diary-page').then((m) => m.DiaryPage),
  },
  {
    path: 'life',
    title: $localize`:@@journal.life:Life`,
    loadComponent: () => import('./life/life-page').then((m) => m.LifePage),
  },
  {
    path: 'life/moments/:id',
    title: $localize`:@@moment.title:Moment`,
    loadComponent: () => import('./life/moment-page').then((m) => m.MomentPage),
  },
  {
    path: ':id',
    title: $localize`:@@journal.diary:Dear Diary`,
    loadComponent: () => import('./diary/diary-page').then((m) => m.DiaryPage),
  },
  {
    path: ':id/comment',
    title: $localize`:@@memo.commentTitle:Comment`,
    data: { ...form, memo: 'comment' },
    loadComponent: () => import('./memos/memo-form-page').then((m) => m.MemoFormPage),
  },
  {
    path: ':id/comment/:memoId',
    title: $localize`:@@memo.commentTitle:Comment`,
    data: { ...form, memo: 'comment' },
    loadComponent: () => import('./memos/memo-form-page').then((m) => m.MemoFormPage),
  },
  {
    path: ':id/god-note',
    title: $localize`:@@memo.godNoteTitle:God note`,
    data: { ...form, memo: 'godNote' },
    loadComponent: () => import('./memos/memo-form-page').then((m) => m.MemoFormPage),
  },
  {
    path: ':id/god-note/:memoId',
    title: $localize`:@@memo.godNoteTitle:God note`,
    data: { ...form, memo: 'godNote' },
    loadComponent: () => import('./memos/memo-form-page').then((m) => m.MemoFormPage),
  },
  {
    path: ':id/moment',
    title: $localize`:@@moment.title:Moment`,
    data: form,
    loadComponent: () => import('./memos/moment-form-page').then((m) => m.MomentFormPage),
  },
];
