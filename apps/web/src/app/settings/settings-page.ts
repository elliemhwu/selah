import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CURRENCIES, type Currency, type IsoWeekday } from '@selah/shared-types';
import { AppSettings } from '../core/app-settings';
import { problemOf } from '../core/problem';
import { BackupError } from '../data/backup';
import { Backups, type PendingRestore } from '../data/backups';
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
 * (ADR 0025); and the category tree, whose forms open as routes (ADR 0022).
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
