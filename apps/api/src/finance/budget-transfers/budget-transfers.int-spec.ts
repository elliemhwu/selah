import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const TRANSFERS = '/api/v1/finance/budget-transfers';

describe('budget transfers API', () => {
  let t: TestApp;
  let allowance: string;
  let travel: string;
  let salary: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDatabase(t.db);
    allowance = newId();
    travel = newId();
    salary = newId();
    await t.db.insertInto('finance.budgetItems').values([
      { id: allowance, section: 'expense' },
      { id: travel, section: 'saving' },
      { id: salary, section: 'income' },
    ]).execute();
  });

  const put = (id: string, body: object) => t.http().put(`${TRANSFERS}/${id}`).send(body);
  const transfer = (overrides: object = {}) => ({
    occurredOn: '2026-10-31',
    fromItemId: allowance,
    toItemId: travel,
    amount: '500',
    ...overrides,
  });

  it('creates (201), reads back, replaces (200) and deletes (204)', async () => {
    const id = newId();
    const created = await put(id, transfer({ occurredAt: '21:00', note: 'leftover' })).expect(201);
    expect(created.body).toMatchObject({
      id,
      kind: 'manual',
      occurredOn: '2026-10-31',
      occurredAt: '21:00',
      fromItemId: allowance,
      toItemId: travel,
      amount: '500.00',
      note: 'leftover',
    });
    expect((await t.http().get(`${TRANSFERS}/${id}`).expect(200)).body).toEqual(created.body);

    const replaced = await put(id, transfer({ amount: '600', note: ' ' })).expect(200);
    expect(replaced.body).toMatchObject({ amount: '600.00', occurredAt: null, note: null });

    await t.http().delete(`${TRANSFERS}/${id}`).expect(204);
    await t.http().delete(`${TRANSFERS}/${id}`).expect(204);
    await t.http().get(`${TRANSFERS}/${id}`).expect(404);
    await put(id, transfer()).expect(409);
    await t.http().delete(`${TRANSFERS}/${newId()}`).expect(404);
  });

  it('lists by date range and item, oldest first', async () => {
    const [a, b, c] = [newId(), newId(), newId()];
    await put(b, transfer({ occurredOn: '2026-10-15' })).expect(201);
    await put(a, transfer({ occurredOn: '2026-10-01', fromItemId: travel, toItemId: allowance })).expect(201);
    await put(c, transfer({ occurredOn: '2026-11-01' })).expect(201);
    const list = async (query: string) =>
      (await t.http().get(`${TRANSFERS}?${query}`).expect(200)).body.map((x: { id: string }) => x.id);
    expect(await list('from=2026-10-01&to=2026-10-31')).toEqual([a, b]);
    expect(await list(`from=2026-10-01&to=2026-12-31&budgetItemId=${allowance}`)).toEqual([a, b, c]);
    await t.http().get(`${TRANSFERS}?from=2026-10-31&to=2026-10-01`).expect(422);
    await t.http().get(`${TRANSFERS}?from=2026-10-01`).expect(400);
  });

  it.each([
    ['the same item twice', () => transfer({ toItemId: allowance }), 'toItemId'],
    ['an unknown item', () => transfer({ fromItemId: newId() }), 'fromItemId'],
    ['an income item', () => transfer({ toItemId: salary }), 'toItemId'],
    ['a zero amount', () => transfer({ amount: '0' }), 'amount'],
    ['a fractional amount', () => transfer({ amount: '10.5' }), 'amount'],
    ['an unreal date', () => transfer({ occurredOn: '2026-02-30' }), 'occurredOn'],
  ])('rejects %s (422)', async (_name, build, field) => {
    const res = await put(newId(), build()).expect(422);
    expect(Object.keys(res.body.errors)).toContain(field);
  });

  it('rejects malformed shapes (400)', async () => {
    const res = await put(newId(), { occurredOn: '2026-10-31', fromItemId: allowance, amount: 'lots', kind: 'reset' }).expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['amount', 'kind', 'toItemId']);
  });

  it('leaves stored resets to Close Week (409)', async () => {
    const id = newId();
    await t.db.insertInto('finance.budgetTransfers').values({
      id, kind: 'reset', occurredOn: '2026-10-11', fromItemId: allowance, toItemId: null, amount: '100',
    }).execute();
    await put(id, transfer()).expect(409);
    await t.http().delete(`${TRANSFERS}/${id}`).expect(409);
  });
});
