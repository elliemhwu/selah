import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const RECORDS = '/api/v1/finance/records';
const ACCOUNTS = '/api/v1/finance/accounts';

describe('records API', () => {
  let t: TestApp;
  let cash: string;
  let card: string;
  let usd: string;
  let food: string;
  let salary: string;
  let lunch: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDatabase(t.db);
    cash = newId();
    card = newId();
    usd = newId();
    await t.http().put(`${ACCOUNTS}/${cash}`).send({ name: 'Cash', type: 'cash', currency: 'TWD', openingBalance: '1000' });
    await t.http().put(`${ACCOUNTS}/${card}`).send({ name: 'Card', type: 'credit_card', currency: 'TWD', openingBalance: '0' });
    await t.http().put(`${ACCOUNTS}/${usd}`).send({ name: 'USD', type: 'bank', currency: 'USD', openingBalance: '0' });
    // Budget items come from the plan API later (Phase 4c); insert them directly for now.
    food = newId();
    salary = newId();
    await t.db.insertInto('finance.budgetItems').values([
      { id: food, section: 'expense' },
      { id: salary, section: 'income' },
    ]).execute();
    lunch = newId();
    await t.http().put(`/api/v1/finance/categories/${lunch}`).send({ name: 'Lunch' });
  });

  const put = (id: string, body: object) => t.http().put(`${RECORDS}/${id}`).send(body);
  const balance = async (accountId: string) => (await t.http().get(`${ACCOUNTS}/${accountId}`)).body.balance;
  const expense = (overrides: object = {}) => ({
    type: 'expense',
    occurredOn: '2026-10-06',
    accountId: cash,
    currency: 'TWD',
    lines: [{ amount: '150' }],
    ...overrides,
  });

  describe('create, replace, delete', () => {
    it('creates (201), reads back, and replaces (200) keeping line ids', async () => {
      const id = newId();
      const lineId = newId();
      const created = await put(id, expense({
        occurredAt: '12:30',
        note: 'lunch',
        lines: [{ id: lineId, amount: '150', categoryId: lunch, budgetItemId: food }],
      })).expect(201);
      expect(created.body).toMatchObject({
        id,
        type: 'expense',
        occurredOn: '2026-10-06',
        occurredAt: '12:30',
        currency: 'TWD',
        note: 'lunch',
        lines: [{ id: lineId, amount: '150.00', twdAmount: '150.00', fxRate: null, categoryId: lunch, budgetItemId: food }],
      });
      expect(await balance(cash)).toBe('850.00');

      const extra = newId();
      const replaced = await put(id, expense({
        lines: [
          { id: lineId, amount: '120' },
          { id: extra, amount: '80', note: 'drink' },
        ],
      })).expect(200);
      expect(replaced.body.lines.map((l: { id: string }) => l.id)).toEqual([lineId, extra]);
      expect(replaced.body.occurredAt).toBeNull();
      expect(await balance(cash)).toBe('800.00');

      // Dropping a line soft-deletes it.
      await put(id, expense({ lines: [{ id: extra, amount: '80' }] })).expect(200);
      const dropped = await t.db.selectFrom('finance.recordLines').select('deletedAt').where('id', '=', lineId).executeTakeFirst();
      expect(dropped?.deletedAt).toBeInstanceOf(Date);
      expect(await balance(cash)).toBe('920.00');
    });

    it('is idempotent', async () => {
      const id = newId();
      const body = expense({ lines: [{ id: newId(), amount: '150' }] });
      await put(id, body).expect(201);
      await put(id, body).expect(200);
      expect(await balance(cash)).toBe('850.00');
    });

    it('soft-deletes a record and its lines', async () => {
      const id = newId();
      await put(id, expense()).expect(201);
      await t.http().delete(`${RECORDS}/${id}`).expect(204);
      await t.http().delete(`${RECORDS}/${id}`).expect(204);
      await t.http().get(`${RECORDS}/${id}`).expect(404);
      expect(await balance(cash)).toBe('1000.00');
      const lines = await t.db.selectFrom('finance.recordLines').select('deletedAt').where('recordId', '=', id).execute();
      expect(lines.every((l) => l.deletedAt instanceof Date)).toBe(true);
      await put(id, expense()).expect(409);
      await t.http().delete(`${RECORDS}/${newId()}`).expect(404);
    });

    it("refuses to take over another record's line (409)", async () => {
      const lineId = newId();
      await put(newId(), expense({ lines: [{ id: lineId, amount: '1' }] })).expect(201);
      await put(newId(), expense({ lines: [{ id: lineId, amount: '1' }] })).expect(409);
    });
  });

  describe('money rules', () => {
    it('calculates TWD from the rate, or takes the statement amount', async () => {
      const calculated = await put(newId(), expense({
        accountId: card,
        currency: 'JPY',
        lines: [{ amount: '1200', fxRate: '0.2083' }],
      })).expect(201);
      expect(calculated.body.lines[0]).toMatchObject({ amount: '1200.00', twdAmount: '250.00', fxRate: '0.20830000' });

      const statement = await put(newId(), expense({
        accountId: card,
        currency: 'JPY',
        lines: [{ amount: '1200', fxRate: '0.2083', twdAmount: '248' }],
      })).expect(201);
      expect(statement.body.lines[0].twdAmount).toBe('248.00');
      expect(await balance(card)).toBe('-498.00');
    });

    it('refuses a JPY record on a USD account (ADR 0016)', async () => {
      const res = await put(newId(), expense({ accountId: usd, currency: 'JPY', lines: [{ amount: '1200', fxRate: '0.2' }] })).expect(422);
      expect(res.body.errors.currency).toBeDefined();
    });

    it('accepts cents on a USD account', async () => {
      await put(newId(), expense({ accountId: usd, currency: 'USD', lines: [{ amount: '9.99', fxRate: '32.08' }] })).expect(201);
      expect(await balance(usd)).toBe('-9.99');
    });

    it.each([
      ['fractional TWD', { lines: [{ amount: '10.5' }] }, 'lines.0.amount'],
      ['zero amount', { lines: [{ amount: '0' }] }, 'lines.0.amount'],
      ['negative amount', { lines: [{ amount: '-5' }] }, 'lines.0.amount'],
      ['a rate on TWD', { lines: [{ amount: '5', fxRate: '1' }] }, 'lines.0.fxRate'],
      ['a different twdAmount on TWD', { lines: [{ amount: '5', twdAmount: '6' }] }, 'lines.0.twdAmount'],
      ['no rate on JPY', { accountId: 'CARD', currency: 'JPY', lines: [{ amount: '100' }] }, 'lines.0.fxRate'],
      ['a zero rate', { accountId: 'CARD', currency: 'JPY', lines: [{ amount: '100', fxRate: '0.000' }] }, 'lines.0.fxRate'],
      ['a rate rounding to 0 TWD', { accountId: 'CARD', currency: 'JPY', lines: [{ amount: '1', fxRate: '0.2' }] }, 'lines.0.twdAmount'],
      ['no lines', { lines: [] }, 'lines'],
      ['an unreal date', { occurredOn: '2026-02-30' }, 'occurredOn'],
      ['an unknown account', { accountId: '00000000-0000-4000-8000-000000000000' }, 'accountId'],
    ])('rejects %s (422)', async (_name, overrides, field) => {
      // Table rows are built before beforeEach runs, so ids are filled in here.
      const body = JSON.parse(JSON.stringify(expense(overrides)).replace('CARD', card));
      const res = await put(newId(), body).expect(422);
      expect(Object.keys(res.body.errors)).toContain(field);
    });

    it('rejects a malformed time (400)', async () => {
      const res = await put(newId(), expense({ occurredAt: '24:00' })).expect(400);
      expect(res.body.errors.occurredAt).toBeDefined();
    });
  });

  describe('links', () => {
    it.each([
      ['income on an expense item', { type: 'income', lines: [{ amount: '5', budgetItemId: 'FOOD' }] }],
      ['expense on an income item', { type: 'expense', lines: [{ amount: '5', budgetItemId: 'SALARY' }] }],
      ['an unknown category', { lines: [{ amount: '5', categoryId: '00000000-0000-4000-8000-000000000000' }] }],
    ])('rejects %s (422)', async (_name, overrides) => {
      const body = JSON.parse(JSON.stringify(expense(overrides)).replace('FOOD', food).replace('SALARY', salary));
      await put(newId(), body).expect(422);
    });

    it('links income to an Income item', async () => {
      await put(newId(), expense({ type: 'income', lines: [{ amount: '5000', budgetItemId: salary }] })).expect(201);
      expect(await balance(cash)).toBe('6000.00');
    });
  });

  describe('transfers', () => {
    const transfer = (overrides: object = {}) =>
      expense({ type: 'transfer', counterAccountId: card, counterAmount: '300', lines: [{ amount: '300' }], ...overrides });

    it('moves money between accounts', async () => {
      await put(newId(), transfer()).expect(201);
      expect(await balance(cash)).toBe('700.00');
      expect(await balance(card)).toBe('300.00');
    });

    it('keeps an exact exchange between currencies', async () => {
      await put(newId(), transfer({ counterAccountId: usd, counterAmount: '9.35', lines: [{ amount: '300' }] })).expect(201);
      expect(await balance(usd)).toBe('9.35');
    });

    it.each([
      ['no receiving account', { counterAccountId: null }, 'counterAccountId'],
      ['the same account twice', { counterAccountId: 'CASH' }, 'counterAccountId'],
      ['no amount received', { counterAmount: null }, 'counterAmount'],
      ['two lines', { lines: [{ amount: '1' }, { amount: '2' }] }, 'lines'],
      ['a budget item', { lines: [{ amount: '300', budgetItemId: 'FOOD' }] }, 'lines.0.budgetItemId'],
    ])('rejects %s (422)', async (_name, overrides, field) => {
      const body = JSON.parse(JSON.stringify(transfer(overrides)).replace('CASH', cash).replace('FOOD', food));
      const res = await put(newId(), body).expect(422);
      expect(Object.keys(res.body.errors)).toContain(field);
    });

    it('rejects transfer fields on an expense (422)', async () => {
      const res = await put(newId(), expense({ counterAccountId: card, counterAmount: '5' })).expect(422);
      expect(Object.keys(res.body.errors).sort()).toEqual(['counterAccountId', 'counterAmount']);
    });
  });

  describe('adjustments (ADR 0014)', () => {
    const adjustment = (target: string, overrides: object = {}) =>
      expense({ type: 'adjustment', occurredOn: '2026-10-07', targetBalance: target, lines: [], ...overrides });

    it('sets the balance and keeps it when an earlier record changes', async () => {
      const earlier = newId();
      await put(earlier, expense()).expect(201); // 1000 − 150
      await put(newId(), adjustment('800')).expect(201);
      expect(await balance(cash)).toBe('800.00');

      await put(earlier, expense({ lines: [{ amount: '100' }] })).expect(200);
      expect(await balance(cash)).toBe('800.00');
    });

    it.each([
      ['lines', { lines: [{ amount: '1' }] }, 'lines'],
      ['no target', { targetBalance: null }, 'targetBalance'],
      ['a fractional TWD target', { targetBalance: '10.5' }, 'targetBalance'],
    ])('rejects %s (422)', async (_name, overrides, field) => {
      const res = await put(newId(), adjustment('800', overrides)).expect(422);
      expect(Object.keys(res.body.errors)).toContain(field);
    });
  });

  describe('listing', () => {
    it('filters by date range, account, category, budget item and type, newest first', async () => {
      const a = newId();
      const b = newId();
      const c = newId();
      const d = newId();
      await put(a, expense({ occurredOn: '2026-10-01', lines: [{ amount: '1', categoryId: lunch }] })).expect(201);
      await put(b, expense({ occurredOn: '2026-10-05', occurredAt: '08:00', lines: [{ amount: '1', budgetItemId: food }] })).expect(201);
      await put(c, expense({ occurredOn: '2026-10-05', lines: [{ amount: '1' }] })).expect(201); // no time = end of day
      await put(d, expense({ type: 'transfer', occurredOn: '2026-11-01', counterAccountId: card, counterAmount: '1', lines: [{ amount: '1' }] })).expect(201);

      const ids = async (query: string) =>
        (await t.http().get(`${RECORDS}?${query}`).expect(200)).body.map((r: { id: string }) => r.id);

      expect(await ids('from=2026-10-01&to=2026-10-31')).toEqual([c, b, a]);
      expect(await ids('from=2026-10-02&to=2026-11-30')).toEqual([d, c, b]);
      expect(await ids(`from=2026-01-01&to=2026-12-31&accountId=${card}`)).toEqual([d]);
      expect(await ids(`from=2026-01-01&to=2026-12-31&categoryId=${lunch}`)).toEqual([a]);
      expect(await ids(`from=2026-01-01&to=2026-12-31&budgetItemId=${food}`)).toEqual([b]);
      expect(await ids('from=2026-01-01&to=2026-12-31&type=transfer')).toEqual([d]);
    });

    it('validates the range', async () => {
      await t.http().get(`${RECORDS}?to=2026-10-31`).expect(400);
      await t.http().get(`${RECORDS}?from=2026-10-31&to=2026-10-01`).expect(422);
      await t.http().get(`${RECORDS}?from=2026-02-30&to=2026-03-01`).expect(422);
      await t.http().get(`${RECORDS}?from=2026-10-01&to=2026-10-31&bogus=1`).expect(400);
    });
  });

  describe('batch entry', () => {
    it('saves several records together', async () => {
      const ids = [newId(), newId(), newId()];
      const res = await t.http().put(RECORDS).send({
        records: ids.map((id, i) => ({ id, ...expense({ occurredOn: `2026-10-0${i + 1}`, lines: [{ amount: '100' }] }) })),
      }).expect(200);
      expect(res.body.map((r: { id: string }) => r.id)).toEqual(ids);
      expect(await balance(cash)).toBe('700.00');
    });

    it('saves nothing if one record is invalid, and says which', async () => {
      const res = await t.http().put(RECORDS).send({
        records: [
          { id: newId(), ...expense() },
          { id: newId(), ...expense({ lines: [{ amount: '10.5' }] }) },
        ],
      }).expect(422);
      expect(Object.keys(res.body.errors)).toEqual(['records.1.lines.0.amount']);
      expect(await balance(cash)).toBe('1000.00');
    });

    it('rejects duplicate ids', async () => {
      const id = newId();
      const res = await t.http().put(RECORDS).send({ records: [{ id, ...expense() }, { id, ...expense() }] }).expect(422);
      expect(Object.keys(res.body.errors)).toEqual(['records.1.id']);
    });

    it('reports shape errors by index (400)', async () => {
      const res = await t.http().put(RECORDS).send({ records: [{ id: newId(), ...expense({ lines: [{ amount: 'x' }] }) }] }).expect(400);
      expect(Object.keys(res.body.errors)).toEqual(['records.0.lines.0.amount']);
    });
  });

  it('reports the last rate used per currency', async () => {
    await put(newId(), expense({ accountId: card, currency: 'JPY', occurredOn: '2026-10-01', lines: [{ amount: '1000', fxRate: '0.21' }] })).expect(201);
    await put(newId(), expense({ accountId: card, currency: 'JPY', occurredOn: '2026-10-03', lines: [{ amount: '1000', fxRate: '0.2083' }] })).expect(201);
    await put(newId(), expense({ accountId: usd, currency: 'USD', occurredOn: '2026-09-01', lines: [{ amount: '10', fxRate: '32' }] })).expect(201);
    const res = await t.http().get('/api/v1/finance/fx-rates/last-used').expect(200);
    expect(res.body).toEqual([
      { currency: 'JPY', rate: '0.20830000', occurredOn: '2026-10-03' },
      { currency: 'USD', rate: '32.00000000', occurredOn: '2026-09-01' },
    ]);
  });
});
