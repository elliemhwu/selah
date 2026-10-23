import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { JournalChoice } from '@selah/journal-core';
import { problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { JournalApi } from '../data/journal-api';
import { excerptOf } from '../excerpt';

/**
 * Sticks a journal on a moment (ADR 0022, 0032): write a new one for it, or
 * pick one already written. A journal belongs to at most one moment, so
 * picking one moves it from the moment it was on. Route:
 * `/journal/life/moments/:id/journal`.
 */
@Component({
  selector: 'selah-journal-memo-form-page',
  host: { class: 'form-page' },
  imports: [DatePipe],
  templateUrl: './journal-memo-form-page.html',
  styleUrl: './journal-memo-form-page.scss',
})
export class JournalMemoFormPage {
  private readonly journalApi = inject(JournalApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  private readonly momentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  private readonly page = this.journalApi.moment(() => this.momentId);
  private readonly choices = this.journalApi.journalChoices(() => this.momentId);
  protected readonly linked = computed(() => this.views(this.choices.hasValue() ? (this.choices.value()?.linked ?? []) : []));
  protected readonly others = computed(() => this.views(this.choices.hasValue() ? (this.choices.value()?.others ?? []) : []));
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly notFound = computed(() => !!this.page.error());
  protected readonly saving = signal(false);

  protected cancel(): void {
    this.nav.leave(this.backTo());
  }

  /** A blank diary page for this moment; it replaces this form, so back from it returns to the moment. */
  protected write(): void {
    void this.router.navigate(['/journal/new'], { queryParams: { moment: this.momentId }, replaceUrl: true });
  }

  protected async pick(choice: JournalChoice): Promise<void> {
    const message = choice.moment
      ? $localize`:@@journalMemo.moved:Entry moved here from “${choice.moment.title}:title:”.`
      : $localize`:@@journalMemo.linked:Entry stuck on the moment.`;
    await this.run(() => this.journalApi.linkMoment(choice.journal.id, this.momentId), message);
  }

  protected async takeOff(choice: JournalChoice): Promise<void> {
    await this.run(() => this.journalApi.linkMoment(choice.journal.id, null), $localize`:@@journalMemo.unlinked:Entry taken off the moment.`);
  }

  private views(choices: JournalChoice[]) {
    return choices.map((choice) => ({ choice, excerpt: excerptOf(choice.journal.body) }));
  }

  private async run(work: () => Promise<void>, message: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
      this.nav.leave(this.backTo(), message);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private backTo(): string {
    return `/journal/life/moments/${this.momentId}`;
  }
}
