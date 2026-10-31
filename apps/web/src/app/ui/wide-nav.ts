import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon, type IconName } from './icon';

interface Section {
  path: string;
  label: string;
}

interface ModuleNav {
  path: string;
  icon: IconName;
  name: string;
  sections: Section[];
}

/**
 * The sidebar on a wide screen (ADR 0034): Selah's modules, with the current
 * module's sections under it. It replaces the modules' bottom navigations from
 * 1024px; on a phone it isn't shown. It only links to routes, so modules stay apart.
 */
@Component({
  selector: 'selah-wide-nav',
  imports: [Icon, RouterLink, RouterLinkActive],
  template: `
    <nav class="wide-nav" i18n-aria-label="@@wideNav.label" aria-label="Selah">
      <a class="brand" routerLink="/">Selah</a>
      <ul class="modules">
        @for (module of modules; track module.path) {
          <li>
            <a class="module" [routerLink]="module.path" routerLinkActive="active" #m="routerLinkActive" [attr.aria-current]="m.isActive ? 'true' : null">
              <selah-icon [name]="module.icon" [size]="20" />
              <span>{{ module.name }}</span>
            </a>
            @if (current() === module.path) {
              <ul class="sections">
                @for (section of module.sections; track section.path) {
                  <li>
                    <a
                      class="section"
                      [routerLink]="section.path"
                      routerLinkActive="active"
                      [routerLinkActiveOptions]="{ exact: section.path === module.path }"
                      #s="routerLinkActive"
                      [attr.aria-current]="s.isActive ? 'page' : null"
                      >{{ section.label }}</a
                    >
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ul>
      <a class="section settings" routerLink="/settings" routerLinkActive="active">
        <selah-icon name="settings" [size]="18" />
        <span i18n="@@settings.title">Settings</span>
      </a>
    </nav>
  `,
  styles: `
    :host {
      display: none;
    }
    @media (min-width: 1024px) {
      :host {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 3;
        display: block;
        width: var(--sidebar);
      }
    }
    .wide-nav {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 24px 16px;
      border-right: 1px solid var(--rule-strong);
      background: var(--panel);
      overflow-y: auto;
    }
    .brand {
      margin: 0 8px 24px;
      padding-bottom: 12px;
      border-bottom: 3px double var(--rule-strong);
      color: var(--ink);
      font: italic 26px var(--font-title);
      text-decoration: none;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .modules {
      flex: 1;
    }
    .module {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: var(--touch);
      padding: 0 8px;
      border-radius: var(--radius);
      color: var(--ink-muted);
      text-decoration: none;
    }
    .module.active {
      color: var(--ink);
      font-weight: 600;
    }
    .sections {
      margin: 0 0 8px 38px;
    }
    .section {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 0 8px;
      border-left: 2px solid transparent;
      color: var(--ink-muted);
      font-size: 14px;
      text-decoration: none;
    }
    .section.active {
      border-left-color: var(--accent);
      color: var(--ink);
    }
    .settings {
      margin-top: 16px;
    }
  `,
})
export class WideNav {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly modules: ModuleNav[] = [
    {
      path: '/finance',
      icon: 'budget',
      name: $localize`:@@selahHome.finance:Finance`,
      sections: [
        { path: '/finance', label: $localize`:@@nav.home:Home` },
        { path: '/finance/records', label: $localize`:@@nav.records:Records` },
        { path: '/finance/budget', label: $localize`:@@nav.budget:Budget` },
        { path: '/finance/review', label: $localize`:@@nav.review:Review` },
        { path: '/finance/accounts', label: $localize`:@@nav.accounts:Accounts` },
      ],
    },
    {
      path: '/journal',
      icon: 'journal',
      name: $localize`:@@selahHome.journal:Journal`,
      sections: [
        { path: '/journal', label: $localize`:@@journal.diary:Dear Diary` },
        { path: '/journal/new', label: $localize`:@@journal.newEntry:New entry` },
        { path: '/journal/life', label: $localize`:@@journal.life:Life` },
      ],
    },
    {
      path: '/planner',
      icon: 'calendar',
      name: $localize`:@@selahHome.planner:Planner`,
      sections: [
        { path: '/planner', label: $localize`:@@planner.today:Today` },
        { path: '/planner/week', label: $localize`:@@planner.week:Plan the week` },
        { path: '/planner/projects', label: $localize`:@@planner.projects:Projects` },
        { path: '/planner/inbox', label: $localize`:@@planner.inbox:Inbox` },
      ],
    },
  ];

  /** The module the current page belongs to. */
  protected readonly current = computed(() => this.modules.find((m) => this.url().split(/[?#]/)[0].startsWith(m.path))?.path ?? null);
}
