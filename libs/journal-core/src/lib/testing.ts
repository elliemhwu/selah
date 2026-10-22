import type { CommentRow, GodNoteRow, JournalData, JournalRow, MomentRow } from './rows';

// Rows for the tests.

const T = '2026-10-01T00:00:00.000Z';
const base = { createdAt: T, updatedAt: T, deletedAt: null };

export const moment = (id: string, over: Partial<MomentRow> = {}): MomentRow => ({ id, date: '2026-10-01', title: id, summary: null, ...base, ...over });
export const journal = (id: string, over: Partial<JournalRow> = {}): JournalRow => ({
  id,
  momentId: null,
  writtenAt: T,
  datePrecision: 'day',
  body: 'Dear Diary,',
  ...base,
  ...over,
});
export const comment = (id: string, over: Partial<CommentRow> = {}): CommentRow => ({
  id,
  journalId: null,
  momentId: null,
  writtenAt: T,
  body: 'Looking back…',
  ...base,
  ...over,
});
export const godNote = (id: string, over: Partial<GodNoteRow> = {}): GodNoteRow => ({
  id,
  journalId: 'j1',
  writtenAt: T,
  body: 'You are loved.',
  verseRef: null,
  ...base,
  ...over,
});
export const data = (over: Partial<JournalData> = {}): JournalData => ({ moments: [], journals: [], comments: [], godNotes: [], ...over });
