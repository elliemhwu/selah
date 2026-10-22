import { DatePipe, DOCUMENT, Location } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DiaryMemo } from '@selah/journal-core';
import { isNotFound, problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { JournalApi } from '../data/journal-api';
import { JournalHeader } from '../journal-header';
import { memoPlacement } from './memo-layout';

/** How long typing pauses before the page saves itself. */
export const AUTOSAVE_MS = 700;

type MemoKind = 'comment' | 'god-note' | 'moment';

/**
 * Dear Diary (docs/selah-journal-framework.md, ADR 0030): one journal as an
 * empty lined page that saves itself, with its memos stuck below. Routes:
 * `/journal/new` and `/journal/:id`. A new page is stored on its first words,
 * and its address becomes `/journal/:id` without leaving the page.
 */
@Component({
  selector: 'selah-diary-page',
  imports: [DatePipe, JournalHeader, RouterLink],
  templateUrl: './diary-page.html',
  styleUrl: './diary-page.scss',
})
export class DiaryPage {
  private readonly journalApi = inject(JournalApi);
  private readonly toast = inject(Toast);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  /** A new page's id is generated once, so saving again never duplicates it (ADR 0007). */
  protected readonly id = this.editId ?? crypto.randomUUID();
  /** A new page is dated when it was opened. */
  private readonly openedAt = new Date().toISOString();

  /** Whether the journal is stored; a new page isn't until it has words. */
  protected readonly saved = signal(!!this.editId);
  protected readonly page = this.journalApi.page(() => (this.saved() ? this.id : undefined));
  private readonly journal = computed(() => (this.page.hasValue() ? this.page.value()?.journal : undefined));
  protected readonly writtenAt = computed(() => this.journal()?.writtenAt ?? this.openedAt);
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly notFound = computed(() => isNotFound(this.page.error()));
  protected readonly status = signal<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  protected readonly confirmingDelete = signal(false);

  /** Memos with where they sit; the side and tilt come from the memo id, never stored. */
  protected readonly memos = computed(() =>
    (this.page.hasValue() ? (this.page.value()?.memos ?? []) : []).map((memo) => {
      const place = memoPlacement(memo.id);
      const nudge = place.side === 'left' ? 'margin-left' : 'margin-right';
      return { memo, side: place.side, style: { transform: `rotate(${place.tilt}deg)`, [nudge]: `${place.nudge}px` } };
    }),
  );

  /** Not there while the entry is missing. */
  private readonly sheet = viewChild<ElementRef<HTMLTextAreaElement>>('sheet');
  /** Typed but not yet saved. */
  private dirty = false;
  private filled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Saves run one after another, in the order they were typed. */
  private writing: Promise<void> = Promise.resolve();

  constructor() {
    // Show the stored words once, unless the user already typed.
    effect(() => {
      const journal = this.journal();
      const sheet = this.sheet()?.nativeElement;
      if (!journal || !sheet || this.filled || this.dirty) return;
      this.filled = true;
      sheet.value = journal.body;
      this.grow();
    });
    afterNextRender(() => {
      if (!this.editId) this.sheet()?.nativeElement.focus();
    });

    // Save what's typed when the page is left or the app goes to the background.
    const document = inject(DOCUMENT);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHidden);
      this.flush();
    });
  }

  protected onInput(): void {
    this.dirty = true;
    this.grow();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
  }

  /** Saves now what's waiting; a new page with no words yet stays unsaved. */
  protected flush(): Promise<void> {
    clearTimeout(this.timer);
    const sheet = this.sheet()?.nativeElement;
    if (!this.dirty || !sheet) return this.writing;
    const body = sheet.value;
    this.dirty = false;
    if (!this.saved() && body.trim() === '') return this.writing;
    this.writing = this.writing.then(() => this.write(body));
    return this.writing;
  }

  protected async stick(kind: MemoKind): Promise<void> {
    await this.flush();
    if (this.saved()) void this.router.navigate(['/journal', this.id, kind]);
  }

  protected async remove(): Promise<void> {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    clearTimeout(this.timer);
    this.dirty = false;
    try {
      await this.writing;
      await this.journalApi.removeJournal(this.id);
      this.toast.show($localize`:@@journal.deleted:Entry deleted.`);
      void this.router.navigateByUrl('/journal', { replaceUrl: true });
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    }
  }

  protected trackMemo(memo: DiaryMemo): string {
    return `${memo.kind}:${memo.id}`;
  }

  private async write(body: string): Promise<void> {
    this.status.set('saving');
    const journal = this.journal();
    try {
      await this.journalApi.saveJournal(this.id, {
        writtenAt: journal?.writtenAt ?? this.openedAt,
        datePrecision: journal?.datePrecision,
        momentId: journal?.momentId ?? null,
        body,
      });
      if (!this.saved()) {
        this.saved.set(true);
        this.filled = true;
        this.location.replaceState(this.router.serializeUrl(this.router.createUrlTree(['/journal', this.id])));
      }
      this.status.set('saved');
    } catch (error) {
      // Keep the words on the page and try again with the next keystroke.
      this.dirty = true;
      this.status.set('failed');
      this.toast.show(problemOf(error).message);
    }
  }

  /** The page grows with the writing, so the whole entry scrolls as one sheet. */
  private grow(): void {
    const sheet = this.sheet()?.nativeElement;
    if (!sheet) return;
    sheet.style.height = 'auto';
    sheet.style.height = `${sheet.scrollHeight}px`;
  }
}
