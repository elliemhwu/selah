import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { ApiSchemas } from '@selah/api-client';
import { Icon, type IconName } from './ui/icon';
import { ToastOutlet } from './ui/toast';

interface NavItem {
  path: string;
  icon: IconName;
  label: string;
}

/** The app shell: the current screen, the bottom navigation, and toasts (ADR 0021). */
@Component({
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet, ToastOutlet],
  selector: 'selah-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly nav: NavItem[] = [
    { path: '/', icon: 'home', label: $localize`:@@nav.home:Home` },
    { path: '/records', icon: 'records', label: $localize`:@@nav.records:Records` },
    { path: '/budget', icon: 'budget', label: $localize`:@@nav.budget:Budget` },
    { path: '/review', icon: 'review', label: $localize`:@@nav.review:Review` },
    { path: '/accounts', icon: 'accounts', label: $localize`:@@nav.accounts:Accounts` },
  ];

  private readonly health = httpResource<ApiSchemas['HealthDto']>(() => '/api/v1/health');

  /** Shown when the API or its database can't be reached. */
  protected readonly offline = computed(
    () => !!this.health.error() || (this.health.hasValue() && this.health.value().database !== 'ok'),
  );

  protected retry(): void {
    this.health.reload();
  }
}
