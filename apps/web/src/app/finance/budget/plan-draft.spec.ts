import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlanVersionDto } from '../data/finance-api';
import { PlanDraft } from './plan-draft';
import { planItem } from './plan-item.testing';

const version: PlanVersionDto = {
  id: 'v1',
  effectiveFromMonth: '2026-10',
  note: 'After the raise',
  editable: true,
  items: [planItem('food', { amount: '7000.00' }), planItem('daily', { parentItemId: 'food', cadence: 'daily', amount: '185.00' }), planItem('rent', { amount: '15000.00' })],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

describe('PlanDraft', () => {
  let http: HttpTestingController;
  let draft: PlanDraft;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    draft = TestBed.inject(PlanDraft);
  });
  afterEach(() => http.verify());

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
    const stored = JSON.parse(localStorage.getItem('selah.planDraft.v1') as string);
    expect(stored.items[2].name).toBe('Rent & bills');
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
    const saving = draft.save();
    const req = http.expectOne({ method: 'PUT', url: '/api/v1/finance/plan-versions/v1' });
    expect(req.request.body).toEqual({
      effectiveFromMonth: '2026-10',
      note: 'After the raise',
      items: [version.items[0], version.items[1], { ...version.items[2], amount: '16000.00' }],
    });
    req.flush(version);
    expect(await saving).toEqual({ ok: true, version });
    expect(draft.state()).toBeNull();
  });

  it('puts rule violations on their items and keeps the draft', async () => {
    draft.edit(version);
    const saving = draft.save();
    http.expectOne({ method: 'PUT' }).flush(
      {
        status: 422,
        detail: 'The plan breaks the rules.',
        errors: { 'items.1.resetCycle': ['A daily item can reset: never, week, month, year.'], effectiveFromMonth: ['Too early.'] },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(await saving).toEqual({ ok: false, message: 'The plan breaks the rules.' });
    expect(draft.errors()).toEqual({
      general: ['Too early.'],
      byItem: { daily: ['A daily item can reset: never, week, month, year.'] },
    });
    expect(draft.state()).not.toBeNull();
  });
});
