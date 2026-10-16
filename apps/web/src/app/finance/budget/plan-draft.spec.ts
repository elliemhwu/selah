import { TestBed } from '@angular/core/testing';
import type { MemoryStorage } from '../../data/device-storage';
import { DeviceStore } from '../../data/device-store';
import { deviceData, storedVersion } from '../../data/testing';
import type { PlanVersionDto } from '../data/finance-api';
import { PlanDraft } from './plan-draft';
import { planItem } from './plan-item.testing';

const stored = storedVersion(
  'v1',
  '2026-10',
  [planItem('food', { amount: '7000.00' }), planItem('daily', { parentItemId: 'food', cadence: 'daily', amount: '185.00' }), planItem('rent', { amount: '15000.00' })],
  { note: 'After the raise' },
);
const { deletedAt: _, ...rest } = stored;
const version: PlanVersionDto = { ...rest, editable: true };

describe('PlanDraft', () => {
  let draft: PlanDraft;
  let storage: MemoryStorage;

  beforeEach(async () => {
    localStorage.clear();
    const device = deviceData({ planVersions: [stored] });
    storage = device.storage;
    TestBed.configureTestingModule({ providers: device.providers });
    draft = TestBed.inject(PlanDraft);
    await TestBed.inject(DeviceStore).whenLoaded();
  });

  it('tracks new, edited and removed items against the version', () => {
    draft.edit(version);
    expect(draft.changes().count).toBe(0);
    draft.putItem({ ...version.items[2], amount: '16000.00' });
    draft.putItem(planItem('trip', { section: 'saving', amount: '3000.00' }));
    expect(draft.removeItem('food')).toBe(2); // and Daily Food under it
    const changes = draft.changes();
    expect([...changes.edited]).toEqual(['rent']);
    expect([...changes.added]).toEqual(['trip']);
    expect(changes.removed).toBe(2);
    expect(changes.count).toBe(4);
    expect(draft.state()?.items.map((i) => i.budgetItemId)).toEqual(['rent', 'trip']);
  });

  it('keeps the draft on the device', () => {
    draft.edit(version);
    draft.putItem({ ...version.items[2], name: 'Rent & bills' });
    TestBed.tick();
    const kept = JSON.parse(localStorage.getItem('selah.planDraft.v1') as string);
    expect(kept.items[2].name).toBe('Rent & bills');
    draft.discard();
    TestBed.tick();
    expect(localStorage.getItem('selah.planDraft.v1')).toBeNull();
  });

  it('starts a new version as a copy with a fresh id', () => {
    draft.startNew(version, '2027-01', 'New job');
    const state = draft.state();
    expect(state).toMatchObject({ effectiveFromMonth: '2027-01', note: 'New job', isNew: true });
    expect(state?.versionId).not.toBe('v1');
    expect(state?.items).toEqual(version.items);
    expect(draft.changes().count).toBe(0);
  });

  it('saves the whole version, then clears the draft', async () => {
    draft.edit(version);
    draft.putItem({ ...version.items[2], amount: '16000.00' });
    const result = await draft.save();
    expect(result).toMatchObject({ ok: true, version: { id: 'v1', editable: true } });
    expect(storage.snapshot().planVersions).toEqual([
      expect.objectContaining({
        id: 'v1',
        effectiveFromMonth: '2026-10',
        note: 'After the raise',
        items: [version.items[0], version.items[1], { ...version.items[2], amount: '16000.00' }],
      }),
    ]);
    expect(draft.state()).toBeNull();
  });

  it('puts rule violations on their items and keeps the draft', async () => {
    // A version starting before the existing one, with a reset that says nothing about the leftover.
    draft.startNew(version, '2026-09', null);
    draft.putItem({ ...version.items[1], rollover: true, resetCycle: 'week' });
    expect(await draft.save()).toEqual({ ok: false, message: 'The plan breaks the rules.' });
    expect(draft.errors()).toEqual({
      general: ['A new version must start after 2026-10.'],
      byItem: { daily: ['Choose what happens at reset: drop or carry.'] },
    });
    expect(draft.state()).not.toBeNull();
    expect(storage.snapshot().planVersions).toHaveLength(1);
  });
});
