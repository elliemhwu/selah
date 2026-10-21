import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../ui/icon';

/**
 * The top of a Journal page: back, the Dear Diary | Life switch, and the
 * page's date beside it (ADR 0030). One journey, different views.
 */
@Component({
  selector: 'selah-journal-header',
  imports: [Icon, RouterLink],
  template: `
    <header class="journal-header">
      <div class="journal-header-row">
        <a class="back" [routerLink]="back()" i18n-aria-label="@@journal.back" aria-label="Back">
          <selah-icon name="back" [size]="22" />
        </a>
        <nav class="views" i18n-aria-label="@@journal.views" aria-label="Views">
          <a routerLink="/journal" [class.active]="view() === 'diary'" [attr.aria-current]="view() === 'diary' ? 'page' : null" i18n="@@journal.diary"
            >Dear Diary</a
          >
          <a routerLink="/journal/life" [class.active]="view() === 'life'" [attr.aria-current]="view() === 'life' ? 'page' : null" i18n="@@journal.life"
            >Life</a
          >
        </nav>
        <span class="back-spacer"></span>
      </div>
      <div class="journal-header-date small muted"><ng-content /></div>
    </header>
  `,
  styleUrl: './journal-header.scss',
})
export class JournalHeader {
  readonly view = input.required<'diary' | 'life'>();
  /** Where back goes. */
  readonly back = input('/journal');
}
