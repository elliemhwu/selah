import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../core/money.pipe';
import { TODAY } from '../../core/today';
import { type ChecklistItemDto, type EnvelopeDto, ReportsApi } from '../data/finance-api';
import { BatchRecordDialog, type BatchRecordDialogData } from '../records/batch-record-dialog';
import { RecordDialog, type RecordDialogData } from '../records/record-dialog';

const DIALOG_OPTIONS = { width: '560px', maxWidth: '100vw', panelClass: 'selah-fullscreen-dialog' };

/** Home (requirements §4): what's left in each envelope, this period's checklist, and quick add. */
@Component({
  selector: 'selah-home-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    MoneyPipe,
    RouterLink,
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
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
  protected readonly selectedItems = computed(() =>
    this.checklist.value().filter((item) => this.selected().has(item.budgetItemId)),
  );

  protected periodLabel(envelope: EnvelopeDto): string {
    switch (envelope.cadence) {
      case 'daily':
        return $localize`:@@home.period.today:today`;
      case 'weekly':
        return $localize`:@@home.period.week:this week`;
      default:
        return $localize`:@@home.period.month:this month`;
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
      .open(BatchRecordDialog, { ...DIALOG_OPTIONS, data })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.selected.set(new Set());
        this.refresh($localize`:@@home.savedMany:Saved ${saved.length}:count: records.`);
      });
  }

  private openRecord(data: RecordDialogData): void {
    this.dialog
      .open(RecordDialog, { ...DIALOG_OPTIONS, data })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.refresh($localize`:@@home.saved:Saved.`);
      });
  }

  private refresh(message: string): void {
    this.envelopes.reload();
    this.checklist.reload();
    this.snackBar.open(message, undefined, { duration: 3000 });
  }
}
