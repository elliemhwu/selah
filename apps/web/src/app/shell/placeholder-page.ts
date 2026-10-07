import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Stands in for screens of later Phase 5 branches (docs/roadmap.md). */
@Component({
  selector: 'selah-placeholder-page',
  imports: [MatIconModule],
  template: `
    <mat-icon aria-hidden="true">construction</mat-icon>
    <p i18n="@@placeholder.text">This screen is coming in a later update.</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PlaceholderPage {}
