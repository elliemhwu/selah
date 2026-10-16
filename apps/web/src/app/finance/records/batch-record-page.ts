import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { isRecordCurrencyAllowed } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { AccountsApi, type ChecklistItemDto, RecordsApi, ReportsApi } from '../data/finance-api';
import { toInputAmount } from './budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount } from './form-errors';

/**
 * Checklist batch create (requirements §2): one record per selected plan item,
 * pre-filled with the planned amount, saved all or nothing.
 * Route: `/records/batch?items=<id>,<id>&date=YYYY-MM-DD`; the items are read
 * from that day's checklist, so a reload opens the same form (ADR 0022).
 */
@Component({
  selector: 'selah-batch-record-page',
  host: { class: 'form-page' },
  imports: [ReactiveFormsModule, MoneyPipe],
  templateUrl: './batch-record-page.html',
  styleUrl: './batch-record-page.scss',
})
export class BatchRecordPage {
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly nav = inject(FormNavigation);
  private readonly recordsApi = inject(RecordsApi);
  private readonly toast = inject(Toast);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly date = this.params.get('date') ?? inject(TODAY)();
  private readonly itemIds = (this.params.get('items') ?? '').split(',').filter(Boolean);

  private readonly checklist = inject(ReportsApi).checklist(() => this.date);
  /** The selected checklist items, in the order they were selected. */
  protected readonly items = signal<ChecklistItemDto[]>([]);
  /** Set once the rows are built, so later checklist reloads keep what was typed. */
  private readonly built = signal(false);
  /** One record id per budget item, kept across retries (ADR 0017). */
  private readonly ids = new Map(this.itemIds.map((id) => [id, crypto.randomUUID()]));

  protected readonly form = this.fb.group({
    occurredOn: [this.date, Validators.required],
    accountId: ['', Validators.required],
    rows: this.fb.array<ReturnType<BatchRecordPage['row']>>([]),
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private readonly allAccounts = inject(AccountsApi).list();
  /** Planned amounts are TWD, so only accounts that take TWD records (ADR 0016). */
  protected readonly accounts = computed(() =>
    this.allAccounts.value().filter((a) => isRecordCurrencyAllowed('TWD', a.currency)),
  );
  protected readonly includedCount = computed(() => this.value().rows.filter((r) => r.include).length);
  protected readonly loading = computed(() => this.checklist.isLoading() && this.items().length === 0);
  protected readonly missing = computed(() => (this.built() || !!this.checklist.error()) && this.items().length === 0);
  protected readonly saving = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Build the rows once the checklist arrives.
    effect(() => {
      // Not hasValue(): the default [] counts as a value before the response arrives.
      if (this.checklist.status() !== 'resolved' || untracked(this.built)) return;
      const byId = new Map(this.checklist.value().map((item) => [item.budgetItemId, item]));
      const items = this.itemIds.flatMap((id) => byId.get(id) ?? []);
      for (const item of items) this.form.controls.rows.push(this.row(item));
      this.items.set(items);
      this.built.set(true);
    });
    effect(() => {
      const first = this.accounts()[0];
      if (first && !this.form.controls.accountId.value) this.form.controls.accountId.setValue(first.id);
    });
  }

  protected cancel(): void {
    this.nav.leave('/');
  }

  async save(): Promise<void> {
    const rows = this.form.controls.rows.controls;
    const included = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.controls.include.value);
    const invalid =
      this.form.controls.occurredOn.invalid ||
      this.form.controls.accountId.invalid ||
      included.some(({ row }) => row.invalid);
    if (invalid || included.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const { occurredOn, accountId } = this.form.getRawValue();
    const items = this.items();
    this.saving.set(true);
    try {
      const saved = await this.recordsApi.upsertBatch(
        included.map(({ row, index }) => {
          const item = items[index];
          return {
            id: this.ids.get(item.budgetItemId) as string,
            type: item.section === 'income' ? 'income' : 'expense',
            occurredOn,
            accountId,
            currency: 'TWD',
            note: row.controls.note.value.trim() || null,
            lines: [{ amount: row.controls.amount.value, budgetItemId: item.budgetItemId }],
          };
        }),
      );
      this.nav.leave('/', $localize`:@@batch.saved:Saved ${saved.length}:count: entries.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field, included.map((i) => i.index)));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  private row(item: ChecklistItemDto) {
    return this.fb.group({
      include: true,
      amount: [toInputAmount(item.planned), [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount]],
      note: ['', Validators.maxLength(500)],
    });
  }

  /** Maps `records.2.lines.0.amount` back to the row that was sent third. */
  private controlFor(field: string, sentRows: number[]): AbstractControl | undefined {
    const match = /^records\.(\d+)\.(.+)$/.exec(field);
    if (!match) return undefined;
    const [, position, rest] = match;
    if (rest === 'occurredOn' || rest === 'accountId') return this.form.controls[rest];
    const row = this.form.controls.rows.at(sentRows[Number(position)]);
    if (!row) return undefined;
    if (rest === 'note') return row.controls.note;
    if (/^lines\.0\.(amount|twdAmount)$/.test(rest)) return row.controls.amount;
    return undefined;
  }
}
