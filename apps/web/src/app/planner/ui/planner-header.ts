import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LocalDate } from '@selah/shared-types';
import { Icon } from '../../ui/icon';

/** The top of a Planner screen: back, the date, the title, and an optional link on the right. */
@Component({
  selector: 'selah-planner-header',
  imports: [DatePipe, Icon, RouterLink],
  template: `
    <header class="page-header">
      <div class="masthead small muted">
        <a class="back" [routerLink]="back()" i18n-aria-label="@@planner.back" aria-label="Back">
          <selah-icon name="back" [size]="18" />
          <span>{{ backLabel() }}</span>
        </a>
        @if (today(); as day) {
          <span>{{ day | date: 'EEE d MMM y' }}</span>
        }
      </div>
      <div class="title-row">
        <h1>{{ title() }}</h1>
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 32px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-height: var(--touch);
      margin-left: -6px;
      color: var(--ink-muted);
      text-decoration: none;
    }
    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    h1 {
      font-style: italic;
      font-size: 28px;
    }
  `,
})
export class PlannerHeader {
  readonly title = input.required<string>();
  readonly back = input('/');
  readonly backLabel = input($localize`:@@planner.selah:Selah`);
  readonly today = input<LocalDate | null>(null);
}
