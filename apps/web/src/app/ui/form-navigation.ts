import { Location } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Toast } from './toast';

/** Leaving a form page (ADR 0022). */
@Injectable({ providedIn: 'root' })
export class FormNavigation {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);

  /**
   * Goes back if the user came from inside the app, else to `fallback` (a
   * reload or a link straight to the form). Shows `message` once there.
   */
  leave(fallback: string, message?: string): void {
    const state = this.location.getState() as { navigationId?: number } | null;
    if ((state?.navigationId ?? 1) > 1) this.location.back();
    else void this.router.navigateByUrl(fallback, { replaceUrl: true });
    if (message) this.toast.show(message);
  }
}
