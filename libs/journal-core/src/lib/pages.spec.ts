import { NotFoundError } from '@selah/shared-utils';
import { diaryPage, journalList, momentList, momentPage } from './pages';
import { comment, data, godNote, journal, moment } from './testing';

const DELETED = { deletedAt: '2026-10-02T00:00:00.000Z' };

describe('diaryPage', () => {
  it('gathers the journal, its moment first, then replies by when they were written', () => {
    const rows = data({
      moments: [moment('m1')],
      journals: [journal('j1', { momentId: 'm1' }), journal('j2')],
      comments: [
        comment('late', { journalId: 'j1', writtenAt: '2026-10-20T00:00:00.000Z' }),
        comment('other', { journalId: 'j2' }),
        comment('gone', { journalId: 'j1', ...DELETED }),
        comment('on-moment', { momentId: 'm1' }),
      ],
      godNotes: [godNote('early', { journalId: 'j1', writtenAt: '2026-10-05T00:00:00.000Z' })],
    });
    const page = diaryPage('j1', rows);
    expect(page.journal.id).toBe('j1');
    expect(page.moment?.id).toBe('m1');
    expect(page.memos.map((m) => [m.kind, m.id])).toEqual([
      ['moment', 'm1'],
      ['godNote', 'early'],
      ['comment', 'late'],
    ]);
  });

  it('leaves out a deleted moment, and refuses an unknown or deleted journal', () => {
    const rows = data({ moments: [moment('m1', DELETED)], journals: [journal('j1', { momentId: 'm1' }), journal('j2', DELETED)] });
    expect(diaryPage('j1', rows)).toMatchObject({ moment: null, memos: [] });
    expect(() => diaryPage('j2', rows)).toThrow(NotFoundError);
    expect(() => diaryPage('nope', rows)).toThrow(NotFoundError);
  });

  it('orders replies written at the same time by id, so they never swap', () => {
    const rows = data({ journals: [journal('j1')], comments: [comment('b', { journalId: 'j1' }), comment('a', { journalId: 'j1' })] });
    expect(diaryPage('j1', rows).memos.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('lists', () => {
  it('lists live journals newest first', () => {
    const rows = data({
      journals: [
        journal('old', { writtenAt: '2026-09-01T00:00:00.000Z' }),
        journal('new', { writtenAt: '2026-10-21T00:00:00+08:00' }),
        journal('gone', { writtenAt: '2026-10-22T00:00:00.000Z', ...DELETED }),
      ],
    });
    expect(journalList(rows).map((j) => j.id)).toEqual(['new', 'old']);
  });

  it('lists live moments newest first', () => {
    const rows = data({ moments: [moment('a', { date: '2026-01-01' }), moment('b', { date: '2026-05-01' }), moment('c', DELETED)] });
    expect(momentList(rows).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it("gathers a moment's journals and comments", () => {
    const rows = data({
      moments: [moment('m1')],
      journals: [journal('j1', { momentId: 'm1' }), journal('j2')],
      comments: [comment('c1', { momentId: 'm1' })],
    });
    const page = momentPage('m1', rows);
    expect(page.journals.map((j) => j.id)).toEqual(['j1']);
    expect(page.comments.map((c) => c.id)).toEqual(['c1']);
  });
});
