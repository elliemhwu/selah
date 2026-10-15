import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CURRENCIES, type Currency, type IsoWeekday } from '@selah/shared-types';
import { AppSettings } from '../core/app-settings';
import { problemOf } from '../core/problem';
import { BackupError } from '../data/backup';
import { Backups, type PendingRestore } from '../data/backups';
import { DeviceStore } from '../data/device-store';
import type { OutboxEntry } from '../data/device-storage';
import { Sync } from '../data/sync';
import { SyncError } from '../data/sync-server';
import { categoryTree } from '../finance/categories/category-tree';
import { CategoriesApi } from '../finance/data/finance-api';
import { Icon } from '../ui/icon';
import { Toast } from '../ui/toast';

/** In display order; values are ISO days (1 = Monday). */
const WEEKDAYS: { day: IsoWeekday; label: string }[] = [
  { day: 1, label: $localize`:@@weekday.1:Monday` },
  { day: 2, label: $localize`:@@weekday.2:Tuesday` },
  { day: 3, label: $localize`:@@weekday.3:Wednesday` },
  { day: 4, label: $localize`:@@weekday.4:Thursday` },
  { day: 5, label: $localize`:@@weekday.5:Friday` },
  { day: 6, label: $localize`:@@weekday.6:Saturday` },
  { day: 7, label: $localize`:@@weekday.7:Sunday` },
];

/**
 * Settings (requirements §4): the week start day and default currency, which
 * save as soon as they change (ADR 0024); backups of the device's data
 * (ADR 0025); sync with a server (ADR 0028); and the category tree, whose forms open as routes (ADR 0022).
 */
@Component({
  selector: 'selah-settings-page',
  imports: [DatePipe, Icon, ReactiveFormsModule, RouterLink],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly settings = inject(AppSettings);
  private readonly toast = inject(Toast);
  protected readonly categories = inject(CategoriesApi).list();
  protected readonly tree = computed(() => categoryTree(this.categories.value()));

  protected readonly backups = inject(Backups);
  /** A backup chosen to restore, shown with what it holds until the user confirms. */
  protected readonly pending = signal<PendingRestore | null>(null);
  protected readonly restoring = signal(false);

  protected readonly sync = inject(Sync);
  private readonly store = inject(DeviceStore);
  protected readonly connecting = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly syncForm = inject(NonNullableFormBuilder).group({
    server: ['', Validators.required],
    token: ['', Validators.required],
  });

  protected readonly weekdays = WEEKDAYS;
  protected readonly currencies = CURRENCIES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    weekStartDay: 1 as IsoWeekday,
    defaultCurrency: 'TWD' as Currency,
  });

  constructor() {
    // Show the stored settings; changes the user makes are saved below.
    effect(() => {
      const { weekStartDay, defaultCurrency } = this.settings.value();
      this.form.setValue({ weekStartDay, defaultCurrency }, { emitEvent: false });
      // Until the stored values are known, a save would overwrite them with the defaults.
      if (this.settings.status() === 'loaded') this.form.enable({ emitEvent: false });
      else this.form.disable({ emitEvent: false });
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => void this.save());
  }

  protected download(): void {
    this.backups.download();
    this.toast.show($localize`:@@backup.downloaded:Backup downloaded. Keep it somewhere other than this device.`);
  }

  /** Reads the chosen file and asks before replacing anything. */
  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires
    if (!file) return;
    try {
      this.pending.set(await this.backups.read(file));
    } catch (error) {
      this.toast.show(error instanceof BackupError ? error.message : problemOf(error).message);
    }
  }

  protected async restore(): Promise<void> {
    const pending = this.pending();
    if (!pending) return;
    this.restoring.set(true);
    try {
      await this.backups.restore(pending);
      this.pending.set(null);
      this.toast.show($localize`:@@backup.restored:Backup restored.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
    } finally {
      this.restoring.set(false);
    }
  }

  protected async connect(): Promise<void> {
    if (this.syncForm.invalid) {
      this.syncForm.markAllAsTouched();
      return;
    }
    this.connecting.set(true);
    this.connectError.set(null);
    try {
      const { server, token } = this.syncForm.getRawValue();
      await this.sync.connect(server, token);
      this.syncForm.reset();
      this.toast.show($localize`:@@sync.connectedToast:Connected. This device now syncs.`);
    } catch (error) {
      this.connectError.set(error instanceof SyncError ? error.message : problemOf(error).message);
    } finally {
      this.connecting.set(false);
    }
  }

  protected async disconnect(): Promise<void> {
    await this.sync.disconnect();
    this.toast.show($localize`:@@sync.disconnectedToast:This device no longer syncs. Its data stays here.`);
  }

  /** Names the row behind a refused change, so the user can find it. */
  protected describe(entry: OutboxEntry): string {
    const data = this.store.data();
    switch (entry.table) {
      case 'accounts': {
        const name = data.accounts.find((a) => a.id === entry.id)?.name ?? '';
        return $localize`:@@sync.item.account:Account ${name}:name:`;
      }
      case 'categories': {
        const name = data.categories.find((c) => c.id === entry.id)?.name ?? '';
        return $localize`:@@sync.item.category:Category ${name}:name:`;
      }
      case 'records': {
        const record = data.records.find((r) => r.id === entry.id);
        const date = record?.occurredOn ?? '';
        const note = record?.note ?? record?.lines[0]?.note ?? '';
        return note ? $localize`:@@sync.item.recordNote:Entry on ${date}:date:, ${note}:note:` : $localize`:@@sync.item.record:Entry on ${date}:date:`;
      }
      case 'planVersions': {
        const month = data.planVersions.find((v) => v.id === entry.id)?.effectiveFromMonth ?? '';
        return $localize`:@@sync.item.plan:Budget plan from ${month}:month:`;
      }
      case 'budgetTransfers': {
        const date = data.budgetTransfers.find((t) => t.id === entry.id)?.occurredOn ?? '';
        return $localize`:@@sync.item.transfer:Budget transfer on ${date}:date:`;
      }
      case 'settings':
        return $localize`:@@sync.item.settings:Settings`;
    }
  }

  private async save(): Promise<void> {
    try {
      await this.settings.save(this.form.getRawValue());
      this.toast.show($localize`:@@settings.saved:Settings saved.`);
    } catch (error) {
      const { weekStartDay, defaultCurrency } = this.settings.value();
      this.form.setValue({ weekStartDay, defaultCurrency }, { emitEvent: false });
      this.toast.show(problemOf(error).message);
    }
  }
}
