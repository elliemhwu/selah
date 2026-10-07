import { Component } from '@angular/core';
import { Icon } from '../ui/icon';

/** Stands in for screens of later Phase 5 branches (docs/roadmap.md). */
@Component({
  selector: 'selah-placeholder-page',
  imports: [Icon],
  template: `
    <selah-icon name="tools" [size]="28" />
    <p class="section-title" i18n="@@placeholder.text">This page of the ledger is still blank.</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 64px var(--gutter);
      color: var(--ink-muted);
    }
  `,
})
export class PlaceholderPage {}
