import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays } from '@selah/shared-utils';
import { problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { PlannerApi } from '../data/planner-api';

/**
 * After "worked on it": when I'll touch the task next (the v1 spec, §6). The
 * record already planned it for tomorrow, so Close keeps that.
 * Route: `/planner/tasks/:id/continue`.
 */
@Component({
  selector: 'selah-continue-form-page',
  host: { class: 'form-page' },
  imports: [DatePipe],
  template: `
    <header class="form-header">
      <div class="form-header-inner">
        <button type="button" class="btn btn-quiet" (click)="close()" i18n="@@action.close">Close</button>
        <h1 i18n="@@continue.title">Continue when?</h1>
        <button type="button" class="btn btn-quiet save" [disabled]="saving() || !current()" (click)="save()" i18n="@@action.save">Save</button>
      </div>
    </header>

    @if (current(); as c) {
      <div class="form-body">
        <div class="task-card">
          <span class="small muted" i18n="@@continue.recorded">Recorded · worked on it</span>
          <span class="task-name">{{ c.task.title }}</span>
          @if (c.project; as project) {
            <span class="small muted">{{ project.name }}</span>
          }
        </div>
        <h2 class="section-title" i18n="@@continue.next">Next time I'll touch it</h2>
        <fieldset class="choices">
          <input type="radio" name="next" id="next-tomorrow" [checked]="next() === 'tomorrow'" (change)="next.set('tomorrow')" />
          <label for="next-tomorrow">
            <span i18n="@@plan.tomorrow">Tomorrow</span>
            <span class="small muted">{{ tomorrow | date: 'EEE d MMM' }}</span>
          </label>
          <input type="radio" name="next" id="next-pick" [checked]="next() === 'pick'" (change)="next.set('pick')" />
          <label for="next-pick"><span i18n="@@continue.pick">Pick a day, week or month…</span></label>
          <input type="radio" name="next" id="next-later" [checked]="next() === 'later'" (change)="next.set('later')" />
          <label for="next-later">
            <span i18n="@@plan.later">Later</span>
            <span class="small muted" i18n="@@plan.laterHint">Stays in its project, off Today and Due soon</span>
          </label>
        </fieldset>
        <p class="hint small muted" i18n="@@continue.closeKeeps">Close keeps it for tomorrow.</p>
      </div>
    } @else if (detail.error()) {
      <p class="form-status muted" i18n="@@task.notFound">This task isn't in the planner.</p>
    }
  `,
  styles: `
    .form-body {
      gap: 16px;
    }
    .task-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 14px;
      border: 1px dashed var(--rule);
      border-radius: var(--radius);
      background: var(--panel);
    }
    .task-name {
      font-family: var(--font-title);
      font-size: 17px;
    }
    .choices {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      border: 0;
      input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      label {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 56px;
        padding: 0 12px;
        border-bottom: 1px dotted var(--rule);
        border-left: 3px solid transparent;
        cursor: pointer;
      }
      input:checked + label {
        border-left-color: var(--accent);
        background: var(--panel);
        font-weight: 600;
      }
      input:focus-visible + label {
        outline: 2px solid var(--accent);
      }
    }
  `,
})
export class ContinueFormPage {
  private readonly api = inject(PlannerApi);
  private readonly nav = inject(FormNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly tomorrow = addDays(inject(TODAY)(), 1);

  protected readonly detail = this.api.task(() => this.id);
  protected readonly current = computed(() => (this.detail.hasValue() ? (this.detail.value() ?? null) : null));
  protected readonly next = signal<'tomorrow' | 'pick' | 'later'>('tomorrow');
  protected readonly saving = signal(false);

  protected close(): void {
    this.nav.leave(this.backTo(), $localize`:@@continue.tomorrowToast:Planned for tomorrow.`);
  }

  protected async save(): Promise<void> {
    const next = this.next();
    if (next === 'tomorrow') return this.close();
    if (next === 'pick') {
      await this.router.navigate(['/planner/tasks', this.id, 'plan'], { replaceUrl: true });
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.api.plan(this.id, 'later');
      this.nav.leave(this.backTo(), $localize`:@@continue.laterToast:Set aside for later.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private backTo(): string {
    return '/planner';
  }
}
