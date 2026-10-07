import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { ApiSchemas } from '@selah/api-client';

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

/** The app shell: top bar, the current screen, and the bottom navigation (ADR 0020). */
@Component({
  imports: [MatIconModule, MatToolbarModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'selah-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly nav: NavItem[] = [
    { path: '/', icon: 'home', label: $localize`:@@nav.home:Home` },
    { path: '/records', icon: 'receipt_long', label: $localize`:@@nav.records:Records` },
    { path: '/budget', icon: 'savings', label: $localize`:@@nav.budget:Budget` },
    { path: '/review', icon: 'insights', label: $localize`:@@nav.review:Review` },
    { path: '/accounts', icon: 'account_balance', label: $localize`:@@nav.accounts:Accounts` },
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
