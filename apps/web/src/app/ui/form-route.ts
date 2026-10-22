import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** True when the deepest active route is marked `data: { form: true }` (ADR 0022). */
export function isFormRoute(route: ActivatedRouteSnapshot): boolean {
  let deepest = route;
  while (deepest.firstChild) deepest = deepest.firstChild;
  return deepest.data['form'] === true;
}

/** Whether a form route is showing; form routes fill the screen, so a module's navigation steps aside. */
export function injectOnFormRoute(): Signal<boolean> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => isFormRoute(router.routerState.snapshot.root)),
    ),
    { initialValue: isFormRoute(router.routerState.snapshot.root) },
  );
}
