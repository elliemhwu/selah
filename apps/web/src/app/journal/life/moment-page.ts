import { DatePipe, formatDate, Location } from '@angular/common';
import { Component, computed, effect, inject, LOCALE_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MAX_SUMMARY_LENGTH, MAX_TITLE_LENGTH, type MomentInput } from '@selah/journal-core';
import { isNotFound, problemOf } from '../../core/problem';
import { Toast } from '../../ui/toast';
import { Autosave } from '../autosave';
import { JournalApi } from '../data/journal-api';
import { memoPlacement } from '../diary/memo-layout';
import { excerptOf } from '../excerpt';
import { JournalHeader } from '../journal-header';

/**
 * One moment in Life, as the canvas (ADR 0032): a blank page like Dear Diary,
 * stored once its title has words and saved as it is written, with its
 * journals stuck below as memos. Routes: `/journal/life/moments/new` and
 * `/journal/life/moments/:id`; a new moment's address becomes the second
 * without leaving the page.
 */
@Component({
  selector: 'selah-moment-page',
  imports: [DatePipe, JournalHeader, ReactiveFormsModule, RouterLink],
  templateUrl: './moment-page.html',
  styleUrls: ['../memo-paper.scss', './moment-page.scss'],
})
export class MomentPage {
  private readonly journalApi = inject(JournalApi);
  private readonly toast = inject(Toast);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly editId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  /** A new moment's id is generated once, so saving again never duplicates it (ADR 0007). */
  protected readonly id = this.editId ?? crypto.randomUUID();
  protected readonly maxTitle = MAX_TITLE_LENGTH;
  protected readonly maxSummary = MAX_SUMMARY_LENGTH;

  /** Whether the moment is stored; a new one isn't until its title has words. */
  protected readonly saved = signal(!!this.editId);
  protected readonly page = this.journalApi.moment(() => (this.saved() ? this.id : undefined));
  private readonly moment = computed(() => (this.page.hasValue() ? this.page.value()?.moment : undefined));
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly notFound = computed(() => isNotFound(this.page.error()));
  protected readonly status = signal<'idle' | 'saving' | 'saved' | 'failed' | 'untitled'>('idle');
  protected readonly confirmingDelete = signal(false);

  /** A new moment is dated today, in local time. */
  protected readonly form = inject(NonNullableFormBuilder).group({
    date: formatDate(new Date(), 'yyyy-MM-dd', inject(LOCALE_ID)),
    title: '',
    summary: '',
  });

  /** Its journals as memos; the side and tilt come from the journal id, never stored. */
  protected readonly memos = computed(() =>
    (this.page.hasValue() ? (this.page.value()?.memos ?? []) : []).map((memo) => {
      const place = memoPlacement(memo.id);
      const nudge = place.side === 'left' ? 'margin-left' : 'margin-right';
      return { memo, excerpt: excerptOf(memo.journal.body), side: place.side, style: { transform: `rotate(${place.tilt}deg)`, [nudge]: `${place.nudge}px` } };
    }),
  );

  private filled = false;
  /** A moment needs a date and a title to be stored. */
  private readonly autosave = new Autosave<MomentInput>(
    () => {
      const { date, title, summary } = this.form.getRawValue();
      if (date && title.trim() !== '') return { date, title, summary };
      if (this.saved()) this.status.set('untitled');
      return null;
    },
    (input) => this.write(input),
  );

  constructor() {
    // Show the stored moment once, unless the user already changed it.
    effect(() => {
      const moment = this.moment();
      if (!moment || this.filled || this.autosave.pending) return;
      this.filled = true;
      this.form.setValue({ date: moment.date, title: moment.title, summary: moment.summary ?? '' }, { emitEvent: false });
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.autosave.changed());
  }

  /** Saves now what's waiting. */
  protected flush(): Promise<void> {
    return this.autosave.flush();
  }

  protected async stickJournal(): Promise<void> {
    await this.flush();
    if (this.saved()) void this.router.navigate(['/journal/life/moments', this.id, 'journal']);
  }

  protected async remove(): Promise<void> {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    try {
      await this.autosave.cancel();
      await this.journalApi.removeMoment(this.id);
      this.toast.show($localize`:@@moment.deleted:Moment deleted. Its entries stay in the journal.`);
      void this.router.navigateByUrl('/journal/life', { replaceUrl: true });
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    }
  }

  private async write(input: MomentInput): Promise<boolean> {
    this.status.set('saving');
    try {
      await this.journalApi.saveMoment(this.id, input);
      if (!this.saved()) {
        this.saved.set(true);
        this.filled = true;
        this.location.replaceState(this.router.serializeUrl(this.router.createUrlTree(['/journal/life/moments', this.id])));
      }
      this.status.set('saved');
      return true;
    } catch (error) {
      // Keep what's on the page and try again with the next change.
      this.status.set('failed');
      this.toast.show(problemOf(error).message);
      return false;
    }
  }
}
