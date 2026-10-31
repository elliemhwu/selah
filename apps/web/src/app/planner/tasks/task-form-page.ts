import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH } from '@selah/planner-core';
import type { LocalDate, TaskRecordKind } from '@selah/shared-types';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * A task: the new-task form, or one task's details with what happened to it
 * (ADR 0022, the v1 spec §6). Title is the only required field; a task with no
 * project goes to the Inbox. Routes: `/planner/tasks/new` (`?project=`) and `/planner/tasks/:id`.
 */
@Component({
  selector: 'selah-task-form-page',
  host: { class: 'form-page' },
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './task-form-page.html',
  styleUrl: './task-form-page.scss',
})
export class TaskFormPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly today = inject(TODAY)();
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly routeId = this.route.paramMap.get('id');
  protected readonly isNew = !this.routeId;
  /** A new task's id is generated once, so a retry never duplicates it (ADR 0007). */
  protected readonly id = this.routeId ?? crypto.randomUUID();
  protected readonly maxTitle = MAX_TITLE_LENGTH;

  protected readonly detail = this.api.task(() => (this.isNew ? undefined : this.id));
  protected readonly tree = this.api.tree();
  protected readonly loading = computed(() => this.detail.isLoading() || this.tree.isLoading());
  protected readonly notFound = computed(() => !!this.detail.error());
  protected readonly current = computed(() => (this.detail.hasValue() ? (this.detail.value() ?? null) : null));

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(MAX_TITLE_LENGTH)]],
    projectId: [this.route.queryParamMap.get('project') ?? ''],
    dueDate: [''],
    notes: ['', Validators.maxLength(MAX_NOTES_LENGTH)],
  });
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  private filled = false;

  constructor() {
    effect(() => {
      const current = this.current();
      if (!current || this.filled) return;
      this.filled = true;
      const { task } = current;
      this.form.setValue({ title: task.title, projectId: task.projectId ?? '', dueDate: task.dueDate ?? '', notes: task.notes ?? '' });
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
    const { title, projectId, dueDate, notes } = this.form.getRawValue();
    const message = this.isNew
      ? projectId
        ? $localize`:@@task.added:Task added.`
        : $localize`:@@task.addedInbox:Task added to the Inbox.`
      : $localize`:@@task.saved:Task saved.`;
    await this.run(
      () => this.api.saveTask(this.id, { title, projectId: projectId || null, dueDate: dueDate || null, notes: notes.trim() ? notes : null }),
      message,
      true,
    );
  }

  protected done(): Promise<void> {
    return this.run(() => this.api.done(this.id), $localize`:@@task.doneToast:Done.`, true);
  }

  protected reopen(): Promise<void> {
    return this.run(() => this.api.reopen(this.id));
  }

  protected letGo(): Promise<void> {
    return this.run(() => this.api.letGo(this.id), $localize`:@@task.letGoToast:Let go.`, true);
  }

  protected prioritize(on: boolean): Promise<void> {
    return this.run(() => this.api.prioritize(this.id, on));
  }

  /** Records work; a list task then asks when I'll touch it next. */
  protected async workedOn(): Promise<void> {
    const inQueue = this.current()?.inQueue ?? false;
    await this.run(async () => {
      await this.api.workedOn(this.id);
      if (inQueue) this.toast.show($localize`:@@task.workedOnQueue:Recorded. It stays at the front of the queue.`);
      else await this.router.navigate(['/planner/tasks', this.id, 'continue'], { replaceUrl: true });
    });
  }

  protected editDay(recordId: string, day: string): Promise<void> {
    return day ? this.run(() => this.api.editRecordDay(recordId, day as LocalDate)) : Promise.resolve();
  }

  protected removeRecord(recordId: string): Promise<void> {
    return this.run(() => this.api.deleteRecord(recordId), $localize`:@@taskRecord.deleted:Record taken back.`);
  }

  protected async remove(): Promise<void> {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    await this.run(() => this.api.deleteTask(this.id), $localize`:@@task.deleted:Task deleted.`, true);
  }

  protected kindLabel(kind: TaskRecordKind): string {
    if (kind === 'done') return $localize`:@@taskRecord.done:Done`;
    if (kind === 'let_go') return $localize`:@@taskRecord.letGo:Let go`;
    return $localize`:@@taskRecord.workedOn:Worked on it`;
  }

  protected errorText(control: AbstractControl): string {
    const errors = control.errors ?? {};
    if (errors['server']) return errors['server'] as string;
    if (errors['maxlength']) return $localize`:@@error.tooLong:Too long.`;
    return $localize`:@@error.required:Required.`;
  }

  private async run(work: () => Promise<void>, message?: string, leave = false): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await work();
      if (leave) this.nav.leave(this.backTo(), message);
      else if (message) this.toast.show(message);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => (this.form.controls as Record<string, AbstractControl>)[field]);
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  private backTo(): string {
    const projectId = this.current()?.task.projectId ?? this.form.controls.projectId.value;
    return projectId ? `/planner/projects/${projectId}` : this.isNew ? '/planner' : '/planner/inbox';
  }
}
