import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Currency } from '@selah/shared-types';
import type { PlanItemDto } from '../finance/data/finance-api';
import {
  type DeviceSnapshot,
  MemoryStorage,
  type StoredAccount,
  type StoredArea,
  type StoredBudgetTransfer,
  type StoredCategory,
  type StoredComment,
  type StoredGodNote,
  type StoredJournal,
  type StoredMoment,
  type StoredPlanVersion,
  type StoredProject,
  type StoredRecord,
  type StoredTask,
  type StoredTaskRecord,
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

// Journal rows (ADR 0030).

export function storedMoment(id: string, fields: Partial<StoredMoment> = {}): StoredMoment {
  return { id, date: '2026-10-01', title: id, summary: null, createdAt: CREATED, updatedAt: CREATED, deletedAt: null, ...fields };
}

export function storedJournal(id: string, fields: Partial<StoredJournal> = {}): StoredJournal {
  return {
    id,
    momentId: null,
    writtenAt: '2026-10-20T14:30:00.000Z',
    datePrecision: 'day',
    body: 'Dear Diary,',
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedComment(id: string, fields: Partial<StoredComment> = {}): StoredComment {
  return {
    id,
    journalId: null,
    momentId: null,
    writtenAt: '2026-10-21T08:00:00.000Z',
    body: 'Looking back, it was all right.',
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedGodNote(id: string, journalId: string, fields: Partial<StoredGodNote> = {}): StoredGodNote {
  return {
    id,
    journalId,
    writtenAt: '2026-10-21T09:00:00.000Z',
    body: 'Come to me, and rest.',
    verseRef: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedArea(id: string, fields: Partial<StoredArea> = {}): StoredArea {
  return { id, name: '學習', position: 1, archivedAt: null, createdAt: CREATED, updatedAt: CREATED, deletedAt: null, ...fields };
}

export function storedProject(id: string, areaId: string, fields: Partial<StoredProject> = {}): StoredProject {
  return {
    id,
    areaId,
    groupId: null,
    name: 'LeetCode',
    mode: 'queue',
    position: 1,
    archivedAt: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedTask(id: string, fields: Partial<StoredTask> = {}): StoredTask {
  return {
    id,
    projectId: null,
    title: 'Draft the weekly digest',
    notes: null,
    position: 1,
    dueDate: null,
    planStart: null,
    planGrain: null,
    later: false,
    prioritizedOn: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}

export function storedTaskRecord(id: string, taskId: string, fields: Partial<StoredTaskRecord> = {}): StoredTaskRecord {
  return {
    id,
    taskId,
    kind: 'done',
    occurredOn: '2026-11-03',
    occurredAt: null,
    sessionId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...fields,
  };
}
