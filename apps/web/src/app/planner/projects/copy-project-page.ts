import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MAX_NAME_LENGTH } from '@selah/planner-core';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * Starts a project over as a new one, such as reading a book again (the v1
 * spec, §6): same area, group and kind, every task open again and in order.
 * Route: `/planner/projects/:id/copy`.
 */
@Component({
  selector: 'selah-copy-project-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <button type="button" class="btn btn-quiet" (click)="cancel()" i18n="@@action.cancel">Cancel</button>
        <h1 i18n="@@project.copyTitle">Copy project</h1>
        <button type="submit" form="copy-form" class="btn btn-quiet save" [disabled]="saving() || !source()" i18n="@@project.copyAction">Copy</button>
      </div>
    </header>

    @if (detail.error()) {
      <p class="form-status muted" i18n="@@project.notFound">This project isn't in the planner.</p>
    } @else if (source(); as s) {
      <form id="copy-form" class="form-body" [formGroup]="form" (ngSubmit)="save()">
        <p class="small muted" i18n="@@project.copyHint">A fresh copy of the {{ s.tasks.length }} tasks in “{{ s.project.name }}”, all open again and in the same order. Its records stay with the original.</p>
        <div class="ledger-row">
          <label for="copy-name" i18n="@@project.name">Name</label>
          <input id="copy-name" formControlName="name" autocomplete="off" [attr.maxlength]="maxName" />
        </div>
        @if (form.controls.name.touched && form.controls.name.invalid) {
          <p class="field-error">{{ errorText(form.controls.name) }}</p>
        }
      </form>
    }
  `,
})
export class CopyProjectPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly sourceId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  /** Generated once, so a retry never makes two copies (ADR 0007). */
  private readonly newId = crypto.randomUUID();
  protected readonly maxName = MAX_NAME_LENGTH;

  protected readonly detail = this.api.project(() => this.sourceId);
  protected readonly source = computed(() => (this.detail.hasValue() ? (this.detail.value() ?? null) : null));
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_NAME_LENGTH)]],
  });
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const name = this.source()?.project.name;
      if (name && !this.form.controls.name.dirty) this.form.controls.name.setValue($localize`:@@project.copyName:${name}:name: · again`);
    });
  }

  protected cancel(): void {
    this.nav.leave(`/planner/projects/${this.sourceId}`);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.api.copyProject(this.newId, this.sourceId, this.form.getRawValue().name);
      await this.router.navigate(['/planner/projects', this.newId], { replaceUrl: true });
      this.toast.show($localize`:@@project.copied:Project copied.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => (this.form.controls as Record<string, AbstractControl>)[field]);
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  protected errorText(control: AbstractControl): string {
    const errors = control.errors ?? {};
    if (errors['server']) return errors['server'] as string;
    if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
    return $localize`:@@error.required:Required.`;
  }
}
