import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Currency } from '@selah/shared-types';
import type { PlanItemDto } from '../finance/data/finance-api';
import {
  type DeviceSnapshot,
  MemoryStorage,
  type StoredAccount,
  type StoredBudgetTransfer,
  type StoredCategory,
  type StoredPlanVersion,
  type StoredRecord,
} from './device-storage';
import { DEVICE_STORAGE, DeviceStore } from './device-store';

export { planItem } from '../finance/budget/plan-item.testing';

// Test helpers: screens read and write an in-memory device store seeded with
// rows, instead of stubbing HTTP (ADR 0025, 0026).

const CREATED = '2026-10-01T00:00:00.000Z';

/** Providers for a device store holding `seed`; `storage` shows what was saved. */
export function deviceData(seed: Partial<DeviceSnapshot> = {}): { providers: Provider[]; storage: MemoryStorage } {
  const storage = new MemoryStorage(seed);
  return { providers: [{ provide: DEVICE_STORAGE, useValue: storage }], storage };
}

/** Waits for the store to load, then lets the fixture render. */
export async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  await TestBed.inject(DeviceStore).whenLoaded();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Lets a save's promise chain finish. */
export const flushSaves = () => new Promise((resolve) => setTimeout(resolve));

export function storedAccount(id: string, currency: Currency = 'TWD', fields: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id,
    name: id,
    type: 'cash',
    currency,
    openingBalance: '0.00',
    sortOrder: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedCategory(id: string, parentId: string | null = null, fields: Partial<StoredCategory> = {}): StoredCategory {
  return { id, name: id, parentId, sortOrder: 0, createdAt: CREATED, updatedAt: CREATED, deletedAt: null, ...fields };
}

export function storedRecord(id: string, fields: Partial<StoredRecord> = {}): StoredRecord {
  return {
    id,
    type: 'expense',
    occurredOn: '2026-10-05',
    occurredAt: null,
    accountId: 'cash',
    currency: 'TWD',
    counterAccountId: null,
    counterAmount: null,
    targetBalance: null,
    note: null,
    lines: [],
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

/** A TWD line of `amount` (a decimal string). */
export function storedLine(id: string, amount: string, fields: Partial<StoredRecord['lines'][number]> = {}) {
  return { id, amount, twdAmount: amount, fxRate: null, categoryId: null, budgetItemId: null, note: null, ...fields };
}

export function storedVersion(
  id: string,
  effectiveFromMonth: string,
  items: PlanItemDto[],
  fields: Partial<StoredPlanVersion> = {},
): StoredPlanVersion {
  return { id, effectiveFromMonth, note: null, items, createdAt: CREATED, updatedAt: CREATED, deletedAt: null, ...fields };
}

export function storedTransfer(id: string, fields: Partial<StoredBudgetTransfer> = {}): StoredBudgetTransfer {
  return {
    id,
    kind: 'manual',
    occurredOn: '2026-10-08',
    occurredAt: null,
    fromItemId: 'rent',
    toItemId: 'allowance',
    amount: '300.00',
    note: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}
