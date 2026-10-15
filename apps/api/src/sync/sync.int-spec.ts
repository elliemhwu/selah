import { sql } from 'kysely';
import { createTestApp, newId, resetDatabase, type TestApp } from '../testing/test-app';

const CHANGES = '/api/v1/sync/changes';
const FINANCE = '/api/v1/finance';

describe('sync API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  const put = (path: string, body: object) => t.http().put(`${FINANCE}/${path}`).send(body);

  /** Moves every row's `updated_at` back by `hours`, past any cursor overlap. */
  async function age(hours: number): Promise<void> {
    await t.db.transaction().execute(async (trx) => {
      // The updated_at triggers would set the time back to now.
      await sql`set local session_replication_role = replica`.execute(trx);
      for (const table of ['finance.accounts', 'finance.categories', 'finance.records', 'finance.budget_plan_versions', 'finance.budget_transfers', 'core.settings']) {
        await sql.raw(`update ${table} set updated_at = updated_at - interval '${hours} hours'`).execute(trx);
      }
    });
  }

  /** An account, a category, a plan with one item, and an expense on it. */
  async function seed() {
    const ids = { account: newId(), category: newId(), version: newId(), item: newId(), record: newId(), line: newId() };
    await put(`accounts/${ids.account}`, { name: 'Wallet', type: 'cash', currency: 'TWD', openingBalance: '1000.00' }).expect(201);
    await put(`categories/${ids.category}`, { name: 'Food' }).expect(201);
    await put(`plan-versions/${ids.version}`, {
      effectiveFromMonth: '2026-10',
      items: [{ budgetItemId: ids.item, section: 'expense', name: 'Food', cadence: 'monthly', anchor: 'amount', amount: '6000', percentBase: 'net_income', rollover: false }],
    }).expect(201);
    await put(`records/${ids.record}`, {
      type: 'expense',
      occurredOn: '2026-10-05',
      accountId: ids.account,
      currency: 'TWD',
      lines: [{ id: ids.line, amount: '120', categoryId: ids.category, budgetItemId: ids.item }],
    }).expect(201);
    return ids;
  }

  it('returns everything, in the shapes the device stores, without a cursor', async () => {
    const ids = await seed();
    const res = await t.http().get(CHANGES).expect(200);

    expect(Date.parse(res.body.cursor)).not.toBeNaN();
    expect(res.body.accounts).toEqual([
      expect.objectContaining({ id: ids.account, name: 'Wallet', openingBalance: '1000.00', deletedAt: null }),
    ]);
    expect(res.body.accounts[0].balance).toBeUndefined();
    expect(res.body.categories).toEqual([expect.objectContaining({ id: ids.category, parentId: null, deletedAt: null })]);
    expect(res.body.planVersions).toEqual([
      expect.objectContaining({ id: ids.version, effectiveFromMonth: '2026-10', deletedAt: null }),
    ]);
    expect(res.body.planVersions[0].editable).toBeUndefined();
    expect(res.body.planVersions[0].items).toEqual([expect.objectContaining({ budgetItemId: ids.item, amount: '6000.00' })]);
    expect(res.body.records).toEqual([
      expect.objectContaining({
        id: ids.record,
        deletedAt: null,
        lines: [expect.objectContaining({ id: ids.line, amount: '120.00', twdAmount: '120.00', fxRate: null })],
      }),
    ]);
    expect(res.body.budgetTransfers).toEqual([]);
    expect(res.body.settings).toBeNull();
  });

  it('returns only what changed after the cursor, deletions included', async () => {
    const ids = await seed();
    await age(2);
    const { cursor } = (await t.http().get(CHANGES).expect(200)).body;
    await age(2);

    await put(`categories/${ids.category}`, { name: 'Groceries' }).expect(200);
    await t.http().delete(`${FINANCE}/records/${ids.record}`).expect(204);
    await t.http().put('/api/v1/core/settings').send({ weekStartDay: 7, defaultCurrency: 'JPY' }).expect(200);

    const res = await t.http().get(CHANGES).query({ since: cursor }).expect(200);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.planVersions).toEqual([]);
    expect(res.body.categories).toEqual([expect.objectContaining({ id: ids.category, name: 'Groceries' })]);
    expect(res.body.records).toEqual([expect.objectContaining({ id: ids.record, lines: [] })]);
    expect(Date.parse(res.body.records[0].deletedAt)).not.toBeNaN();
    expect(res.body.settings).toMatchObject({ weekStartDay: 7, defaultCurrency: 'JPY' });
    expect(res.body.cursor > cursor).toBe(true);
  });

  it('reads a minute further back than the cursor, so a row may come twice', async () => {
    const ids = await seed();
    const { cursor } = (await t.http().get(CHANGES).expect(200)).body;
    const res = await t.http().get(CHANGES).query({ since: cursor }).expect(200);
    expect(res.body.accounts.map((a: { id: string }) => a.id)).toEqual([ids.account]);
  });

  it('sends a whole plan version again when only an item changed', async () => {
    const ids = await seed();
    await age(2);
    const { cursor } = (await t.http().get(CHANGES).expect(200)).body;
    await age(2);
    await put(`plan-versions/${ids.version}`, {
      effectiveFromMonth: '2026-10',
      items: [{ budgetItemId: ids.item, section: 'expense', name: 'Food', cadence: 'monthly', anchor: 'amount', amount: '7000', percentBase: 'net_income', rollover: false }],
    }).expect(200);

    const res = await t.http().get(CHANGES).query({ since: cursor }).expect(200);
    expect(res.body.planVersions).toHaveLength(1);
    expect(res.body.planVersions[0].items[0].amount).toBe('7000.00');
  });

  it('refuses a cursor that is not a timestamp (400)', async () => {
    const res = await t.http().get(CHANGES).query({ since: 'yesterday' }).expect(400);
    expect(res.body.errors.since).toBeDefined();
  });
});

describe('access token and CORS', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ accessToken: 'secret-token', corsOrigins: ['https://elliemhwu.github.io'] });
  });
  afterAll(() => t.close());

  it('refuses requests without the token (401 Problem Details)', async () => {
    const res = await t.http().get(CHANGES).expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    await t.http().get(CHANGES).set('Authorization', 'Bearer wrong').expect(401);
  });

  it('accepts the token', async () => {
    await t.http().get(`${FINANCE}/accounts`).set('Authorization', 'Bearer secret-token').expect(200);
  });

  it('leaves the health check open', async () => {
    const res = await t.http().get('/api/v1/health');
    expect(res.status).not.toBe(401);
  });

  it('answers a preflight from the hosted app', async () => {
    const res = await t
      .http()
      .options(CHANGES)
      .set('Origin', 'https://elliemhwu.github.io')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('https://elliemhwu.github.io');
  });

  it('does not allow other origins', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', 'https://example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
