import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { endOfMonth, previousYearMonth, yearMonthOf } from '@selah/shared-utils';
import { map } from 'rxjs';
import { MoneyPipe } from '../../core/money.pipe';
import { applyFieldErrors, problemOf } from '../../core/problem';
import { TODAY } from '../../core/today';
import { FormNavigation } from '../../ui/form-navigation';
import { Toast } from '../../ui/toast';
import { BudgetTransfersApi, PlanApi, ReportsApi } from '../data/finance-api';
import { budgetItemGroups, toInputAmount } from '../records/budget-item-options';
import { errorText, MONEY_PATTERN, positiveAmount, wholeAmount } from '../records/form-errors';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A manual budget transfer: moves whole TWD from one budget item to another,
 * never touching accounts (requirements §3.2, ADR 0019). Dated the last day of
 * the previous month unless the route says otherwise, since leftovers are
 * usually moved once a month is over.
 * Routes: `/finance/budget/transfers/new?from=&to=&date=` (all optional) and
 * `/finance/budget/transfers/:id` (ADR 0022).
 */
@Component({
  selector: 'selah-budget-transfer-page',
  host: { class: 'form-page' },
  imports: [MoneyPipe, ReactiveFormsModule],
  templateUrl: './budget-transfer-page.html',
})
export class BudgetTransferPage {
  private readonly route = inject(ActivatedRoute).snapshot;
  private readonly query = this.route.queryParamMap;
  private readonly transfersApi = inject(BudgetTransfersApi);
  private readonly nav = inject(FormNavigation);
  private readonly toast = inject(Toast);
  private readonly today = inject(TODAY)();

  /** The transfer being edited; undefined for a new one. */
  private readonly editId = this.route.paramMap.get('id') ?? undefined;
  protected readonly editing = !!this.editId;
  /** Generated once, so saving again after an error never duplicates it (ADR 0017). */
  private readonly id = this.editId ?? crypto.randomUUID();
  private readonly loaded = this.transfersApi.get(() => this.editId);
  protected readonly loading = computed(() => this.editing && this.loaded.isLoading());
  protected readonly notFound = computed(() => this.editing && !!this.loaded.error());

  protected readonly form = inject(NonNullableFormBuilder).group({
    occurredOn: [this.defaultDate(), Validators.required],
    fromItemId: [this.query.get('from') ?? '', Validators.required],
    toItemId: [this.query.get('to') ?? '', Validators.required],
    amount: ['', [Validators.required, Validators.pattern(MONEY_PATTERN), positiveAmount, wholeAmount]],
    note: ['', Validators.maxLength(500)],
  });
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  /** Kept from the loaded transfer, which the form doesn't show. */
  private occurredAt: string | null = null;

  /** The date the form works with, falling back while the field holds no real date. */
  private readonly date = computed(() => {
    const date = this.value().occurredOn;
    return LOCAL_DATE.test(date) ? date : this.today;
  });
  /** A computed, so the plan is only fetched again when the month changes. */
  private readonly month = computed(() => yearMonthOf(this.date()));
  private readonly plan = inject(PlanApi).active(this.month);
  private readonly envelopes = inject(ReportsApi).envelopes(this.date);

  /** Income items are not budgets, so only the other sections (ADR 0019). */
  protected readonly itemGroups = computed(() =>
    this.plan.hasValue() ? budgetItemGroups(this.plan.value().items, 'expense') : [],
  );
  protected readonly noPlan = computed(() => this.plan.status() === 'error');
  /** What's left in the "from" envelope on the date, when it is a rollover item. */
  protected readonly fromEnvelope = computed(() =>
    // The report errors when no plan covers the date; value() would throw then.
    this.envelopes.hasValue() ? this.envelopes.value().find((e) => e.budgetItemId === this.value().fromItemId) : undefined,
  );
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly errorText = errorText;

  constructor() {
    // Editing: fill the form once the transfer arrives, unless the user already typed.
    effect(() => {
      if (!this.loaded.hasValue() || this.form.dirty) return;
      const transfer = this.loaded.value();
      this.occurredAt = transfer.occurredAt;
      this.form.setValue({
        occurredOn: transfer.occurredOn,
        fromItemId: transfer.fromItemId,
        toItemId: transfer.toItemId ?? '',
        amount: toInputAmount(transfer.amount),
        note: transfer.note ?? '',
      });
    });
  }

  protected cancel(): void {
    this.nav.leave('/finance/review');
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.loading() || this.notFound()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      await this.transfersApi.upsert(this.id, {
        occurredOn: v.occurredOn,
        occurredAt: this.occurredAt,
        fromItemId: v.fromItemId,
        toItemId: v.toItemId,
        amount: v.amount,
        note: v.note.trim() || null,
      });
      this.nav.leave('/finance/review', $localize`:@@budgetTransfer.saved:Budget moved.`);
    } catch (error) {
      const unmatched = applyFieldErrors(problemOf(error), (field) => this.controlFor(field));
      if (unmatched.length) this.toast.show(unmatched.join(' '));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!this.editId) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.transfersApi.remove(this.editId);
      this.nav.leave('/finance/review', $localize`:@@budgetTransfer.deleted:Transfer deleted.`);
    } catch (error) {
      this.toast.show(problemOf(error).message);
      this.confirmingDelete.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  /** The route's date if it is one, else the last day of the previous month (requirements §3.2). */
  private defaultDate(): string {
    const date = this.query.get('date');
    if (date && LOCAL_DATE.test(date)) return date;
    return endOfMonth(`${previousYearMonth(yearMonthOf(this.today))}-01`);
  }

  private controlFor(field: string): AbstractControl | undefined {
    return (this.form.controls as Record<string, AbstractControl>)[field];
  }
}
