import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectOnFormRoute } from '../ui/form-route';
import { Icon, type IconName } from '../ui/icon';

interface NavItem {
  path: string;
  icon: IconName;
  label: string;
}

/** Finance's screens and its bottom navigation (ADR 0021, 0022, 0030). */
@Component({
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'selah-finance-shell',
  templateUrl: './finance-shell.html',
  styleUrl: './finance-shell.scss',
  host: { '[class.form]': 'onForm()' },
})
export class FinanceShell {
  protected readonly nav: NavItem[] = [
    { path: '/finance', icon: 'home', label: $localize`:@@nav.home:Home` },
    { path: '/finance/records', icon: 'records', label: $localize`:@@nav.records:Records` },
    { path: '/finance/budget', icon: 'budget', label: $localize`:@@nav.budget:Budget` },
    { path: '/finance/review', icon: 'review', label: $localize`:@@nav.review:Review` },
    { path: '/finance/accounts', icon: 'accounts', label: $localize`:@@nav.accounts:Accounts` },
  ];

  /** Form routes fill the screen, so the bottom navigation steps aside (ADR 0022). */
  protected readonly onForm = injectOnFormRoute();
}
