import { createTestApp, resetDatabase, type TestApp } from '../../testing/test-app';

const BASE = '/api/v1/core/settings';

describe('settings API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  it('returns the defaults before anything is saved', async () => {
    const res = await t.http().get(BASE).expect(200);
    expect(res.body).toEqual({ weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: null });
  });

  it('saves and then replaces the single row', async () => {
    const first = await t.http().put(BASE).send({ weekStartDay: 7, defaultCurrency: 'JPY' }).expect(200);
    expect(first.body).toMatchObject({ weekStartDay: 7, defaultCurrency: 'JPY' });
    expect(first.body.updatedAt).toEqual(expect.any(String));

    await t.http().put(BASE).send({ weekStartDay: 3, defaultCurrency: 'USD' }).expect(200);
    const res = await t.http().get(BASE).expect(200);
    expect(res.body).toMatchObject({ weekStartDay: 3, defaultCurrency: 'USD' });
    expect(await t.db.selectFrom('core.settings').select('id').execute()).toHaveLength(1);
  });

  it.each([
    ['a day out of range', { weekStartDay: 0, defaultCurrency: 'TWD' }, 'weekStartDay'],
    ['a day that is not a whole number', { weekStartDay: 1.5, defaultCurrency: 'TWD' }, 'weekStartDay'],
    ['an unsupported currency', { weekStartDay: 1, defaultCurrency: 'CHF' }, 'defaultCurrency'],
    ['a missing field', { weekStartDay: 1 }, 'defaultCurrency'],
  ])('rejects %s (400)', async (_, body, field) => {
    const res = await t.http().put(BASE).send(body).expect(400);
    expect(res.body.errors[field]).toBeDefined();
  });

  it('rejects unknown fields (400)', async () => {
    await t.http().put(BASE).send({ weekStartDay: 1, defaultCurrency: 'TWD', theme: 'dark' }).expect(400);
  });
});
