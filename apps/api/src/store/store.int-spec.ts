import { createTestApp, newId, resetDatabase, type TestApp } from '../testing/test-app';

const BASE = '/api/v1/store';

const NO_JOURNAL_ROWS = { moments: [], journals: [], comments: [], godNotes: [] };

// Rows as the app stores them (ADR 0029). Timestamps are the client's own.
const T1 = '2026-10-01T08:00:00.000Z';
const T2 = '2026-10-02T09:30:00.123Z';

const account = (over: object = {}) => ({
  id: newId(),
  name: 'Wallet',
  type: 'cash',
  currency: 'TWD',
  openingBalance: '1000.00',
  sortOrder: 0,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const category = (over: object = {}) => ({
  id: newId(),
  name: 'Food',
  parentId: null,
  sortOrder: 0,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const item = (over: object = {}) => ({
  budgetItemId: newId(),
  section: 'expense',
  name: 'Daily Food',
  parentItemId: null,
  cadence: 'daily',
  cadenceMonth: null,
  cadenceDate: null,
  anchor: 'amount',
  amount: '185.00',
  percent: null,
  percentBase: 'net_income',
  rollover: false,
  resetCycle: null,
  onReset: null,
  carryToItemId: null,
  overrides: [],
  ...over,
});

const version = (items: object[], over: object = {}) => ({
  id: newId(),
  effectiveFromMonth: '2026-10',
  note: null,
  items,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const line = (over: object = {}) => ({
  id: newId(),
  amount: '150.00',
  twdAmount: '150.00',
  fxRate: null,
  categoryId: null,
  budgetItemId: null,
  note: null,
  ...over,
});

const record = (accountId: string, lines: object[], over: object = {}) => ({
  id: newId(),
  type: 'expense',
  occurredOn: '2026-10-06',
  occurredAt: null,
  accountId,
  currency: 'TWD',
  counterAccountId: null,
  counterAmount: null,
  targetBalance: null,
  note: null,
  lines,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const settings = (over: object = {}) => ({
  id: 'settings',
  weekStartDay: 1,
  defaultCurrency: 'TWD',
  updatedAt: T1,
  ...over,
});

/** A snapshot with every kind of row, as the device keeps them. */
function fullSnapshot() {
  const wallet = account();
  const yen = account({ name: 'Yen', currency: 'JPY', openingBalance: '5000.00', sortOrder: 1 });
  const gone = account({ name: 'Old card', type: 'credit_card', deletedAt: T2, updatedAt: T2 });
  const food = category();
  const lunch = category({ name: 'Lunch', parentId: food.id });

  const salary = item({ section: 'income', name: 'Salary', cadence: 'monthly', amount: '60000.00' });
  const allowance = item({ name: 'Weekly Allowance', cadence: 'weekly', amount: '500.00', rollover: true, resetCycle: 'never' });
  const daily = item({
    rollover: true,
    resetCycle: 'week',
    onReset: 'carry',
    carryToItemId: allowance.budgetItemId,
    parentItemId: allowance.budgetItemId,
  });
  const giving = item({
    section: 'offering',
    name: 'Giving',
    cadence: 'monthly',
    anchor: 'percent',
    amount: null,
    percent: '10.0000',
    overrides: [],
  });
  const rent = item({
    name: 'Rent',
    cadence: 'monthly',
    amount: '15000.00',
    overrides: [
      { month: '2026-11', amount: '16000.00' },
      { month: '2026-12', amount: '0.00' },
    ],
  });
  const insurance = item({ name: 'Insurance', cadence: 'yearly', cadenceMonth: 3, amount: '12000.00' });
  const trip = item({ name: 'Trip', cadence: 'one_time', cadenceDate: '2026-12-20', amount: '30000.00' });
  const october = version([salary, daily, allowance, giving, rent, insurance, trip], { note: 'First plan' });
  const oldPlan = version([item({ name: 'Old item', budgetItemId: daily.budgetItemId })], {
    effectiveFromMonth: '2026-09',
    deletedAt: T2,
  });

  return {
    accounts: [wallet, yen, gone],
    categories: [lunch, food],
    planVersions: [october, oldPlan],
    records: [
      record(wallet.id, [
        line({ categoryId: lunch.id, budgetItemId: daily.budgetItemId, note: 'Noodles' }),
        line({ amount: '35.00', twdAmount: '35.00', budgetItemId: daily.budgetItemId }),
      ], { occurredAt: '12:30', note: 'Lunch' }),
      record(yen.id, [line({ amount: '1500.00', twdAmount: '312.00', fxRate: '0.20800000', budgetItemId: trip.budgetItemId })], {
        currency: 'JPY',
      }),
      record(wallet.id, [line({ amount: '1000.00', twdAmount: '1000.00' })], {
        type: 'transfer',
        counterAccountId: yen.id,
        counterAmount: '4800.00',
      }),
      record(wallet.id, [], { type: 'adjustment', targetBalance: '820.00', occurredOn: '2026-10-07' }),
      record(wallet.id, [line()], { deletedAt: T2, updatedAt: T2 }),
    ],
    budgetTransfers: [
      {
        id: newId(),
        kind: 'manual',
        occurredOn: '2026-09-30',
        occurredAt: '21:00',
        fromItemId: rent.budgetItemId,
        toItemId: daily.budgetItemId,
        amount: '500.00',
        note: 'Moved',
        createdAt: T1,
        updatedAt: T1,
        deletedAt: null,
      },
    ],
    // The journal tables have their own tests (journal-store.int-spec.ts).
    ...NO_JOURNAL_ROWS,
    settings: settings({ weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: T2 }),
  };
}

type Snapshot = ReturnType<typeof fullSnapshot>;

/** Tables sorted by id, since the store doesn't keep the app's row order. */
function sorted(snapshot: Omit<Snapshot, 'settings'> & { settings: unknown }) {
  const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    accounts: byId(snapshot.accounts),
    categories: byId(snapshot.categories),
    planVersions: byId(snapshot.planVersions),
    records: byId(snapshot.records),
    budgetTransfers: byId(snapshot.budgetTransfers),
    settings: snapshot.settings,
  };
}

describe('store API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  const load = async () => (await t.http().get(BASE).expect(200)).body;
  const save = (changes: object) => t.http().patch(BASE).send(changes);
  const replace = (snapshot: object) => t.http().put(BASE).send(snapshot);

  it('starts empty, with no settings', async () => {
    expect(await load()).toEqual({
      accounts: [],
      categories: [],
      records: [],
      planVersions: [],
      budgetTransfers: [],
      moments: [],
      journals: [],
      comments: [],
      godNotes: [],
      settings: null,
    });
  });

  it('gives back every kind of row exactly as it was saved', async () => {
    const snapshot = fullSnapshot();
    await save(snapshot).expect(204);
    expect(sorted(await load())).toEqual(sorted(snapshot));
  });

  it('replaces rows, keeping the client timestamps', async () => {
    const snapshot = fullSnapshot();
    await save(snapshot).expect(204);

    const [wallet] = snapshot.accounts;
    const renamed = { ...wallet, name: 'Purse', updatedAt: T2 };
    const deleted = { ...snapshot.categories[0], deletedAt: T2, updatedAt: T2 };
    await save({ accounts: [renamed], categories: [deleted] }).expect(204);

    const after = await load();
    expect(after.accounts.find((a: { id: string }) => a.id === wallet.id)).toEqual(renamed);
    expect(after.categories.find((c: { id: string }) => c.id === deleted.id)).toEqual(deleted);
  });

  it("replaces a record's lines with the ones it is sent with", async () => {
    const wallet = account();
    const kept = line({ note: 'kept' });
    const dropped = line({ note: 'dropped' });
    const lunch = record(wallet.id, [kept, dropped]);
    await save({ accounts: [wallet], records: [lunch] }).expect(204);

    const added = line({ amount: '20.00', twdAmount: '20.00', note: 'added' });
    const edited = { ...lunch, lines: [added, { ...kept, amount: '90.00', twdAmount: '90.00' }], updatedAt: T2 };
    await save({ records: [edited] }).expect(204);

    expect((await load()).records).toEqual([edited]);
  });

  it("replaces a plan version's items and overrides with the ones it is sent with", async () => {
    const food = item({ cadence: 'monthly', amount: '6000.00', overrides: [{ month: '2026-11', amount: '7000.00' }] });
    const gym = item({ name: 'Gym', cadence: 'monthly', amount: '900.00' });
    const plan = version([food, gym]);
    await save({ planVersions: [plan] }).expect(204);

    const edited = {
      ...plan,
      items: [
        item({ name: 'Books', cadence: 'monthly', amount: '500.00' }),
        { ...food, name: 'Groceries', overrides: [{ month: '2026-12', amount: '8000.00' }] },
      ],
      updatedAt: T2,
    };
    await save({ planVersions: [edited] }).expect(204);

    expect((await load()).planVersions).toEqual([edited]);
  });

  it('lets a row deleted in the same save free its name for another', async () => {
    const old = account();
    await save({ accounts: [old] }).expect(204);
    const replacement = account();
    await save({ accounts: [replacement, { ...old, deletedAt: T2 }] }).expect(204);
    expect((await load()).accounts).toHaveLength(2);
  });

  it('refuses a duplicate the database forbids (409)', async () => {
    await save({ accounts: [account()] }).expect(204);
    const res = await save({ accounts: [account()] }).expect(409);
    expect(res.body.detail).toContain('accounts_name_unique');
  });

  it('saves all or nothing: a broken reference refuses the whole save (422)', async () => {
    const wallet = account();
    const res = await save({ accounts: [wallet], records: [record(newId(), [line()])] }).expect(422);
    expect(res.body.status).toBe(422);
    expect((await load()).accounts).toEqual([]);
  });

  it('refuses a row that breaks a database check (422)', async () => {
    const wallet = account();
    // A transfer needs a counter account.
    await save({ accounts: [wallet], records: [record(wallet.id, [line()], { type: 'transfer' })] }).expect(422);
  });

  it('checks the shape of every row (400)', async () => {
    const res = await save({ accounts: [account({ openingBalance: '12.345' })] }).expect(400);
    expect(Object.keys(res.body.errors)).toEqual(['accounts.0.openingBalance']);

    const nested = await save({ records: [record(newId(), [line({ amount: 'ten' })])] }).expect(400);
    expect(Object.keys(nested.body.errors)).toEqual(['records.0.lines.0.amount']);

    await save({ accounts: [{ ...account(), balance: '0.00' }] }).expect(400);
    await save({ notATable: [] }).expect(400);
  });

  it('saves the settings as a single row', async () => {
    await save({ settings: settings() }).expect(204);
    const changed = settings({ weekStartDay: 3, updatedAt: T2 });
    await save({ settings: changed }).expect(204);
    expect((await load()).settings).toEqual(changed);
  });

  it('replaces everything when restoring a backup', async () => {
    await save(fullSnapshot()).expect(204);
    const backup = fullSnapshot();
    await replace(backup).expect(204);
    expect(sorted(await load())).toEqual(sorted(backup));

    await replace({ ...backup, records: [], budgetTransfers: [], settings: null }).expect(204);
    const after = await load();
    expect(after.records).toEqual([]);
    expect(after.settings).toBeNull();
  });

  it('takes a large backup in one request', async () => {
    const wallet = account();
    const records = Array.from({ length: 3000 }, (_, i) =>
      record(wallet.id, [line({ note: `Line ${i}` })], { occurredOn: '2026-10-06' }),
    );
    await replace({
      accounts: [wallet],
      categories: [],
      planVersions: [],
      records,
      budgetTransfers: [],
      ...NO_JOURNAL_ROWS,
      settings: null,
    }).expect(204);
    expect((await load()).records).toHaveLength(3000);
  });
});
