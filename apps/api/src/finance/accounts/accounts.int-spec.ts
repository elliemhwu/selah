import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const BASE = '/api/v1/finance/accounts';

const wallet = { name: 'Wallet', type: 'cash', currency: 'TWD', openingBalance: '1000' };

describe('accounts API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  async function insertRecord(fields: Record<string, unknown>, lines: { amount: string; twdAmount: string; fxRate?: string }[] = []) {
    const id = newId();
    await t.db
      .insertInto('finance.records')
      .values({ id, occurredOn: '2026-10-01', ...fields } as never)
      .execute();
    for (const line of lines) {
      await t.db.insertInto('finance.recordLines').values({ recordId: id, ...line }).execute();
    }
    return id;
  }

  it('creates with PUT (201), then replaces (200)', async () => {
    const id = newId();
    const created = await t.http().put(`${BASE}/${id}`).send(wallet).expect(201);
    expect(created.body).toMatchObject({
      id,
      name: 'Wallet',
      type: 'cash',
      currency: 'TWD',
      openingBalance: '1000.00',
      balance: '1000.00',
      sortOrder: 0,
    });

    const replaced = await t.http().put(`${BASE}/${id}`).send({ ...wallet, name: 'Pocket', sortOrder: 2 }).expect(200);
    expect(replaced.body).toMatchObject({ id, name: 'Pocket', sortOrder: 2 });
    expect(Date.parse(replaced.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.body.updatedAt));

    const list = await t.http().get(BASE).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('is idempotent: repeating the same PUT changes nothing', async () => {
    const id = newId();
    await t.http().put(`${BASE}/${id}`).send(wallet).expect(201);
    await t.http().put(`${BASE}/${id}`).send(wallet).expect(200);
    expect((await t.http().get(BASE)).body).toHaveLength(1);
  });

  it('lists in sort order, then by name', async () => {
    await t.http().put(`${BASE}/${newId()}`).send({ ...wallet, name: 'B', sortOrder: 1 });
    await t.http().put(`${BASE}/${newId()}`).send({ ...wallet, name: 'C', sortOrder: 0 });
    await t.http().put(`${BASE}/${newId()}`).send({ ...wallet, name: 'A', sortOrder: 1 });
    const list = await t.http().get(BASE).expect(200);
    expect(list.body.map((a: { name: string }) => a.name)).toEqual(['C', 'A', 'B']);
  });

  it('rejects an invalid shape with Problem Details (400)', async () => {
    const res = await t
      .http()
      .put(`${BASE}/${newId()}`)
      .send({ name: ' ', type: 'piggy', currency: 'CNY', openingBalance: '1.234', extra: 1 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(res.body).toMatchObject({ type: 'about:blank', title: 'Bad Request', status: 400 });
    expect(Object.keys(res.body.errors).sort()).toEqual(['currency', 'extra', 'name', 'openingBalance', 'type']);
  });

  it('rejects a non-UUID id (400)', async () => {
    const res = await t.http().get(`${BASE}/not-a-uuid`).expect(400);
    expect(res.body.errors).toEqual({ id: ['id must be a UUID'] });
  });

  it('rejects fractional TWD (422)', async () => {
    const res = await t
      .http()
      .put(`${BASE}/${newId()}`)
      .send({ ...wallet, openingBalance: '10.50' })
      .expect(422);
    expect(res.body.errors.openingBalance).toBeDefined();
  });

  it('accepts cents for USD', async () => {
    await t
      .http()
      .put(`${BASE}/${newId()}`)
      .send({ ...wallet, currency: 'USD', openingBalance: '10.50' })
      .expect(201);
  });

  it('rejects a duplicate name (409)', async () => {
    await t.http().put(`${BASE}/${newId()}`).send(wallet).expect(201);
    const res = await t.http().put(`${BASE}/${newId()}`).send(wallet).expect(409);
    expect(res.body.detail).toContain('Wallet');
  });

  it('returns 404 for an unknown account', async () => {
    await t.http().get(`${BASE}/${newId()}`).expect(404);
    await t.http().delete(`${BASE}/${newId()}`).expect(404);
  });

  it('soft-deletes, idempotently, and refuses to bring the id back', async () => {
    const id = newId();
    await t.http().put(`${BASE}/${id}`).send(wallet).expect(201);
    await t.http().delete(`${BASE}/${id}`).expect(204);
    await t.http().delete(`${BASE}/${id}`).expect(204);
    await t.http().get(`${BASE}/${id}`).expect(404);
    expect((await t.http().get(BASE)).body).toEqual([]);
    await t.http().put(`${BASE}/${id}`).send(wallet).expect(409);

    const row = await t.db.selectFrom('finance.accounts').select('deletedAt').where('id', '=', id).executeTakeFirst();
    expect(row?.deletedAt).toBeInstanceOf(Date);

    // The name is free again.
    await t.http().put(`${BASE}/${newId()}`).send(wallet).expect(201);
  });

  it('derives balances from records', async () => {
    const cash = newId();
    const card = newId();
    await t.http().put(`${BASE}/${cash}`).send(wallet).expect(201);
    await t.http().put(`${BASE}/${card}`).send({ ...wallet, name: 'Card', type: 'credit_card', openingBalance: '0' });

    await insertRecord({ type: 'expense', accountId: cash }, [{ amount: '150', twdAmount: '150' }]);
    await insertRecord({ type: 'income', accountId: cash }, [{ amount: '500', twdAmount: '500' }]);
    await insertRecord({ type: 'expense', accountId: card, currency: 'JPY' }, [{ amount: '1200', twdAmount: '250', fxRate: '0.2083' }]);
    await insertRecord(
      { type: 'transfer', accountId: cash, counterAccountId: card, counterAmount: '300' },
      [{ amount: '300', twdAmount: '300' }],
    );
    const deleted = await insertRecord({ type: 'expense', accountId: cash }, [{ amount: '999', twdAmount: '999' }]);
    await t.db.updateTable('finance.records').set({ deletedAt: new Date() }).where('id', '=', deleted).execute();

    const byName = Object.fromEntries(
      (await t.http().get(BASE).expect(200)).body.map((a: { name: string; balance: string }) => [a.name, a.balance]),
    );
    expect(byName).toEqual({ Wallet: '1050.00', Card: '50.00' });
    expect((await t.http().get(`${BASE}/${card}`)).body.balance).toBe('50.00');
  });

  it('locks the currency and refuses deletion once there are records', async () => {
    const id = newId();
    await t.http().put(`${BASE}/${id}`).send(wallet).expect(201);
    await insertRecord({ type: 'expense', accountId: id }, [{ amount: '1', twdAmount: '1' }]);

    const currency = await t.http().put(`${BASE}/${id}`).send({ ...wallet, currency: 'USD' }).expect(422);
    expect(currency.body.errors.currency).toBeDefined();
    await t.http().put(`${BASE}/${id}`).send({ ...wallet, name: 'Renamed' }).expect(200);
    await t.http().delete(`${BASE}/${id}`).expect(409);
  });
});
