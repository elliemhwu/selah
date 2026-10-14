import { createTestApp, newId, resetDatabase, type TestApp } from '../../testing/test-app';

const BASE = '/api/v1/finance/categories';

describe('categories API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  const put = (id: string, body: object) => t.http().put(`${BASE}/${id}`).send(body);

  it('creates a tree and lists it flat', async () => {
    const food = newId();
    const lunch = newId();
    await put(food, { name: 'Food' }).expect(201);
    const res = await put(lunch, { name: 'Lunch', parentId: food }).expect(201);
    expect(res.body).toMatchObject({ id: lunch, name: 'Lunch', parentId: food });

    const list = await t.http().get(BASE).expect(200);
    expect(list.body.map((c: { name: string }) => c.name).sort()).toEqual(['Food', 'Lunch']);
  });

  it('allows the same name under different parents, but not twice at one level', async () => {
    const food = newId();
    const travel = newId();
    await put(food, { name: 'Food' }).expect(201);
    await put(travel, { name: 'Travel' }).expect(201);
    await put(newId(), { name: 'Other', parentId: food }).expect(201);
    await put(newId(), { name: 'Other', parentId: travel }).expect(201);
    await put(newId(), { name: 'Other', parentId: food }).expect(409);
    await put(newId(), { name: 'Food' }).expect(409);
  });

  it('rejects a missing or deleted parent (422)', async () => {
    const res = await put(newId(), { name: 'Lunch', parentId: newId() }).expect(422);
    expect(res.body.errors.parentId).toBeDefined();

    const gone = newId();
    await put(gone, { name: 'Gone' }).expect(201);
    await t.http().delete(`${BASE}/${gone}`).expect(204);
    await put(newId(), { name: 'Lunch', parentId: gone }).expect(422);
  });

  it('refuses to create a loop in the tree (422)', async () => {
    const a = newId();
    const b = newId();
    const c = newId();
    await put(a, { name: 'A' }).expect(201);
    await put(b, { name: 'B', parentId: a }).expect(201);
    await put(c, { name: 'C', parentId: b }).expect(201);

    await put(a, { name: 'A', parentId: c }).expect(422);
    await put(a, { name: 'A', parentId: a }).expect(422);
    // Moving a leaf elsewhere is fine.
    await put(c, { name: 'C', parentId: a }).expect(200);
  });

  it('can move a category back to the top level', async () => {
    const food = newId();
    const lunch = newId();
    await put(food, { name: 'Food' }).expect(201);
    await put(lunch, { name: 'Lunch', parentId: food }).expect(201);
    const res = await put(lunch, { name: 'Lunch', parentId: null }).expect(200);
    expect(res.body.parentId).toBeNull();
  });

  it('refuses to delete a category with live subcategories (409)', async () => {
    const food = newId();
    const lunch = newId();
    await put(food, { name: 'Food' }).expect(201);
    await put(lunch, { name: 'Lunch', parentId: food }).expect(201);
    await t.http().delete(`${BASE}/${food}`).expect(409);
    await t.http().delete(`${BASE}/${lunch}`).expect(204);
    await t.http().delete(`${BASE}/${food}`).expect(204);
    expect((await t.http().get(BASE)).body).toEqual([]);
  });

  it('validates parentId as a UUID (400)', async () => {
    const res = await put(newId(), { name: 'X', parentId: 'nope' }).expect(400);
    expect(res.body.errors.parentId).toBeDefined();
  });
});
