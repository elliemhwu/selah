import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSchemas } from '@selah/api-client';
import type { Currency } from '@selah/shared-types';
import type { PlanItemDto } from '../finance/data/finance-api';
import {
  type DeviceSnapshot,
  type DeviceStorage,
  MemoryStorage,
  type StoredAccount,
  type StoredBudgetTransfer,
  type StoredCategory,
  type StoredPlanVersion,
  type StoredRecord,
} from './device-storage';
import { DEVICE_STORAGE, DeviceStore } from './device-store';
import type { SyncError, SyncResponse, SyncServer } from './sync-server';

export { planItem } from '../finance/budget/plan-item.testing';

// Test helpers: screens read and write an in-memory device store seeded with
// rows, instead of stubbing HTTP (ADR 0025, 0026).

const CREATED = '2026-10-01T00:00:00.000Z';

/** Providers for a device store holding `seed`; `storage` shows what was saved. */
export function deviceData(seed: Partial<DeviceSnapshot> = {}): { providers: Provider[]; storage: MemoryStorage } {
  const storage = new MemoryStorage(seed);
  return { providers: [{ provide: DEVICE_STORAGE, useValue: storage }], storage };
}

/** Storage that can't be opened, like IndexedDB blocked by the browser. */
export function brokenStorage(): DeviceStorage {
  const fail = () => Promise.reject(new Error('blocked'));
  return {
    load: fail,
    save: fail,
    saveFromServer: fail,
    replace: fail,
    watch: () => () => undefined,
    outbox: fail,
    settleOutbox: fail,
    requeue: fail,
    dropFromOutbox: fail,
    connection: fail,
    setConnection: fail,
  };
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

type SyncChanges = ApiSchemas['SyncChangesDto'];

/**
 * A sync server for tests (ADR 0028): it accepts every push unless `refuse`
 * says otherwise, logs requests as `METHOD path`, and pulls `changes`.
 */
export class FakeSyncServer implements SyncServer {
  readonly log: string[] = [];
  readonly bodies = new Map<string, unknown>();
  changes: Partial<SyncChanges> = {};
  cursor = '2026-10-15T00:00:00.000Z';
  /** Answers a request with another status; return undefined to accept it. */
  refuse: (method: string, path: string, body: unknown) => SyncResponse | undefined = () => undefined;
  /** Throws instead of answering, such as SyncError('offline'). */
  fail: SyncError | null = null;
  /** The addresses and tokens it was opened with. */
  readonly opened: [string, string][] = [];

  /** Provide as SYNC_SERVER. */
  readonly factory = (server: string, token: string): SyncServer => {
    this.opened.push([server, token]);
    return this;
  };

  async send(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<SyncResponse> {
    if (this.fail) throw this.fail;
    this.log.push(`${method} ${path}`);
    if (body !== undefined) this.bodies.set(`${method} ${path}`, body);
    const refused = this.refuse(method, path, body);
    if (refused) return refused;
    if (method === 'GET') {
      return {
        status: 200,
        body: { cursor: this.cursor, accounts: [], categories: [], records: [], planVersions: [], budgetTransfers: [], settings: null, ...this.changes },
      };
    }
    return { status: method === 'DELETE' ? 204 : 200, body: null };
  }

  /** The pushes it received, in order. */
  pushes(): string[] {
    return this.log.filter((line) => !line.startsWith('GET'));
  }
}

/** A Problem Details refusal (ADR 0017). */
export function problem(status: number, detail: string): SyncResponse {
  return { status, body: { type: 'about:blank', title: 'Refused', status, detail } };
}
