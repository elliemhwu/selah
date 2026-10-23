import { DatePipe, Location } from '@angular/common';
import { afterNextRender, Component, computed, effect, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DiaryMemo } from '@selah/journal-core';
import { isNotFound, problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { Autosave } from '../autosave';
import { JournalApi } from '../data/journal-api';
import { JournalHeader } from '../journal-header';
import { memoPlacement } from './memo-layout';

export { AUTOSAVE_MS } from '../autosave';

type MemoKind = 'comment' | 'god-note' | 'moment';

/**
 * Dear Diary (docs/selah-journal-framework.md, ADR 0030): one journal as an
 * empty lined page that saves itself, with its memos stuck below. Routes:
 * `/journal/new` and `/journal/:id`. A new page is stored on its first words,
 * and its address becomes `/journal/:id` without leaving the page.
 * `/journal/new?moment=:id` starts a page for that moment (ADR 0032).
 */
@Component({
  selector: 'selah-diary-page',
  imports: [DatePipe, JournalHeader, RouterLink],
  templateUrl: './diary-page.html',
  styleUrls: ['../memo-paper.scss', './diary-page.scss'],
})
export class DiaryPage {
  private readonly journalApi = inject(JournalApi);
  private readonly toast = inject(Toast);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly editId = this.route.paramMap.get('id') ?? undefined;
  /** The moment a new page was started from. */
  private readonly forMoment = this.editId ? null : this.route.queryParamMap.get('moment');
  /** Back goes to the moment a new page was started from. */
  protected readonly back = this.forMoment ? `/journal/life/moments/${this.forMoment}` : '/journal';
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
  private filled = false;
  /** A new page with no words yet stays unsaved. */
  private readonly autosave = new Autosave<string>(
    () => {
      const body = this.sheet()?.nativeElement.value;
      return body === undefined || (!this.saved() && body.trim() === '') ? null : body;
    },
    (body) => this.write(body),
  );

  constructor() {
    // Show the stored words once, unless the user already typed.
    effect(() => {
      const journal = this.journal();
      const sheet = this.sheet()?.nativeElement;
      if (!journal || !sheet || this.filled || this.autosave.pending) return;
      this.filled = true;
      sheet.value = journal.body;
      this.grow();
    });
    afterNextRender(() => {
      if (!this.editId) this.sheet()?.nativeElement.focus();
    });
  }

  protected onInput(): void {
    this.autosave.changed();
    this.grow();
  }

  /** Saves now what's waiting. */
  protected flush(): Promise<void> {
    return this.autosave.flush();
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
    try {
      await this.autosave.cancel();
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

  private async write(body: string): Promise<boolean> {
    this.status.set('saving');
    const journal = this.journal();
    try {
      await this.journalApi.saveJournal(this.id, {
        writtenAt: journal?.writtenAt ?? this.openedAt,
        datePrecision: journal?.datePrecision,
        // A new page joins its moment if that moment is still in Life.
        momentId: journal ? journal.momentId : this.journalApi.liveMoment(this.forMoment),
        body,
      });
      if (!this.saved()) {
        this.saved.set(true);
        this.filled = true;
        this.location.replaceState(this.router.serializeUrl(this.router.createUrlTree(['/journal', this.id])));
      }
      this.status.set('saved');
      return true;
    } catch (error) {
      // Keep the words on the page and try again with the next keystroke.
      this.status.set('failed');
      this.toast.show(problemOf(error).message);
      return false;
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
