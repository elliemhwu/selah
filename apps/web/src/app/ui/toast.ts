import { Component, inject, Injectable, signal } from '@angular/core';

/** Short messages at the bottom of the screen, e.g. "Saved." or a server error. */
@Injectable({ providedIn: 'root' })
export class Toast {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string, durationMs = 4000): void {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(null), durationMs);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.message.set(null);
  }
}

/** Shows the current toast. Placed once, in the app shell. */
@Component({
  selector: 'selah-toast-outlet',
  template: `
    <div class="toast-region" role="status" aria-live="polite">
      @if (toast.message(); as message) {
        <div class="toast">
          <span>{{ message }}</span>
          <button type="button" class="btn btn-quiet" (click)="toast.dismiss()" i18n="@@action.dismiss">Dismiss</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-region {
      position: fixed;
      inset: auto var(--gutter) calc(var(--nav-height) + 16px + env(safe-area-inset-bottom));
      z-index: 1100;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 480px;
      padding: 4px 8px 4px 16px;
      border-radius: var(--radius);
      background: var(--ink);
      color: var(--paper);
      font-size: 15px;
      pointer-events: auto;
    }

    .btn-quiet {
      color: var(--rule-strong);
    }
  `,
})
export class ToastOutlet {
  protected readonly toast = inject(Toast);
}
