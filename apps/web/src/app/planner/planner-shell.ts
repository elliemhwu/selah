import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectOnFormRoute } from '../ui/form-route';
import { Icon, type IconName } from '../ui/icon';

interface NavItem {
  path: string;
  icon: IconName;
  label: string;
}

/** The Planner's screens and its bottom navigation: Today · Projects · Inbox (ADR 0033). */
@Component({
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'selah-planner-shell',
  template: `
    <router-outlet />

    @if (!onForm()) {
      <nav class="bottom-nav" i18n-aria-label="@@planner.nav" aria-label="Planner">
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: item.path === '/planner' }"
            #link="routerLinkActive"
            [attr.aria-current]="link.isActive ? 'page' : null"
          >
            <selah-icon [name]="item.icon" />
            <span class="label">{{ item.label }}</span>
          </a>
        }
      </nav>
    }
  `,
  styleUrl: './planner-shell.scss',
  host: { '[class.form]': 'onForm()' },
})
export class PlannerShell {
  protected readonly nav: NavItem[] = [
    { path: '/planner', icon: 'calendar', label: $localize`:@@planner.today:Today` },
    { path: '/planner/projects', icon: 'list', label: $localize`:@@planner.projects:Projects` },
    { path: '/planner/inbox', icon: 'inbox', label: $localize`:@@planner.inbox:Inbox` },
  ];

  /** Form routes fill the screen, so the bottom navigation steps aside (ADR 0022). */
  protected readonly onForm = injectOnFormRoute();
}
