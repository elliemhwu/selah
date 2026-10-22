import { ConflictError, NotFoundError, RuleViolationError } from '@selah/shared-utils';
import { deleteJournal, deleteMoment, prepareComment, prepareGodNote, prepareJournal, prepareMoment } from './rules';
import { comment, data, godNote, journal, moment } from './testing';

const NOW = '2026-10-21T13:05:00.000Z';
const DELETED = { deletedAt: '2026-10-02T00:00:00.000Z' };

function fieldErrors(run: () => unknown): Record<string, string[]> {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolationError) return error.errors ?? {};
    throw error;
  }
  throw new Error('expected a RuleViolationError');
}

describe('prepareJournal', () => {
  it('keeps the body exactly as written, defaulting to day precision', () => {
    const body = '  Dear Diary,\n\ntonight I…  ';
    expect(prepareJournal('j1', { writtenAt: NOW, body }, data())).toEqual({ writtenAt: NOW, datePrecision: 'day', body, momentId: null });
  });

  it('refuses a new entry with nothing written, but lets an entry be emptied while editing', () => {
    expect(fieldErrors(() => prepareJournal('j1', { writtenAt: NOW, body: '  \n' }, data()))).toEqual({ body: ['Write something first.'] });
    expect(prepareJournal('j1', { writtenAt: NOW, body: '' }, data({ journals: [journal('j1')] })).body).toBe('');
  });

  it('links to a live moment, and unlinks', () => {
    const rows = data({ moments: [moment('m1'), moment('gone', DELETED)], journals: [journal('j1', { momentId: 'm1' })] });
    expect(prepareJournal('j1', { writtenAt: NOW, body: 'x', momentId: 'm1' }, rows).momentId).toBe('m1');
    expect(prepareJournal('j1', { writtenAt: NOW, body: 'x', momentId: null }, rows).momentId).toBeNull();
    expect(fieldErrors(() => prepareJournal('j1', { writtenAt: NOW, body: 'x', momentId: 'gone' }, rows))).toEqual({
      momentId: ["That moment doesn't exist."],
    });
  });

  it('checks the time and the precision', () => {
    const errors = fieldErrors(() => prepareJournal('j1', { writtenAt: 'tonight', datePrecision: 'week' as never, body: 'x' }, data()));
    expect(Object.keys(errors)).toEqual(['writtenAt', 'datePrecision']);
  });

  it('refuses to bring back a deleted entry', () => {
    expect(() => prepareJournal('j1', { writtenAt: NOW, body: 'x' }, data({ journals: [journal('j1', DELETED)] }))).toThrow(ConflictError);
  });

  it('never puts the body in a message', () => {
    try {
      prepareJournal('j1', { writtenAt: 'bad', body: 'my secret', momentId: 'missing' }, data());
    } catch (error) {
      expect(JSON.stringify({ message: (error as Error).message, errors: (error as RuleViolationError).errors })).not.toContain('my secret');
    }
  });
});

describe('prepareMoment', () => {
  it('trims the title and summary, and stores an empty summary as null', () => {
    expect(prepareMoment('m1', { date: '2026-10-20', title: '  Moving day ', summary: '  ' }, data())).toEqual({
      date: '2026-10-20',
      title: 'Moving day',
      summary: null,
    });
  });

  it('needs a real date and a title', () => {
    expect(fieldErrors(() => prepareMoment('m1', { date: '2026-02-30', title: ' ' }, data()))).toEqual({
      date: ['Enter a date.'],
      title: ['Give the moment a title.'],
    });
  });
});

describe('prepareComment', () => {
  const rows = data({ journals: [journal('j1'), journal('old', DELETED)], moments: [moment('m1')] });

  it('replies to a journal or to a moment', () => {
    expect(prepareComment('c1', { journalId: 'j1', writtenAt: NOW, body: ' Not so bad. ' }, rows)).toEqual({
      journalId: 'j1',
      momentId: null,
      writtenAt: NOW,
      body: 'Not so bad.',
    });
    expect(prepareComment('c2', { momentId: 'm1', writtenAt: NOW, body: 'What a day.' }, rows).momentId).toBe('m1');
  });

  it.each([
    ['neither', {}],
    ['both', { journalId: 'j1', momentId: 'm1' }],
  ])('refuses a comment replying to %s', (_name, target) => {
    expect(fieldErrors(() => prepareComment('c1', { ...target, writtenAt: NOW, body: 'x' }, rows))).toEqual({
      journalId: ['A comment replies to one journal or one moment.'],
    });
  });

  it('refuses a deleted target, a move to another one, and an empty body', () => {
    expect(fieldErrors(() => prepareComment('c1', { journalId: 'old', writtenAt: NOW, body: 'x' }, rows))).toHaveProperty('journalId');
    const moved = data({ ...rows, comments: [comment('c1', { journalId: 'j1' })] });
    expect(fieldErrors(() => prepareComment('c1', { momentId: 'm1', writtenAt: NOW, body: 'x' }, moved))).toEqual({
      journalId: ['A comment stays with what it replied to.'],
    });
    expect(fieldErrors(() => prepareComment('c2', { journalId: 'j1', writtenAt: NOW, body: ' ' }, rows))).toEqual({
      body: ['Write something first.'],
    });
  });
});

describe('prepareGodNote', () => {
  it('belongs to a live journal, with an optional verse', () => {
    const rows = data({ journals: [journal('j1')] });
    expect(prepareGodNote('g1', { journalId: 'j1', writtenAt: NOW, body: 'Rest.', verseRef: ' Matthew 11:28 ' }, rows)).toEqual({
      journalId: 'j1',
      writtenAt: NOW,
      body: 'Rest.',
      verseRef: 'Matthew 11:28',
    });
    expect(prepareGodNote('g1', { journalId: 'j1', writtenAt: NOW, body: 'Rest.', verseRef: '' }, rows).verseRef).toBeNull();
    expect(fieldErrors(() => prepareGodNote('g1', { journalId: 'nope', writtenAt: NOW, body: 'Rest.' }, rows))).toEqual({
      journalId: ["That entry doesn't exist."],
    });
  });
});

describe('deleting', () => {
  it("deletes a journal's comments and god notes with it", () => {
    const rows = data({
      journals: [journal('j1'), journal('j2')],
      comments: [comment('c1', { journalId: 'j1' }), comment('c2', { journalId: 'j2' }), comment('c3', { journalId: 'j1', ...DELETED })],
      godNotes: [godNote('g1', { journalId: 'j1' })],
    });
    const changes = deleteJournal('j1', rows, NOW);
    expect(changes.journals?.map((j) => [j.id, j.deletedAt])).toEqual([['j1', NOW]]);
    expect(changes.comments?.map((c) => [c.id, c.deletedAt])).toEqual([['c1', NOW]]);
    expect(changes.godNotes?.map((n) => [n.id, n.deletedAt])).toEqual([['g1', NOW]]);
    expect(deleteJournal('j1', data({ journals: [journal('j1', DELETED)] }), NOW)).toEqual({});
    expect(() => deleteJournal('nope', rows, NOW)).toThrow(NotFoundError);
  });

  it("unlinks a moment's journals, which stay, and deletes its comments", () => {
    const rows = data({
      moments: [moment('m1')],
      journals: [journal('j1', { momentId: 'm1' }), journal('j2')],
      comments: [comment('c1', { momentId: 'm1' }), comment('c2', { journalId: 'j1' })],
    });
    const changes = deleteMoment('m1', rows, NOW);
    expect(changes.moments?.[0].deletedAt).toBe(NOW);
    expect(changes.journals).toEqual([{ ...rows.journals[0], momentId: null, updatedAt: NOW }]);
    expect(changes.comments?.map((c) => c.id)).toEqual(['c1']);
  });
});
