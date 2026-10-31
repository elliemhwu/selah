import { createTestApp, newId, resetDatabase, type TestApp } from '../testing/test-app';

const BASE = '/api/v1/store';

// The journal tables in the row store (ADR 0029, 0030). Timestamps are the client's own.
const T1 = '2026-10-01T08:00:00.000Z';
const T2 = '2026-10-21T15:40:00.250Z';
const SECRET = 'Dear Diary, something only I should read.';

const moment = (over: object = {}) => ({
  id: newId(),
  date: '2026-10-01',
  title: 'Moving day',
  summary: 'Boxes everywhere.',
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const journal = (over: object = {}) => ({
  id: newId(),
  momentId: null,
  writtenAt: T1,
  datePrecision: 'day',
  body: SECRET,
  createdAt: T1,
  updatedAt: T1,
  deletedAt: null,
  ...over,
});

const comment = (over: object = {}) => ({
  id: newId(),
  journalId: null,
  momentId: null,
  writtenAt: T2,
  body: 'It was all right in the end.',
  createdAt: T2,
  updatedAt: T2,
  deletedAt: null,
  ...over,
});

const godNote = (journalId: string, over: object = {}) => ({
  id: newId(),
  journalId,
  writtenAt: T2,
  body: 'Come to me, and rest.',
  verseRef: 'Matthew 11:28',
  createdAt: T2,
  updatedAt: T2,
  deletedAt: null,
  ...over,
});

const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe('store API: journal tables', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase(t.db));

  const load = async () => (await t.http().get(BASE).expect(200)).body;
  const save = (changes: object) => t.http().patch(BASE).send(changes);

  it('gives back every kind of journal row exactly as it was saved', async () => {
    const day = moment();
    const linked = journal({ momentId: day.id, body: '  Spaces and\nnew lines stay.  ' });
    const guessed = journal({ datePrecision: 'season', writtenAt: '2019-06-01T00:00:00.000Z' });
    const gone = journal({ deletedAt: T2, updatedAt: T2 });
    const changes = {
      moments: [day, moment({ summary: null })],
      journals: [linked, guessed, gone],
      comments: [comment({ journalId: linked.id }), comment({ momentId: day.id })],
      godNotes: [godNote(linked.id), godNote(guessed.id, { verseRef: null })],
    };
    await save(changes).expect(204);

    const after = await load();
    for (const table of ['moments', 'journals', 'comments', 'godNotes'] as const) {
      expect(byId(after[table])).toEqual(byId(changes[table]));
    }
  });

  it('links a journal to a moment and unlinks it', async () => {
    const day = moment();
    const entry = journal();
    await save({ moments: [day], journals: [entry] }).expect(204);

    await save({ journals: [{ ...entry, momentId: day.id, updatedAt: T2 }] }).expect(204);
    expect((await load()).journals[0].momentId).toBe(day.id);

    const T3 = '2026-10-22T07:00:00.000Z';
    await save({ journals: [{ ...entry, momentId: null, updatedAt: T3 }] }).expect(204);
    expect((await load()).journals[0]).toEqual({ ...entry, momentId: null, updatedAt: T3 });
  });

  describe('a comment replies to exactly one journal or one moment', () => {
    it.each([
      ['neither', {}],
      ['both', 'both'],
    ])('refuses a comment replying to %s (422)', async (_name, target) => {
      const day = moment();
      const entry = journal();
      const over = target === 'both' ? { journalId: entry.id, momentId: day.id } : {};
      const res = await save({ moments: [day], journals: [entry], comments: [comment(over)] }).expect(422);
      expect(res.body.detail).toContain('comments_one_target');
      // All or nothing: the journal and moment in the same save weren't kept.
      expect((await load()).journals).toEqual([]);
    });

    it('takes a comment on either', async () => {
      const day = moment();
      const entry = journal();
      await save({ moments: [day], journals: [entry], comments: [comment({ journalId: entry.id }), comment({ momentId: day.id })] }).expect(204);
      expect((await load()).comments).toHaveLength(2);
    });
  });

  it('refuses rows that point at rows that are not stored (422)', async () => {
    await save({ journals: [journal({ momentId: newId() })] }).expect(422);
    await save({ godNotes: [godNote(newId())] }).expect(422);
    await save({ comments: [comment({ journalId: newId() })] }).expect(422);
  });

  it('checks the shape of every row (400)', async () => {
    const res = await save({ journals: [journal({ datePrecision: 'week' })], moments: [moment({ date: '1 Oct' })] }).expect(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['journals.0.datePrecision', 'moments.0.date']);
    await save({ godNotes: [{ ...godNote(newId()), verseRef: 'x'.repeat(101) }] }).expect(400);
  });

  it('never sends a body back in an error', async () => {
    const refused = [
      await save({ journals: [journal({ momentId: newId() })] }).expect(422),
      await save({ journals: [journal()], comments: [comment({ body: SECRET })] }).expect(422),
      await save({ journals: [journal({ datePrecision: 'week' })] }).expect(400),
    ];
    for (const res of refused) expect(JSON.stringify(res.body)).not.toContain('only I should read');
  });

  it('empties the journal tables when restoring a backup without them', async () => {
    const entry = journal();
    await save({ journals: [entry], godNotes: [godNote(entry.id)] }).expect(204);
    await t
      .http()
      .put(BASE)
      .send({
        accounts: [],
        categories: [],
        records: [],
        planVersions: [],
        budgetTransfers: [],
        moments: [],
        journals: [],
        comments: [],
        godNotes: [],
        areas: [],
        projectGroups: [],
        projects: [],
        tasks: [],
        taskRecords: [],
        sessions: [],
        sessionItems: [],
        changeLog: [],
        settings: null,
      })
      .expect(204);
    const after = await load();
    expect(after.journals).toEqual([]);
    expect(after.godNotes).toEqual([]);
  });
});
