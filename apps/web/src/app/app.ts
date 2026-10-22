import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Backups } from './data/backups';
import { DeviceStore } from './data/device-store';
import { STORAGE_MODE } from './data/storage-mode';
import { ToastOutlet } from './ui/toast';

/** The app shell: the current module's screen and toasts (ADR 0021, 0030). Each module brings its own navigation. */
@Component({
  imports: [RouterOutlet, ToastOutlet],
  selector: 'selah-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly store = inject(DeviceStore);

  constructor() {
    // Ask the browser to keep the data even when space runs low (ADR 0025).
    // The API build keeps it in Postgres instead (ADR 0029).
    const backups = inject(Backups);
    if (STORAGE_MODE === 'device') void backups.requestPersistence();
  }

  /** Shown when the data can't be opened: on the device (ADR 0025), or from the API in the API build (ADR 0029). */
  protected readonly storageFailed = computed(() => this.store.status() === 'error');
  protected readonly apiBuild = STORAGE_MODE === 'api';

  protected retry(): void {
    void this.store.reload();
  }
}
