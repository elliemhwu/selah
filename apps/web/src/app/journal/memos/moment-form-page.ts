import { DatePipe, formatDate } from '@angular/common';
import { Component, computed, effect, inject, LOCALE_ID, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MAX_SUMMARY_LENGTH, MAX_TITLE_LENGTH } from '@selah/journal-core';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { JournalApi } from '../data/journal-api';

/**
 * Sticks a moment on a journal: pick one already in Life, or write a new one
 * (ADR 0022, 0030). A journal has at most one moment. Route: `/journal/:id/moment`.
 */
@Component({
  selector: 'selah-moment-form-page',
  host: { class: 'form-page' },
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './moment-form-page.html',
  styleUrl: './moment-form-page.scss',
})
export class MomentFormPage {
  private readonly journalApi = inject(JournalApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly locale = inject(LOCALE_ID);
  private readonly journalId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  /** A new moment's id is generated once, so a retry never duplicates it (ADR 0007). */
  private readonly newId = crypto.randomUUID();
  protected readonly maxTitle = MAX_TITLE_LENGTH;

  protected readonly page = this.journalApi.page(() => this.journalId);
  private readonly allMoments = this.journalApi.moments();
  protected readonly linked = computed(() => (this.page.hasValue() ? (this.page.value()?.moment ?? null) : null));
  protected readonly moments = computed(() => this.allMoments.value().filter((m) => m.id !== this.linked()?.id));
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly notFound = computed(() => !!this.page.error());

  protected readonly form = inject(NonNullableFormBuilder).group({
    date: ['', Validators.required],
    title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_TITLE_LENGTH)]],
    summary: ['', Validators.maxLength(MAX_SUMMARY_LENGTH)],
  });
  protected readonly saving = signal(false);

  constructor() {
    // A new moment starts on the day the entry was written, in local time.
    effect(() => {
      const journal = this.page.hasValue() ? this.page.value()?.journal : undefined;
      if (journal && !this.form.controls.date.dirty) {
        this.form.controls.date.setValue(formatDate(journal.writtenAt, 'yyyy-MM-dd', this.locale));
      }
    });
  }

  protected cancel(): void {
    this.nav.leave(this.backTo());
  }

  protected async pick(momentId: string | null): Promise<void> {
    await this.run(
      () => this.journalApi.linkMoment(this.journalId, momentId),
      momentId ? $localize`:@@moment.linked:Moment stuck on the page.` : $localize`:@@moment.unlinked:Moment taken off the page.`,
    );
  }

  async create(): Promise<void> {
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    const { date, title, summary } = this.form.getRawValue();
    await this.run(() => this.journalApi.createMomentFor(this.journalId, this.newId, { date, title, summary }), $localize`:@@moment.linked:Moment stuck on the page.`);
  }

  protected errorText(control: AbstractControl): string {
    const errors = control.errors ?? {};
    if (errors['server']) return errors['server'] as string;
    if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
    return $localize`:@@error.required:Required.`;
  }

  private async run(work: () => Promise<void>, message: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
      this.nav.leave(this.backTo(), message);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => (this.form.controls as Record<string, AbstractControl>)[field]);
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  private backTo(): string {
    return `/journal/${this.journalId}`;
  }
}
