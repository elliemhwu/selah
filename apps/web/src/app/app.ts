import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Backups } from './data/backups';
import { DeviceStore } from './data/device-store';
import { Icon, type IconName } from './ui/icon';
import { ToastOutlet } from './ui/toast';

interface NavItem {
  path: string;
  icon: IconName;
  label: string;
}

/** The app shell: the current screen, the bottom navigation, and toasts (ADR 0021, 0022). */
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

  private readonly router = inject(Router);

  /** Form routes fill the screen, so the bottom navigation steps aside (ADR 0022). */
  protected readonly onForm = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => isFormRoute(this.router.routerState.snapshot.root)),
    ),
    { initialValue: false },
  );

  private readonly store = inject(DeviceStore);

  constructor() {
    // Ask the browser to keep the data even when space runs low (ADR 0025).
    void inject(Backups).requestPersistence();
  }

  /** Shown when the data on this device can't be opened (ADR 0025); the app needs no server. */
  protected readonly storageFailed = computed(() => this.store.status() === 'error');

  protected retry(): void {
    void this.store.reload();
  }
}

/** True when the deepest active route is marked `data: { form: true }`. */
function isFormRoute(route: ActivatedRouteSnapshot): boolean {
  let deepest = route;
  while (deepest.firstChild) deepest = deepest.firstChild;
  return deepest.data['form'] === true;
}
