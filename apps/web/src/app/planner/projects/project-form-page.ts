import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MAX_NAME_LENGTH } from '@selah/planner-core';
import type { ProjectMode } from '@selah/shared-types';
import { toSignal } from '@angular/core/rxjs-interop';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * A project: its name, area, optional group, and whether it is a list or a
 * queue (ADR 0033). Routes: `/planner/projects/new` (`?area=`) and `/planner/projects/:id/edit`.
 */
@Component({
  selector: 'selah-project-form-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule],
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <button type="button" class="btn btn-quiet" (click)="cancel()" i18n="@@action.cancel">Cancel</button>
        @if (isNew) {
          <h1 i18n="@@project.newTitle">New project</h1>
        } @else {
          <h1 i18n="@@project.editTitle">Edit project</h1>
        }
        <button type="submit" form="project-form" class="btn btn-quiet save" [disabled]="saving() || notFound()" i18n="@@action.save">Save</button>
      </div>
    </header>

    @if (notFound()) {
      <p class="form-status muted" i18n="@@project.notFound">This project isn't in the planner.</p>
    } @else {
      <form id="project-form" class="form-body" [formGroup]="form" (ngSubmit)="save()">
        <div class="ledger-row">
          <label for="project-name" i18n="@@project.name">Name</label>
          <input id="project-name" formControlName="name" autocomplete="off" [attr.maxlength]="maxName" />
        </div>
        @if (form.controls.name.touched && form.controls.name.invalid) {
          <p class="field-error">{{ errorText(form.controls.name) }}</p>
        }
        <div class="ledger-row">
          <label for="project-area" i18n="@@project.area">Area</label>
          <select id="project-area" formControlName="areaId">
            @for (entry of tree.value()?.areas ?? []; track entry.area.id) {
              <option [value]="entry.area.id">{{ entry.area.name }}</option>
            }
          </select>
        </div>
        @if (form.controls.areaId.touched && form.controls.areaId.invalid) {
          <p class="field-error">{{ errorText(form.controls.areaId) }}</p>
        }
        @if (groups().length) {
          <div class="ledger-row">
            <label for="project-group" i18n="@@project.group">Group</label>
            <select id="project-group" formControlName="groupId">
              <option value="" i18n="@@project.noGroup">None</option>
              @for (group of groups(); track group.group.id) {
                <option [value]="group.group.id">{{ indent(group.depth) }}{{ group.group.name }}</option>
              }
            </select>
          </div>
        }
        @if (form.controls.groupId.invalid) {
          <p class="field-error">{{ errorText(form.controls.groupId) }}</p>
        }

        <fieldset class="segmented mode" i18n-aria-label="@@project.mode" aria-label="Kind">
          <input type="radio" id="mode-list" value="list" formControlName="mode" />
          <label for="mode-list" i18n="@@project.list">List</label>
          <input type="radio" id="mode-queue" value="queue" formControlName="mode" />
          <label for="mode-queue" i18n="@@project.queue">Queue</label>
        </fieldset>
        <p class="hint small muted">
          @if (form.controls.mode.value === 'queue') {
            <ng-container i18n="@@project.queueHint">Done in order, one after another, with no dates. Study now picks the next one.</ng-container>
          } @else {
            <ng-container i18n="@@project.listHint">Tasks planned for a day, a week or a month.</ng-container>
          }
        </p>

        @if (!isNew) {
          <div class="danger">
            <button type="button" class="btn btn-quiet" [disabled]="saving()" (click)="archive()" i18n="@@project.archive">Archive this project</button>
          </div>
        }
      </form>
    }
  `,
  styles: `
    .mode {
      margin-top: 20px;
    }
  `,
})
export class ProjectFormPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly routeId = this.route.paramMap.get('id');
  protected readonly isNew = !this.routeId;
  private readonly id = this.routeId ?? crypto.randomUUID();
  protected readonly maxName = MAX_NAME_LENGTH;

  protected readonly tree = this.api.tree();
  protected readonly detail = this.api.project(() => (this.isNew ? undefined : this.id));
  protected readonly notFound = computed(() => !!this.detail.error());

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_NAME_LENGTH)]],
    areaId: [this.route.queryParamMap.get('area') ?? '', Validators.required],
    groupId: [this.route.queryParamMap.get('group') ?? ''],
    mode: ['list' as ProjectMode],
  });
  private readonly areaId = toSignal(this.form.controls.areaId.valueChanges, { initialValue: this.form.controls.areaId.value });
  protected readonly groups = computed(() => this.tree.value()?.areas.find((a) => a.area.id === this.areaId())?.groups ?? []);
  protected readonly saving = signal(false);
  private filled = false;

  constructor() {
    effect(() => {
      const current = this.detail.hasValue() ? this.detail.value() : undefined;
      if (current && !this.filled) {
        this.filled = true;
        const { project } = current;
        this.form.setValue({ name: project.name, areaId: project.areaId, groupId: project.groupId ?? '', mode: project.mode });
      }
      // A new project goes in the first area unless one was given.
      const first = this.tree.value()?.areas[0]?.area.id;
      if (this.isNew && first && !this.form.controls.areaId.value) this.form.controls.areaId.setValue(first);
    });
  }

  protected indent(depth: number): string {
    return ' '.repeat(depth);
  }

  protected cancel(): void {
    this.nav.leave(this.isNew ? '/planner/projects' : `/planner/projects/${this.id}`);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, areaId, groupId, mode } = this.form.getRawValue();
    const groupInArea = this.groups().some((g) => g.group.id === groupId);
    await this.run(async () => {
      await this.api.saveProject(this.id, { name, areaId, groupId: groupInArea ? groupId : null, mode });
      if (this.isNew) {
        this.toast.show($localize`:@@project.added:Project added.`);
        await this.router.navigate(['/planner/projects', this.id], { replaceUrl: true });
      } else this.nav.leave(`/planner/projects/${this.id}`, $localize`:@@project.saved:Project saved.`);
    });
  }

  protected async archive(): Promise<void> {
    await this.run(async () => {
      await this.api.archiveProject(this.id, true);
      await this.router.navigateByUrl('/planner/projects', { replaceUrl: true });
      this.toast.show($localize`:@@project.archived:Project archived.`);
    });
  }

  protected errorText(control: AbstractControl): string {
    const errors = control.errors ?? {};
    if (errors['server']) return errors['server'] as string;
    if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
    return $localize`:@@error.required:Required.`;
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => (this.form.controls as Record<string, AbstractControl>)[field]);
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }
}
