import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const REPORTS = '/api/v1/finance/reports';

// 2026-10-01 is a Thursday. With no settings row, weeks start on Monday.
describe('reports API', () => {
  let t: TestApp;
  let ids: Record<'salary' | 'bonus' | 'tax' | 'food' | 'daily' | 'allowance' | 'rent' | 'trip', string>;
  let cash: string;

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
    await t.http().put(`/api/v1/finance/plan-versions/${newId()}`).send({
      effectiveFromMonth: '2026-10',
      items: [
        { budgetItemId: ids.salary, section: 'income', name: 'Salary', cadence: 'monthly', anchor: 'amount', amount: '60000' },
        { budgetItemId: ids.bonus, section: 'income', name: 'Bonus', cadence: 'yearly', cadenceMonth: 1, anchor: 'amount', amount: '80000' },
        { budgetItemId: ids.tax, section: 'government', name: 'Tax', cadence: 'monthly', anchor: 'percent', percent: '5', percentBase: 'gross_income' },
        { budgetItemId: ids.food, section: 'expense', name: 'Food', cadence: 'monthly', anchor: 'percent', percent: '12.5' },
        {
          budgetItemId: ids.daily, section: 'expense', name: 'Daily Food', parentItemId: ids.food, cadence: 'daily', anchor: 'amount', amount: '185',
          rollover: true, resetCycle: 'week', onReset: 'carry', carryToItemId: ids.allowance,
        },
        { budgetItemId: ids.allowance, section: 'expense', name: 'Weekly Allowance', cadence: 'weekly', anchor: 'amount', amount: '500', rollover: true, resetCycle: 'never' },
        { budgetItemId: ids.rent, section: 'expense', name: 'Rent', cadence: 'monthly', anchor: 'amount', amount: '15000', overrides: [{ month: '2026-12', amount: '16200' }] },
        { budgetItemId: ids.trip, section: 'saving', name: 'Japan trip', cadence: 'one_time', cadenceDate: '2026-12-20', anchor: 'amount', amount: '30000' },
      ],
    }).expect(201);

    cash = newId();
    await t.http().put(`/api/v1/finance/accounts/${cash}`).send({ name: 'Cash', type: 'cash', currency: 'TWD', openingBalance: '0' }).expect(201);
    await record('income', '2026-10-05', '60000', ids.salary);
    await record('expense', '2026-10-01', '15000', ids.rent);
    await record('expense', '2026-10-05', '150', ids.daily);
    await record('expense', '2026-10-06', '99', null);
    await record('expense', '2026-10-12', '200', ids.allowance);
  });

  async function record(type: string, occurredOn: string, amount: string, budgetItemId: string | null) {
    await t.http().put(`/api/v1/finance/records/${newId()}`).send({
      type, occurredOn, accountId: cash, currency: 'TWD', lines: [{ amount, budgetItemId }],
    }).expect(201);
  }

  const get = async (path: string) => (await t.http().get(`${REPORTS}/${path}`).expect(200)).body;
  const byItem = <T extends { budgetItemId: string }>(rows: T[], id: string) => rows.find((r) => r.budgetItemId === id);

  describe('envelopes', () => {
    it('shows what is left in each rollover budget', async () => {
      const envelopes = await get('envelopes?date=2026-10-13');
      expect(envelopes.map((e: { name: string }) => e.name)).toEqual(['Daily Food', 'Weekly Allowance']);
      expect(byItem(envelopes, ids.daily)).toEqual({
        budgetItemId: ids.daily,
        name: 'Daily Food',
        section: 'expense',
        parentItemId: ids.food,
        cadence: 'daily',
        resetCycle: 'week',
        onReset: 'carry',
        carryToItemId: ids.allowance,
        envelopeStart: '2026-10-01',
        resetsOn: '2026-10-18',
        period: { start: '2026-10-13', end: '2026-10-13' },
        allotment: '185.00',
        carryIn: '185.00', // Monday's leftover; last week's reset went to the allowance
        transfers: '0.00',
        spent: '0.00',
        available: '370.00',
      });
      // Allotments of 500 for three weeks + resets of 740 (4 × 185) and 1145 (7 × 185 − 150) − 200.
      expect(byItem(envelopes, ids.allowance)).toMatchObject({
        period: { start: '2026-10-12', end: '2026-10-18' },
        resetsOn: null,
        carryIn: '2885.00',
        spent: '200.00',
        available: '3185.00',
      });
    });

    it('keeps the leftover available on the reset day itself', async () => {
      const envelopes = await get('envelopes?date=2026-10-11');
      expect(byItem(envelopes, ids.daily)).toMatchObject({ resetsOn: '2026-10-11', available: '1145.00' });
    });

    it('follows edits to past records and manual transfers', async () => {
      await t.http().put(`/api/v1/finance/budget-transfers/${newId()}`).send({
        occurredOn: '2026-10-08', fromItemId: ids.rent, toItemId: ids.allowance, amount: '300',
      }).expect(201);
      await record('expense', '2026-10-06', '45', ids.daily);
      const envelopes = await get('envelopes?date=2026-10-13');
      expect(byItem(envelopes, ids.allowance)).toMatchObject({ available: '3440.00' }); // 3185 + 300 − 45
    });

    it('uses the week start setting', async () => {
      await t.db.insertInto('core.settings').values({ weekStartDay: 7 }).execute();
      const envelopes = await get('envelopes?date=2026-10-13');
      expect(byItem(envelopes, ids.daily)).toMatchObject({ resetsOn: '2026-10-17' });
      expect(byItem(envelopes, ids.allowance)).toMatchObject({ period: { start: '2026-10-11', end: '2026-10-17' } });
    });

    it('needs a plan and a real date', async () => {
      await t.http().get(`${REPORTS}/envelopes?date=2026-09-30`).expect(404);
      await t.http().get(`${REPORTS}/envelopes?date=2026-02-30`).expect(422);
      await t.http().get(`${REPORTS}/envelopes?date=today`).expect(400);
    });
  });

  describe('checklist', () => {
    it("lists this period's items that aren't envelopes, recorded or not", async () => {
      const checklist = await get('checklist?date=2026-10-13');
      expect(checklist.map((c: { name: string }) => c.name)).toEqual(['Salary', 'Tax', 'Food', 'Rent']);
      expect(byItem(checklist, ids.salary)).toEqual({
        budgetItemId: ids.salary,
        name: 'Salary',
        section: 'income',
        parentItemId: null,
        cadence: 'monthly',
        period: { start: '2026-10-01', end: '2026-10-31' },
        planned: '60000.00',
        recorded: '60000.00',
        lineCount: 1,
        done: true,
      });
      expect(byItem(checklist, ids.tax)).toMatchObject({ planned: '3000.00', recorded: '0.00', done: false });
      // A parent counts its children's lines.
      expect(byItem(checklist, ids.food)).toMatchObject({ planned: '7125.00', recorded: '150.00', done: true });
    });

    it('includes one-time and yearly items in their month, with overrides', async () => {
      const checklist = await get('checklist?date=2026-12-05');
      expect(byItem(checklist, ids.trip)).toMatchObject({ planned: '30000.00', period: { start: '2026-12-01', end: '2026-12-31' } });
      expect(byItem(checklist, ids.rent)).toMatchObject({ planned: '16200.00', done: false });
      expect(byItem(checklist, ids.bonus)).toBeUndefined();
      expect(byItem(await get('checklist?date=2027-01-15'), ids.bonus)).toMatchObject({ planned: '80000.00' });
    });
  });

  describe('monthly review', () => {
    it('compares plan and actual per item and section', async () => {
      const review = await get('monthly?month=2026-10');
      expect(review.month).toBe('2026-10');
      expect(review.bases).toEqual({ grossIncome: '60000.00', government: '3000.00', netIncome: '57000.00' });
      expect(review.unplanned).toEqual({ income: '0.00', expense: '99.00' });

      // Daily Food: 31 × 185 planned; resets of 740, 1145, 1295 and 1295 leave it in October.
      expect(byItem(review.items, ids.daily)).toMatchObject({
        planned: '5735.00', transfers: '-4475.00', actual: '150.00', remaining: '1110.00', year: null,
      });
      // Food is 12.5% of net income and includes Daily Food.
      expect(byItem(review.items, ids.food)).toMatchObject({
        planned: '7125.00', transfers: '-4475.00', actual: '150.00', remaining: '2500.00',
      });
      // 500 × 52 / 12, rounded.
      expect(byItem(review.items, ids.allowance)).toMatchObject({
        planned: '2167.00', transfers: '4475.00', actual: '200.00', remaining: '6442.00',
      });
      expect(byItem(review.items, ids.trip)).toMatchObject({ planned: '0.00', year: { planned: '30000.00', actual: '0.00' } });
      expect(byItem(review.items, ids.bonus)).toMatchObject({ year: { planned: '0.00', actual: '0.00' } });

      expect(review.sections).toEqual([
        { section: 'income', planned: '60000.00', transfers: '0.00', actual: '60000.00', remaining: '0.00' },
        { section: 'government', planned: '3000.00', transfers: '0.00', actual: '0.00', remaining: '3000.00' },
        { section: 'offering', planned: '0.00', transfers: '0.00', actual: '0.00', remaining: '0.00' },
        { section: 'saving', planned: '0.00', transfers: '0.00', actual: '0.00', remaining: '0.00' },
        { section: 'expense', planned: '24292.00', transfers: '0.00', actual: '15350.00', remaining: '8942.00' },
      ]);
    });

    it('applies overrides and percentages of a bonus month', async () => {
      expect(byItem((await get('monthly?month=2026-12')).items, ids.rent)).toMatchObject({ planned: '16200.00' });
      const january = await get('monthly?month=2027-01');
      expect(january.bases).toEqual({ grossIncome: '140000.00', government: '7000.00', netIncome: '133000.00' });
      expect(byItem(january.items, ids.food)).toMatchObject({ planned: '16625.00' });
      expect(byItem(january.items, ids.bonus)).toMatchObject({ planned: '80000.00', year: { planned: '80000.00' } });
    });

    it('needs a plan for the month', async () => {
      await t.http().get(`${REPORTS}/monthly?month=2026-09`).expect(404);
      await t.http().get(`${REPORTS}/monthly?month=2026-13`).expect(400);
    });
  });

  describe('budget transfers with resets', () => {
    it('merges manual transfers and computed resets in date order', async () => {
      const manual = newId();
      await t.http().put(`/api/v1/finance/budget-transfers/${manual}`).send({
        occurredOn: '2026-10-11', fromItemId: ids.rent, toItemId: ids.allowance, amount: '300', note: 'spare',
      }).expect(201);
      const movements = await get('budget-transfers?from=2026-10-01&to=2026-10-12');
      expect(movements).toEqual([
        { kind: 'reset', id: null, occurredOn: '2026-10-04', occurredAt: null, fromItemId: ids.daily, toItemId: ids.allowance, amount: '740.00', note: null },
        { kind: 'manual', id: manual, occurredOn: '2026-10-11', occurredAt: null, fromItemId: ids.rent, toItemId: ids.allowance, amount: '300.00', note: 'spare' },
        { kind: 'reset', id: null, occurredOn: '2026-10-11', occurredAt: null, fromItemId: ids.daily, toItemId: ids.allowance, amount: '1145.00', note: null },
      ]);
      const forRent = await get(`budget-transfers?from=2026-10-01&to=2026-10-31&budgetItemId=${ids.rent}`);
      expect(forRent.map((m: { kind: string }) => m.kind)).toEqual(['manual']);
      await t.http().get(`${REPORTS}/budget-transfers?from=2026-10-12&to=2026-10-01`).expect(422);
    });
  });
});
