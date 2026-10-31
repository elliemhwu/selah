import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MAX_NAME_LENGTH } from '@selah/planner-core';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * An area or a group: a name, and for a group its area and the group it sits
 * in (ADR 0033). The route's `data.kind` says which. Routes: `/planner/areas/new`,
 * `/planner/areas/:id`, `/planner/groups/new` (`?area=`), `/planner/groups/:id`.
 */
@Component({
  selector: 'selah-name-form-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <button type="button" class="btn btn-quiet" (click)="leave()" i18n="@@action.cancel">Cancel</button>
        <h1>{{ heading }}</h1>
        <button type="submit" form="name-form" class="btn btn-quiet save" [disabled]="saving() || notFound()" i18n="@@action.save">Save</button>
      </div>
    </header>

    @if (notFound()) {
      <p class="form-status muted" i18n="@@planner.notFound">This isn't in the planner.</p>
    } @else {
      <form id="name-form" class="form-body" [formGroup]="form" (ngSubmit)="save()">
        <div class="ledger-row">
          <label for="item-name" i18n="@@project.name">Name</label>
          <input id="item-name" formControlName="name" autocomplete="off" [attr.maxlength]="maxName" />
        </div>
        @if (form.controls.name.touched && form.controls.name.invalid) {
          <p class="field-error">{{ errorText(form.controls.name) }}</p>
        }
        @if (kind === 'area') {
          <p class="hint small muted" i18n="@@area.hint">An area of life, such as Work, Study or Church.</p>
        } @else {
          <div class="ledger-row">
            <label for="group-area" i18n="@@project.area">Area</label>
            <select id="group-area" formControlName="areaId">
              @for (entry of tree.value()?.areas ?? []; track entry.area.id) {
                <option [value]="entry.area.id">{{ entry.area.name }}</option>
              }
            </select>
          </div>
          <div class="ledger-row">
            <label for="group-parent" i18n="@@group.parent">Inside</label>
            <select id="group-parent" formControlName="parentGroupId">
              <option value="" i18n="@@project.noGroup">None</option>
              @for (group of parents(); track group.group.id) {
                <option [value]="group.group.id">{{ group.group.name }}</option>
              }
            </select>
          </div>
          @if (form.controls.parentGroupId.invalid) {
            <p class="field-error">{{ errorText(form.controls.parentGroupId) }}</p>
          }
          <p class="hint small muted" i18n="@@group.hint">A group gathers projects, such as the ones for one job.</p>
        }
      </form>
    }
  `,
})
export class NameFormPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute).snapshot;
  protected readonly kind = this.route.data['kind'] as 'area' | 'group';
  private readonly routeId = this.route.paramMap.get('id');
  private readonly isNew = !this.routeId;
  private readonly id = this.routeId ?? crypto.randomUUID();
  protected readonly maxName = MAX_NAME_LENGTH;
  protected readonly heading =
    this.kind === 'area'
      ? this.isNew
        ? $localize`:@@area.newTitle:New area`
        : $localize`:@@area.editTitle:Area`
      : this.isNew
        ? $localize`:@@group.newTitle:New group`
        : $localize`:@@group.editTitle:Group`;

  protected readonly tree = this.api.tree();
  private readonly existing = computed(() => {
    if (this.isNew) return null;
    const data = this.api.data();
    const rows: readonly { id: string; name: string; deletedAt: string | null; areaId?: string; parentGroupId?: string | null }[] =
      this.kind === 'area' ? data.areas : data.projectGroups;
    return rows.find((row) => row.id === this.id && !row.deletedAt) ?? null;
  });
  protected readonly notFound = computed(() => !this.isNew && this.api.store.ready() && !this.existing());

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_NAME_LENGTH)]],
    areaId: [this.route.queryParamMap.get('area') ?? ''],
    parentGroupId: [''],
  });
  private readonly areaId = toSignal(this.form.controls.areaId.valueChanges, { initialValue: this.form.controls.areaId.value });
  /** Groups this one can sit in: the same area, never itself. */
  protected readonly parents = computed(
    () => this.tree.value()?.areas.find((a) => a.area.id === this.areaId())?.groups.filter((g) => g.group.id !== this.id) ?? [],
  );
  protected readonly saving = signal(false);
  private filled = false;

  constructor() {
    effect(() => {
      const row = this.existing();
      if (row && !this.filled) {
        this.filled = true;
        this.form.setValue({ name: row.name, areaId: row.areaId ?? '', parentGroupId: row.parentGroupId ?? '' });
      }
      const first = this.tree.value()?.areas[0]?.area.id;
      if (this.kind === 'group' && first && !this.form.controls.areaId.value) this.form.controls.areaId.setValue(first);
    });
  }

  protected leave(message?: string): void {
    this.nav.leave('/planner/projects', message);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const { name, areaId, parentGroupId } = this.form.getRawValue();
    try {
      if (this.kind === 'area') await this.api.saveArea(this.id, name);
      else await this.api.saveGroup(this.id, { name, areaId, parentGroupId: parentGroupId || null });
      this.leave($localize`:@@planner.saved:Saved.`);
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
