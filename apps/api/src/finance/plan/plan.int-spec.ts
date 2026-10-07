import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const VERSIONS = '/api/v1/finance/plan-versions';

describe('plan API', () => {
  let t: TestApp;
  let ids: Record<'salary' | 'bonus' | 'tax' | 'food' | 'daily' | 'allowance' | 'rent' | 'trip', string>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDatabase(t.db);
    ids = {
      salary: newId(),
      bonus: newId(),
      tax: newId(),
      food: newId(),
      daily: newId(),
      allowance: newId(),
      rent: newId(),
      trip: newId(),
    };
  });

  /** A realistic plan: salary, bonus, tax, a Food tree with rollover, rent with an override, a trip. */
  function items() {
    return [
      { budgetItemId: ids.salary, section: 'income', name: 'Salary', cadence: 'monthly', anchor: 'amount', amount: '60000' },
      { budgetItemId: ids.bonus, section: 'income', name: 'Year-end bonus', cadence: 'yearly', cadenceMonth: 1, anchor: 'amount', amount: '80000' },
      { budgetItemId: ids.tax, section: 'government', name: 'Income tax', cadence: 'monthly', anchor: 'percent', percent: '5', percentBase: 'gross_income' },
      { budgetItemId: ids.food, section: 'expense', name: 'Food', cadence: 'monthly', anchor: 'percent', percent: '12.5' },
      {
        budgetItemId: ids.daily, section: 'expense', name: 'Daily Food', parentItemId: ids.food, cadence: 'daily', anchor: 'amount', amount: '185',
        rollover: true, resetCycle: 'week', onReset: 'carry', carryToItemId: ids.allowance,
      },
      { budgetItemId: ids.allowance, section: 'expense', name: 'Weekly Allowance', cadence: 'weekly', anchor: 'amount', amount: '500', rollover: true, resetCycle: 'never' },
      { budgetItemId: ids.rent, section: 'expense', name: 'Rent', cadence: 'monthly', anchor: 'amount', amount: '15000', overrides: [{ month: '2026-12', amount: '16200' }] },
      { budgetItemId: ids.trip, section: 'saving', name: 'Japan trip', cadence: 'one_time', cadenceDate: '2026-12-20', anchor: 'amount', amount: '30000' },
    ];
  }

  const put = (id: string, body: object) => t.http().put(`${VERSIONS}/${id}`).send(body);
  const version = (month: string, overrides: object = {}) => ({ effectiveFromMonth: month, note: 'v', items: items(), ...overrides });

  it('creates a whole version (201) and reads it back', async () => {
    const id = newId();
    const res = await put(id, version('2026-10')).expect(201);
    expect(res.body).toMatchObject({ id, effectiveFromMonth: '2026-10', note: 'v', editable: true });
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items[4]).toEqual({
      budgetItemId: ids.daily,
      section: 'expense',
      name: 'Daily Food',
      parentItemId: ids.food,
      cadence: 'daily',
      cadenceMonth: null,
      cadenceDate: null,
      anchor: 'amount',
      amount: '185.00',
      percent: null,
      percentBase: 'net_income',
      rollover: true,
      resetCycle: 'week',
      onReset: 'carry',
      carryToItemId: ids.allowance,
      overrides: [],
    });
    expect(res.body.items[2]).toMatchObject({ anchor: 'percent', percent: '5.0000', amount: null, percentBase: 'gross_income' });
    expect(res.body.items[6].overrides).toEqual([{ month: '2026-12', amount: '16200.00' }]);

    expect((await t.http().get(`${VERSIONS}/${id}`).expect(200)).body).toEqual(res.body);
    expect((await t.http().get(VERSIONS).expect(200)).body).toEqual([
      { id, effectiveFromMonth: '2026-10', note: 'v', editable: true, itemCount: 8 },
    ]);
  });

  it('replaces a version, keeping row ids for items and overrides that stay', async () => {
    const id = newId();
    await put(id, version('2026-10')).expect(201);
    const rowId = async (budgetItemId: string) =>
      (await t.db.selectFrom('finance.budgetItemVersions').select('id').where('budgetItemId', '=', budgetItemId).where('deletedAt', 'is', null).executeTakeFirst())?.id;
    const rentRow = await rowId(ids.rent);

    const changed = items()
      .filter((i) => i.budgetItemId !== ids.trip)
      .map((i) => (i.budgetItemId === ids.rent ? { ...i, name: 'Rent & utilities', overrides: [{ month: '2027-01', amount: '15500' }] } : i))
      .reverse();
    const res = await put(id, version('2026-11', { items: changed, note: null })).expect(200);

    expect(res.body.effectiveFromMonth).toBe('2026-11');
    expect(res.body.note).toBeNull();
    expect(res.body.items.map((i: { name: string }) => i.name)[0]).toBe('Rent & utilities'); // order follows the document
    expect(res.body.items).toHaveLength(7);
    expect(res.body.items[0].overrides).toEqual([{ month: '2027-01', amount: '15500.00' }]);
    expect(await rowId(ids.rent)).toBe(rentRow);
    expect(await rowId(ids.trip)).toBeUndefined();
  });

  it('finds the version active in a month', async () => {
    const v1 = newId();
    const v2 = newId();
    await put(v1, version('2026-01')).expect(201);
    await put(v2, version('2026-07')).expect(201);
    const active = async (month: string) => (await t.http().get(`/api/v1/finance/plan?month=${month}`)).body.id;
    expect(await active('2026-03')).toBe(v1);
    expect(await active('2026-07')).toBe(v2);
    expect(await active('2030-01')).toBe(v2);
    await t.http().get('/api/v1/finance/plan?month=2025-12').expect(404);
    await t.http().get('/api/v1/finance/plan?month=2026-13').expect(400);
  });

  it('keeps older versions as a read-only log', async () => {
    const v1 = newId();
    const v2 = newId();
    await put(v1, version('2026-01')).expect(201);
    // A copy of v1 under a new id, starting later, with Food renamed.
    const copy = (await t.http().get(`${VERSIONS}/${v1}`)).body;
    copy.items[3].name = 'Groceries';
    await put(v2, { effectiveFromMonth: '2026-07', note: copy.note, items: copy.items }).expect(201);

    expect((await t.http().get(`${VERSIONS}/${v1}`)).body.editable).toBe(false);
    expect((await t.http().get(`${VERSIONS}/${v1}`)).body.items[3].name).toBe('Food');
    await put(v1, version('2026-01')).expect(409);
    await t.http().delete(`${VERSIONS}/${v1}`).expect(409);

    const tooEarly = await put(newId(), version('2026-07')).expect(422);
    expect(tooEarly.body.errors.effectiveFromMonth).toBeDefined();
    await put(v2, version('2026-01')).expect(422); // can't move the newest before the previous one

    await t.http().delete(`${VERSIONS}/${v2}`).expect(204);
    expect((await t.http().get(`${VERSIONS}/${v1}`)).body.editable).toBe(true);
    await put(v2, version('2026-08')).expect(409); // deleted ids stay deleted
  });

  it("refuses to move an existing item to another section (422)", async () => {
    await put(newId(), version('2026-01')).expect(201);
    const moved = items().map((i) => (i.budgetItemId === ids.trip ? { ...i, section: 'expense' } : i));
    const res = await put(newId(), version('2026-02', { items: moved })).expect(422);
    expect(Object.keys(res.body.errors)).toEqual(['items.7.section']);
  });

  const patch = (key: keyof typeof ids, change: object) => () =>
    items().map((i) => (i.budgetItemId === ids[key] ? { ...i, ...change } : i));

  it.each([
    ['a missing parent', patch('daily', { parentItemId: 'NEW' }), 'items.4.parentItemId'],
    ['a parent in another section', patch('trip', { parentItemId: 'FOOD' }), 'items.7.parentItemId'],
    ['its own parent', patch('food', { parentItemId: 'FOOD' }), 'items.3.parentItemId'],
    ['a loop', patch('food', { parentItemId: 'DAILY' }), 'items.3.parentItemId'],
    ['a yearly item without a month', patch('bonus', { cadenceMonth: null }), 'items.1.cadenceMonth'],
    ['a month on a monthly item', patch('rent', { cadenceMonth: 3 }), 'items.6.cadenceMonth'],
    ['a one-time item without a date', patch('trip', { cadenceDate: null }), 'items.7.cadenceDate'],
    ['an unreal one-time date', patch('trip', { cadenceDate: '2026-02-30' }), 'items.7.cadenceDate'],
    ['both amount and percent', patch('rent', { percent: '10' }), 'items.6.percent'],
    ['a percent item without percent', patch('food', { percent: null }), 'items.3.percent'],
    ['a fractional amount', patch('rent', { amount: '15000.5' }), 'items.6.amount'],
    ['a percent of income on income', patch('salary', { anchor: 'percent', amount: null, percent: '50' }), 'items.0.anchor'],
    ['government on net income', patch('tax', { percentBase: 'net_income' }), 'items.2.percentBase'],
    ['rollover on a yearly item', patch('bonus', { rollover: true, resetCycle: 'never' }), 'items.1.rollover'],
    ['a weekly item resetting monthly', patch('allowance', { resetCycle: 'month', onReset: 'drop' }), 'items.5.resetCycle'],
    ['a reset without an action', patch('daily', { onReset: null, carryToItemId: null }), 'items.4.onReset'],
    ['carry without a target', patch('daily', { carryToItemId: null }), 'items.4.carryToItemId'],
    ['a carry target outside the version', patch('daily', { carryToItemId: 'NEW' }), 'items.4.carryToItemId'],
    ['a weekly percentage', patch('allowance', { anchor: 'percent', amount: null, percent: '1' }), 'items.5.anchor'],
    ['rollover on an income item', patch('salary', { rollover: true, resetCycle: 'never' }), 'items.0.rollover'],
    ['carrying into an income item', patch('daily', { carryToItemId: 'SALARY' }), 'items.4.carryToItemId'],
    ['a carry loop', patch('allowance', { resetCycle: 'week', onReset: 'carry', carryToItemId: 'DAILY' }), 'items.5.carryToItemId'],
    ['reset settings without rollover', patch('rent', { resetCycle: 'month' }), 'items.6.resetCycle'],
    ['an override on a weekly item', patch('allowance', { overrides: [{ month: '2026-12', amount: '1' }] }), 'items.5.overrides'],
    ['an override before the start', patch('rent', { overrides: [{ month: '2026-09', amount: '1' }] }), 'items.6.overrides.0.month'],
    ['a month overridden twice', patch('rent', { overrides: [{ month: '2026-12', amount: '1' }, { month: '2026-12', amount: '2' }] }), 'items.6.overrides.1.month'],
  ])('rejects %s (422)', async (_name, build, field) => {
    const body = JSON.parse(
      JSON.stringify(build())
        .replaceAll('"NEW"', `"${newId()}"`)
        .replaceAll('"FOOD"', `"${ids.food}"`)
        .replaceAll('"DAILY"', `"${ids.daily}"`)
        .replaceAll('"SALARY"', `"${ids.salary}"`),
    );
    const res = await put(newId(), version('2026-10', { items: body })).expect(422);
    expect(Object.keys(res.body.errors)).toContain(field);
  });

  it('rejects the same item twice (422)', async () => {
    const list = items();
    const res = await put(newId(), version('2026-10', { items: [...list, list[0]] })).expect(422);
    expect(Object.keys(res.body.errors)).toContain('items.8.budgetItemId');
  });

  it('rejects malformed shapes (400)', async () => {
    const res = await put(newId(), { effectiveFromMonth: '2026-13', items: [{ ...items()[0], percent: '101', cadence: 'hourly' }] }).expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['effectiveFromMonth', 'items.0.cadence', 'items.0.percent']);
  });

  it('lets records link to plan items', async () => {
    await put(newId(), version('2026-10')).expect(201);
    const cash = newId();
    await t.http().put(`/api/v1/finance/accounts/${cash}`).send({ name: 'Cash', type: 'cash', currency: 'TWD', openingBalance: '0' });
    await t.http().put(`/api/v1/finance/records/${newId()}`).send({
      type: 'expense', occurredOn: '2026-10-06', accountId: cash, currency: 'TWD', lines: [{ amount: '150', budgetItemId: ids.daily }],
    }).expect(201);
  });
});
