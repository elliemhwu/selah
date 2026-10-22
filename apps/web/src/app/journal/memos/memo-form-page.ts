import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MAX_VERSE_REF_LENGTH } from '@selah/journal-core';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { JournalApi } from '../data/journal-api';

export type MemoFormKind = 'comment' | 'godNote';

/**
 * Writes or edits a comment or a god note on a journal (ADR 0022, 0030),
 * on the memo's own paper. Routes: `/journal/:id/comment`,
 * `/journal/:id/comment/:memoId`, `/journal/:id/god-note` and
 * `/journal/:id/god-note/:memoId`; the route's `memo` data says which.
 */
@Component({
  selector: 'selah-memo-form-page',
  host: { class: 'form-page', '[class.god-note]': "kind === 'godNote'" },
  imports: [ReactiveFormsModule],
  templateUrl: './memo-form-page.html',
  styleUrl: './memo-form-page.scss',
})
export class MemoFormPage {
  private readonly journalApi = inject(JournalApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute).snapshot;
  protected readonly kind = this.route.data['memo'] as MemoFormKind;
  private readonly journalId = this.route.paramMap.get('id') ?? '';
  private readonly editId = this.route.paramMap.get('memoId') ?? undefined;
  /** A new memo's id is generated once, so a retry never duplicates it (ADR 0007). */
  private readonly id = this.editId ?? crypto.randomUUID();
  protected readonly editing = !!this.editId;
  protected readonly maxVerse = MAX_VERSE_REF_LENGTH;

  protected readonly page = this.journalApi.page(() => this.journalId);
  private readonly existing = computed(() => {
    const memos = this.page.hasValue() ? (this.page.value()?.memos ?? []) : [];
    for (const memo of memos) {
      if (memo.id !== this.editId) continue;
      if (memo.kind === 'comment' && this.kind === 'comment') return { body: memo.comment.body, verseRef: '', writtenAt: memo.comment.writtenAt };
      if (memo.kind === 'godNote' && this.kind === 'godNote') {
        return { body: memo.godNote.body, verseRef: memo.godNote.verseRef ?? '', writtenAt: memo.godNote.writtenAt };
      }
    }
    return undefined;
  });
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly notFound = computed(() => !!this.page.error() || (this.editing && this.page.status() === 'resolved' && !this.existing()));

  protected readonly form = inject(NonNullableFormBuilder).group({
    body: ['', [Validators.required, Validators.pattern(/\S/)]],
    verseRef: ['', Validators.maxLength(MAX_VERSE_REF_LENGTH)],
  });
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);

  constructor() {
    effect(() => {
      const existing = this.existing();
      if (!existing || this.form.dirty) return;
      this.form.setValue({ body: existing.body, verseRef: existing.verseRef });
    });
  }

  protected cancel(): void {
    this.nav.leave(this.backTo());
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    const { body, verseRef } = this.form.getRawValue();
    // A memo keeps the time it was first written; editing it doesn't move it down the page.
    const writtenAt = this.existing()?.writtenAt ?? new Date().toISOString();
    this.saving.set(true);
    try {
      if (this.kind === 'comment') await this.journalApi.saveComment(this.id, { journalId: this.journalId, writtenAt, body });
      else await this.journalApi.saveGodNote(this.id, { journalId: this.journalId, writtenAt, body, verseRef });
      this.nav.leave(this.backTo(), $localize`:@@memo.saved:Stuck on the page.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!this.editId) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      if (this.kind === 'comment') await this.journalApi.removeComment(this.editId);
      else await this.journalApi.removeGodNote(this.editId);
      this.nav.leave(this.backTo(), $localize`:@@memo.deleted:Memo taken off the page.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  protected errorText(control: AbstractControl): string {
    const errors = control.errors ?? {};
    if (errors['server']) return errors['server'] as string;
    if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
    return $localize`:@@memo.empty:Write something first.`;
  }

  private backTo(): string {
    return `/journal/${this.journalId}`;
  }

  private controlFor(field: string): AbstractControl | undefined {
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
