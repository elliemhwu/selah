import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { LEDGER_DIALOG } from '../../ui/dialog';
import { Icon } from '../../ui/icon';
import { Toast } from '../../ui/toast';
import { type ChecklistItemDto, type EnvelopeDto, type RecordDto, ReportsApi } from '../data/finance-api';
import { BatchRecordDialog, type BatchRecordDialogData } from '../records/batch-record-dialog';
import { RecordDialog, type RecordDialogData } from '../records/record-dialog';

/** Home (requirements §4): what's left in each envelope, this period's checklist, and a new entry. */
@Component({
  selector: 'selah-home-page',
  imports: [DatePipe, Icon, MoneyPipe, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(Toast);
  private readonly reports = inject(ReportsApi);

  protected readonly today = signal(inject(TODAY)());
  protected readonly envelopes = this.reports.envelopes(this.today);
  protected readonly checklist = this.reports.checklist(this.today);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Both reports answer 404 when no plan version covers today. */
  protected readonly noPlan = computed(() => {
    const error = this.envelopes.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly failed = computed(() => !this.noPlan() && (!!this.envelopes.error() || !!this.checklist.error()));
  protected readonly loading = computed(() => this.envelopes.isLoading() || this.checklist.isLoading());
  protected readonly doneCount = computed(() => this.checklist.value().filter((item) => item.done).length);
  protected readonly selectedItems = computed(() =>
    this.checklist.value().filter((item) => this.selected().has(item.budgetItemId)),
  );

  protected periodLabel(envelope: EnvelopeDto): string {
    switch (envelope.cadence) {
      case 'daily':
        return $localize`:@@home.period.day:a day`;
      case 'weekly':
        return $localize`:@@home.period.week:a week`;
      default:
        return $localize`:@@home.period.month:a month`;
    }
  }

  protected isNegative(amount: string): boolean {
    return amount.startsWith('-');
  }

  protected toggle(item: ChecklistItemDto, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(item.budgetItemId);
    else next.delete(item.budgetItemId);
    this.selected.set(next);
  }

  protected addRecord(): void {
    this.openRecord({});
  }

  protected recordItem(item: ChecklistItemDto): void {
    this.openRecord({
      type: item.section === 'income' ? 'income' : 'expense',
      budgetItemId: item.budgetItemId,
      amount: item.planned,
    });
  }

  protected recordSelected(): void {
    const data: BatchRecordDialogData = { items: this.selectedItems() };
    this.dialog
      .open<RecordDto[]>(BatchRecordDialog, { ...LEDGER_DIALOG, data })
      .closed.subscribe((saved) => {
        if (!saved) return;
        this.selected.set(new Set());
        this.refresh($localize`:@@home.savedMany:Saved ${saved.length}:count: entries.`);
      });
  }

  private openRecord(data: RecordDialogData): void {
    this.dialog
      .open<RecordDto>(RecordDialog, { ...LEDGER_DIALOG, data })
      .closed.subscribe((saved) => {
        if (saved) this.refresh($localize`:@@home.saved:Saved.`);
      });
  }

  private refresh(message: string): void {
    this.envelopes.reload();
    this.checklist.reload();
    this.toast.show(message);
  }
}
