import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ApiSchemas } from '@selah/api-client';
import type { LocalDate, YearMonth } from '@selah/shared-types';
import { firstValueFrom } from 'rxjs';

// API calls for the finance screens (ADR 0015, 0020). Resource methods must be
// called in an injection context, such as a component field initializer.

const API = '/api/v1/finance';

export type AccountDto = ApiSchemas['AccountDto'];
export type UpsertAccountDto = ApiSchemas['UpsertAccountDto'];
export type CategoryDto = ApiSchemas['CategoryDto'];
export type PlanVersionDto = ApiSchemas['PlanVersionDto'];
export type PlanItemDto = ApiSchemas['PlanItemDto'];
export type PlanVersionSummaryDto = ApiSchemas['PlanVersionSummaryDto'];
export type UpsertPlanVersionDto = ApiSchemas['UpsertPlanVersionDto'];
export type RecordDto = ApiSchemas['RecordDto'];
export type UpsertRecordDto = ApiSchemas['UpsertRecordDto'];
export type BatchRecordInput = ApiSchemas['BatchRecordInput'];
export type LastUsedRateDto = ApiSchemas['LastUsedRateDto'];
export type EnvelopeDto = ApiSchemas['EnvelopeDto'];
export type ChecklistItemDto = ApiSchemas['ChecklistItemDto'];

export interface RecordQuery {
  from: LocalDate;
  to: LocalDate;
  accountId?: string;
  categoryId?: string;
  budgetItemId?: string;
  type?: RecordDto['type'];
}

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);

  list() {
    return httpResource<AccountDto[]>(() => `${API}/accounts`, { defaultValue: [] });
  }

  /** One account; no request while `id` is undefined. Errors with 404 for an unknown id. */
  get(id: () => string | undefined) {
    return httpResource<AccountDto>(() => {
      const value = id();
      return value ? `${API}/accounts/${value}` : undefined;
    });
  }

  /** Creates or replaces an account; the caller generates the id (ADR 0017). */
  upsert(id: string, account: UpsertAccountDto): Promise<AccountDto> {
    return firstValueFrom(this.http.put<AccountDto>(`${API}/accounts/${id}`, account));
  }

  /** Soft-deletes an account; refused with 409 while it has records. */
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/accounts/${id}`));
  }
}

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  list() {
    return httpResource<CategoryDto[]>(() => `${API}/categories`, { defaultValue: [] });
  }
}

@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);

  /** The plan version in effect for a month; errors with 404 when none covers it. No request while `month` is undefined. */
  active(month: () => YearMonth | undefined) {
    return httpResource<PlanVersionDto>(() => {
      const value = month();
      return value ? { url: `${API}/plan`, params: { month: value } } : undefined;
    });
  }

  /** Every version, oldest first (ADR 0018). */
  versions() {
    return httpResource<PlanVersionSummaryDto[]>(() => `${API}/plan-versions`, { defaultValue: [] });
  }

  /** One version with its items; no request while `id` is undefined. */
  version(id: () => string | undefined) {
    return httpResource<PlanVersionDto>(() => {
      const value = id();
      return value ? `${API}/plan-versions/${value}` : undefined;
    });
  }

  /** Saves a whole version; only the newest one can change (ADR 0018). */
  saveVersion(id: string, version: UpsertPlanVersionDto): Promise<PlanVersionDto> {
    return firstValueFrom(this.http.put<PlanVersionDto>(`${API}/plan-versions/${id}`, version));
  }
}

@Injectable({ providedIn: 'root' })
export class RecordsApi {
  private readonly http = inject(HttpClient);

  lastUsedRates() {
    return httpResource<LastUsedRateDto[]>(() => `${API}/fx-rates/last-used`, { defaultValue: [] });
  }

  /** Records in a date range, newest first, with optional filters. */
  list(query: () => RecordQuery) {
    return httpResource<RecordDto[]>(
      () => {
        const q = query();
        const params: Record<string, string> = { from: q.from, to: q.to };
        for (const key of ['accountId', 'categoryId', 'budgetItemId', 'type'] as const) {
          const value = q[key];
          if (value) params[key] = value;
        }
        return { url: `${API}/records`, params };
      },
      { defaultValue: [] },
    );
  }

  /** One record with its lines; no request while `id` is undefined. */
  get(id: () => string | undefined) {
    return httpResource<RecordDto>(() => {
      const value = id();
      return value ? `${API}/records/${value}` : undefined;
    });
  }

  /** Soft-deletes a record and its lines. */
  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/records/${id}`));
  }

  /** Creates or replaces a record; the caller generates the id (ADR 0017). */
  upsert(id: string, record: UpsertRecordDto): Promise<RecordDto> {
    return firstValueFrom(this.http.put<RecordDto>(`${API}/records/${id}`, record));
  }

  /** Saves several records, all or nothing. */
  upsertBatch(records: BatchRecordInput[]): Promise<RecordDto[]> {
    return firstValueFrom(this.http.put<RecordDto[]>(`${API}/records`, { records }));
  }
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  envelopes(date: () => LocalDate) {
    return httpResource<EnvelopeDto[]>(() => ({ url: `${API}/reports/envelopes`, params: { date: date() } }), {
      defaultValue: [],
    });
  }

  checklist(date: () => LocalDate) {
    return httpResource<ChecklistItemDto[]>(() => ({ url: `${API}/reports/checklist`, params: { date: date() } }), {
      defaultValue: [],
    });
  }
}
