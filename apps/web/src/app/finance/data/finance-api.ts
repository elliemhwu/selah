import { computed, inject, Injectable } from '@angular/core';
import {
  type AccountInput,
  activeVersionOrThrow,
  assertAccountDeletable,
  assertBudgetTransferDeletable,
  assertCategoryDeletable,
  assertDateRange,
  type BudgetMovement,
  budgetMovements,
  type BudgetTransferInput,
  type CategoryInput,
  type ChecklistReport,
  checklistReport,
  compareRecordsNewestFirst,
  DEFAULT_SETTINGS,
  duplicateAccountName,
  duplicateCategoryName,
  type EnvelopeReport,
  envelopesReport,
  type ItemReview,
  type LastUsedRate,
  lastUsedRates,
  matchesRecordFilters,
  type MonthlyReview,
  monthlyReview,
  NotFoundError,
  type PlanVersionInput,
  prepareAccount,
  prepareBudgetTransfer,
  prepareCategory,
  preparePlanVersion,
  prepareRecords,
  type RecordInput,
  type RecordWrite,
  type ReportData,
  toBalanceRecord,
  balanceOf,
} from '@selah/finance-core';
import type { LocalDate, Section, YearMonth } from '@selah/shared-types';
import { deviceResource, IDLE } from '../../data/device-resource';
import type {
  StoredAccount,
  StoredBudgetTransfer,
  StoredCategory,
  StoredPlanVersion,
  StoredRecord,
} from '../../data/device-storage';
import { DeviceStore } from '../../data/device-store';

// The finance screens' data, kept on the device (ADR 0025, 0026). Reads are
// calculated from the device store and follow every change; writes run the
// finance-core rules, the same ones the API runs, then save. Resource methods
// must be called in an injection context, such as a component field initializer.

// What the screens read: stored rows without `deletedAt`, plus what is
// calculated from them. What they write: the finance-core inputs.
type Live<T> = Omit<T, 'deletedAt'>;

export type AccountDto = Live<StoredAccount> & { balance: string };
export type UpsertAccountDto = AccountInput;
export type CategoryDto = Live<StoredCategory>;
export type UpsertCategoryDto = CategoryInput;
export type PlanVersionDto = Live<StoredPlanVersion> & { editable: boolean };
export type PlanItemDto = StoredPlanVersion['items'][number];
export interface PlanVersionSummaryDto {
  id: string;
  effectiveFromMonth: string;
  note: string | null;
  editable: boolean;
  itemCount: number;
}
export type UpsertPlanVersionDto = PlanVersionInput;
export type RecordDto = Live<StoredRecord>;
export type UpsertRecordDto = Omit<RecordInput, 'id'>;
export type BatchRecordInput = RecordInput;
export type LastUsedRateDto = LastUsedRate;
export type EnvelopeDto = EnvelopeReport;
export type ChecklistItemDto = ChecklistReport;
export type MonthlyReviewDto = MonthlyReview;
export type ItemReviewDto = ItemReview;
export type BudgetMovementDto = BudgetMovement;
export type BudgetTransferDto = Live<StoredBudgetTransfer>;
export type UpsertBudgetTransferDto = BudgetTransferInput;

export interface RecordQuery {
  from: LocalDate;
  to: LocalDate;
  accountId?: string;
  categoryId?: string;
  budgetItemId?: string;
  type?: RecordDto['type'];
}

const now = () => new Date().toISOString();
const live = <T extends { deletedAt: string | null }>(rows: readonly T[]) => rows.filter((row) => !row.deletedAt);
const byOrderThenName = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
const withoutDeletedAt = <T extends { deletedAt: string | null }>({ deletedAt: _, ...row }: T): Omit<T, 'deletedAt'> => row;

/** What several screens derive from the device store, calculated once per change. */
@Injectable({ providedIn: 'root' })
export class FinanceData {
  readonly store = inject(DeviceStore);
  private readonly data = this.store.data;

  readonly accounts = computed(() => live(this.data().accounts).sort(byOrderThenName));
  readonly categories = computed(() => live(this.data().categories).sort(byOrderThenName));
  readonly records = computed(() => live(this.data().records));
  readonly transfers = computed(() => live(this.data().budgetTransfers));
  /** Live versions, oldest first. */
  readonly versions = computed(() =>
    live(this.data().planVersions).sort((a, b) => a.effectiveFromMonth.localeCompare(b.effectiveFromMonth)),
  );
  readonly newestVersion = computed(() => this.versions().at(-1));
  readonly settings = computed(() => this.data().settings ?? DEFAULT_SETTINGS);
  readonly balanceRecords = computed(() => this.records().map(toBalanceRecord));

  /** Budget items in a live version, with their sections. */
  readonly liveItemSections = computed(() => sectionsOf(this.versions()));
  /** Every budget item ever saved, deleted versions included: an item keeps its section (ADR 0018). */
  readonly knownItemSections = computed(() => sectionsOf(this.data().planVersions));

  readonly reportData = computed<ReportData>(() => ({
    versions: this.versions(),
    lines: this.records().flatMap((record) =>
      record.type === 'income' || record.type === 'expense'
        ? record.lines.map((line) => ({
            budgetItemId: line.budgetItemId,
            occurredOn: record.occurredOn,
            type: record.type as 'income' | 'expense',
            twdAmount: line.twdAmount,
          }))
        : [],
    ),
    transfers: this.transfers().filter((t) => t.kind === 'manual'),
    weekStartDay: this.settings().weekStartDay,
  }));

  /** A plan version as the screens read it: `editable` only for the newest. */
  toVersionDto(version: StoredPlanVersion): PlanVersionDto {
    return { ...withoutDeletedAt(version), editable: version.id === this.newestVersion()?.id };
  }
}

function sectionsOf(versions: readonly StoredPlanVersion[]): Map<string, Section> {
  return new Map(versions.flatMap((v) => v.items.map((i) => [i.budgetItemId, i.section] as const)));
}

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly finance = inject(FinanceData);

  list() {
    return deviceResource(this.finance.store, () => this.finance.accounts().map((a) => this.toDto(a)), {
      defaultValue: [] as AccountDto[],
    });
  }

  /** One account; idle while `id` is undefined, in error (NotFoundError) for an unknown id. */
  get(id: () => string | undefined) {
    return deviceResource(this.finance.store, () => {
      const value = id();
      if (!value) return IDLE;
      const account = this.finance.accounts().find((a) => a.id === value);
      if (!account) throw new NotFoundError(`Account ${value} not found.`);
      return this.toDto(account);
    });
  }

  /** Creates or replaces an account; the caller generates the id (ADR 0017). */
  async upsert(id: string, input: UpsertAccountDto): Promise<AccountDto> {
    const { store } = this.finance;
    const existing = store.data().accounts.find((a) => a.id === id);
    const values = prepareAccount(id, input, { existing, hasRecords: !!existing && this.hasRecords(id) });
    if (this.finance.accounts().some((a) => a.id !== id && a.name === values.name)) throw duplicateAccountName(values.name);
    const time = now();
    const account = { id, ...values, createdAt: existing?.createdAt ?? time, updatedAt: time, deletedAt: null };
    await store.save({ accounts: [account] });
    return this.toDto(account);
  }

  /** Soft-deletes an account; refused (ConflictError) while it has records. */
  async remove(id: string): Promise<void> {
    const existing = this.finance.store.data().accounts.find((a) => a.id === id);
    if (!existing) throw new NotFoundError(`Account ${id} not found.`);
    if (existing.deletedAt) return;
    assertAccountDeletable(this.hasRecords(id));
    const time = now();
    await this.finance.store.save({ accounts: [{ ...existing, updatedAt: time, deletedAt: time }] });
  }

  private hasRecords(id: string): boolean {
    return this.finance.records().some((r) => r.accountId === id || r.counterAccountId === id);
  }

  private toDto(account: Omit<AccountDto, 'balance'> & { deletedAt: string | null }): AccountDto {
    return { ...withoutDeletedAt(account), balance: balanceOf(account, this.finance.balanceRecords()) };
  }
}

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly finance = inject(FinanceData);

  /** Every live category, flat; build the tree with `categoryTree`. */
  list() {
    return deviceResource(this.finance.store, () => this.finance.categories().map(withoutDeletedAt), {
      defaultValue: [] as CategoryDto[],
    });
  }

  /** Creates or replaces a category; the caller generates the id (ADR 0017). */
  async upsert(id: string, input: UpsertCategoryDto): Promise<CategoryDto> {
    const all = new Map(this.finance.store.data().categories.map((c) => [c.id, c]));
    const values = prepareCategory(id, input, (categoryId) => all.get(categoryId));
    const taken = this.finance.categories().some((c) => c.id !== id && c.parentId === values.parentId && c.name === values.name);
    if (taken) throw duplicateCategoryName(values.name);
    const time = now();
    const category = { id, ...values, createdAt: all.get(id)?.createdAt ?? time, updatedAt: time, deletedAt: null };
    await this.finance.store.save({ categories: [category] });
    return withoutDeletedAt(category);
  }

  /** Soft-deletes a category; refused (ConflictError) while it has subcategories. */
  async remove(id: string): Promise<void> {
    const existing = this.finance.store.data().categories.find((c) => c.id === id);
    if (!existing) throw new NotFoundError(`Category ${id} not found.`);
    if (existing.deletedAt) return;
    assertCategoryDeletable(this.finance.categories().some((c) => c.parentId === id));
    const time = now();
    await this.finance.store.save({ categories: [{ ...existing, updatedAt: time, deletedAt: time }] });
  }
}

@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly finance = inject(FinanceData);

  /** The version in effect for a month; in error (NotFoundError) when none covers it, idle while `month` is undefined. */
  active(month: () => YearMonth | undefined) {
    return deviceResource(this.finance.store, () => {
      const value = month();
      if (!value) return IDLE;
      return this.finance.toVersionDto(activeVersionOrThrow(this.finance.versions(), value));
    });
  }

  /** Every version, oldest first (ADR 0018). */
  versions() {
    return deviceResource(
      this.finance.store,
      () =>
        this.finance.versions().map(
          (v): PlanVersionSummaryDto => ({
            id: v.id,
            effectiveFromMonth: v.effectiveFromMonth,
            note: v.note,
            editable: v.id === this.finance.newestVersion()?.id,
            itemCount: v.items.length,
          }),
        ),
      { defaultValue: [] as PlanVersionSummaryDto[] },
    );
  }

  /** One version with its items; idle while `id` is undefined. */
  version(id: () => string | undefined) {
    return deviceResource(this.finance.store, () => {
      const value = id();
      if (!value) return IDLE;
      const version = this.finance.versions().find((v) => v.id === value);
      if (!version) throw new NotFoundError(`Plan version ${value} not found.`);
      return this.finance.toVersionDto(version);
    });
  }

  /** Saves a whole version; only the newest one can change (ADR 0018). */
  async saveVersion(id: string, input: UpsertPlanVersionDto): Promise<PlanVersionDto> {
    const existing = this.finance.store.data().planVersions.find((v) => v.id === id);
    const values = preparePlanVersion(id, input, {
      existing,
      newest: this.finance.newestVersion(),
      previous: this.finance.versions().filter((v) => v.id !== id).at(-1),
      knownSections: this.finance.knownItemSections(),
    });
    const time = now();
    const version: StoredPlanVersion = {
      id,
      ...values,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
      deletedAt: null,
    };
    await this.finance.store.save({ planVersions: [version] });
    return this.finance.toVersionDto(version);
  }
}

@Injectable({ providedIn: 'root' })
export class RecordsApi {
  private readonly finance = inject(FinanceData);

  lastUsedRates() {
    return deviceResource(this.finance.store, () => lastUsedRates(this.finance.records()), {
      defaultValue: [] as LastUsedRateDto[],
    });
  }

  /** Records in a date range, newest first, with optional filters. */
  list(query: () => RecordQuery) {
    return deviceResource(
      this.finance.store,
      () => {
        const filters = query();
        assertDateRange(filters.from, filters.to);
        return this.finance
          .records()
          .filter((r) => matchesRecordFilters(r, filters))
          .sort(compareRecordsNewestFirst)
          .map(withoutDeletedAt);
      },
      { defaultValue: [] as RecordDto[] },
    );
  }

  /** One record with its lines; idle while `id` is undefined. */
  get(id: () => string | undefined) {
    return deviceResource(this.finance.store, () => {
      const value = id();
      if (!value) return IDLE;
      const record = this.finance.records().find((r) => r.id === value);
      if (!record) throw new NotFoundError(`Record ${value} not found.`);
      return withoutDeletedAt(record);
    });
  }

  /** Soft-deletes a record and its lines. */
  async remove(id: string): Promise<void> {
    const existing = this.finance.store.data().records.find((r) => r.id === id);
    if (!existing) throw new NotFoundError(`Record ${id} not found.`);
    if (existing.deletedAt) return;
    const time = now();
    await this.finance.store.save({ records: [{ ...existing, updatedAt: time, deletedAt: time }] });
  }

  /** Creates or replaces a record; the caller generates the id (ADR 0017). */
  async upsert(id: string, record: UpsertRecordDto): Promise<RecordDto> {
    const [saved] = await this.saveAll([{ ...record, id }], () => '');
    return saved;
  }

  /** Saves several records, all or nothing. */
  async upsertBatch(records: BatchRecordInput[]): Promise<RecordDto[]> {
    return this.saveAll(records, (i) => `records.${i}.`);
  }

  private async saveAll(inputs: readonly RecordInput[], prefix: (index: number) => string): Promise<RecordDto[]> {
    const writes = prepareRecords(inputs, this.lookups(), prefix);
    const stored = new Map(this.finance.store.data().records.map((r) => [r.id, r]));
    const time = now();
    const rows = writes.map((write) => toStoredRecord(write, stored.get(write.id)?.createdAt ?? time, time));
    await this.finance.store.save({ records: rows });
    return rows.map(withoutDeletedAt);
  }

  private lookups() {
    return {
      accounts: new Map(this.finance.accounts().map((a) => [a.id, { currency: a.currency }])),
      categories: new Set(this.finance.categories().map((c) => c.id)),
      budgetItems: new Map([...this.finance.liveItemSections()].map(([id, section]) => [id, { section }])),
    };
  }
}

function toStoredRecord(write: RecordWrite, createdAt: string, updatedAt: string): StoredRecord {
  return {
    ...write,
    occurredAt: write.occurredAt ? write.occurredAt.slice(0, 5) : null,
    lines: write.lines.map(({ sortOrder: _, ...line }) => line),
    createdAt,
    updatedAt,
    deletedAt: null,
  };
}

@Injectable({ providedIn: 'root' })
export class BudgetTransfersApi {
  private readonly finance = inject(FinanceData);

  /** One manual transfer; idle while `id` is undefined. */
  get(id: () => string | undefined) {
    return deviceResource(this.finance.store, () => {
      const value = id();
      if (!value) return IDLE;
      const transfer = this.finance.transfers().find((t) => t.id === value);
      if (!transfer) throw new NotFoundError(`Budget transfer ${value} not found.`);
      return withoutDeletedAt(transfer);
    });
  }

  /** Creates or replaces a manual transfer; the caller generates the id (ADR 0017, 0019). */
  async upsert(id: string, input: UpsertBudgetTransferDto): Promise<BudgetTransferDto> {
    const existing = this.finance.store.data().budgetTransfers.find((t) => t.id === id);
    const values = prepareBudgetTransfer(id, input, { existing, sections: this.finance.liveItemSections() });
    const time = now();
    const transfer = {
      id,
      kind: 'manual' as const,
      ...values,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
      deletedAt: null,
    };
    await this.finance.store.save({ budgetTransfers: [transfer] });
    return withoutDeletedAt(transfer);
  }

  /** Soft-deletes a manual transfer. */
  async remove(id: string): Promise<void> {
    const existing = this.finance.store.data().budgetTransfers.find((t) => t.id === id);
    if (!existing) throw new NotFoundError(`Budget transfer ${id} not found.`);
    if (existing.deletedAt) return;
    assertBudgetTransferDeletable(existing.kind);
    const time = now();
    await this.finance.store.save({ budgetTransfers: [{ ...existing, updatedAt: time, deletedAt: time }] });
  }
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly finance = inject(FinanceData);

  envelopes(date: () => LocalDate) {
    return deviceResource(this.finance.store, () => envelopesReport(this.finance.reportData(), date()), {
      defaultValue: [] as EnvelopeDto[],
    });
  }

  /** Plan vs. actual for a month; in error (NotFoundError) when no plan covers it. */
  monthly(month: () => YearMonth) {
    return deviceResource(this.finance.store, () => monthlyReview(this.finance.reportData(), month()));
  }

  /** Manual budget transfers and computed resets in a date range, in date order (ADR 0019). */
  budgetMovements(range: () => { from: LocalDate; to: LocalDate }) {
    return deviceResource(this.finance.store, () => budgetMovements(this.finance.reportData(), range()), {
      defaultValue: [] as BudgetMovementDto[],
    });
  }

  checklist(date: () => LocalDate) {
    return deviceResource(this.finance.store, () => checklistReport(this.finance.reportData(), date()), {
      defaultValue: [] as ChecklistItemDto[],
    });
  }
}
