import { DATE_PRECISIONS, type DatePrecision, type LocalDate } from '@selah/shared-types';
import { ConflictError, DateError, FieldErrorCollector, NotFoundError, toDayNumber } from '@selah/shared-utils';
import { type CommentRow, type GodNoteRow, isLive, type JournalChanges, type JournalData, type JournalRow, type MomentRow } from './rows';

// The journal rules (ADR 0030). Each prepare function checks an input against
// the rows the app holds and returns the values to store, or throws
// RuleViolationError (with field errors), ConflictError or NotFoundError.
// Bodies are kept exactly as written and never appear in a message.

export const MAX_TITLE_LENGTH = 200;
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_VERSE_REF_LENGTH = 100;

export interface JournalInput {
  writtenAt: string;
  datePrecision?: DatePrecision;
  body: string;
  momentId?: string | null;
}

export type JournalValues = Pick<JournalRow, 'writtenAt' | 'datePrecision' | 'body' | 'momentId'>;

/** Checks a journal to create or replace. Linking it to a moment, or unlinking it, is a replace. */
export function prepareJournal(id: string, input: JournalInput, data: JournalData): JournalValues {
  const existing = data.journals.find((j) => j.id === id);
  if (existing && !isLive(existing)) throw new ConflictError('This entry was deleted.');

  const errors = new FieldErrorCollector();
  checkTimestamp(input.writtenAt, 'writtenAt', errors);
  const datePrecision = input.datePrecision ?? 'day';
  if (!DATE_PRECISIONS.includes(datePrecision)) errors.add('datePrecision', 'Choose day, month, season or year.');
  if (!existing && input.body.trim() === '') errors.add('body', 'Write something first.');
  const momentId = input.momentId ?? null;
  if (momentId !== null) checkLive(data.moments, momentId, 'momentId', "That moment doesn't exist.", errors);
  errors.throwIfAny("The entry can't be saved.");

  return { writtenAt: input.writtenAt, datePrecision, body: input.body, momentId };
}

export interface MomentInput {
  date: LocalDate;
  title: string;
  summary?: string | null;
}

export type MomentValues = Pick<MomentRow, 'date' | 'title' | 'summary'>;

/** Checks a moment to create or replace. */
export function prepareMoment(id: string, input: MomentInput, data: JournalData): MomentValues {
  const existing = data.moments.find((m) => m.id === id);
  if (existing && !isLive(existing)) throw new ConflictError('This moment was deleted.');

  const errors = new FieldErrorCollector();
  if (!isLocalDate(input.date)) errors.add('date', 'Enter a date.');
  const title = input.title.trim();
  if (title === '') errors.add('title', 'Give the moment a title.');
  else if (title.length > MAX_TITLE_LENGTH) errors.add('title', `Keep the title to ${MAX_TITLE_LENGTH} characters.`);
  const summary = input.summary?.trim() || null;
  if (summary && summary.length > MAX_SUMMARY_LENGTH) errors.add('summary', `Keep the summary to ${MAX_SUMMARY_LENGTH} characters.`);
  errors.throwIfAny("The moment can't be saved.");

  return { date: input.date, title, summary };
}

export interface CommentInput {
  journalId?: string | null;
  momentId?: string | null;
  writtenAt: string;
  body: string;
}

export type CommentValues = Pick<CommentRow, 'journalId' | 'momentId' | 'writtenAt' | 'body'>;

/** Checks a comment to create or replace: it replies to exactly one journal or one moment, which it keeps. */
export function prepareComment(id: string, input: CommentInput, data: JournalData): CommentValues {
  const existing = data.comments.find((c) => c.id === id);
  if (existing && !isLive(existing)) throw new ConflictError('This comment was deleted.');

  const journalId = input.journalId ?? null;
  const momentId = input.momentId ?? null;
  const errors = new FieldErrorCollector();
  if ((journalId === null) === (momentId === null)) {
    errors.add('journalId', 'A comment replies to one journal or one moment.');
  } else if (existing && (existing.journalId !== journalId || existing.momentId !== momentId)) {
    errors.add('journalId', 'A comment stays with what it replied to.');
  } else if (journalId !== null) {
    checkLive(data.journals, journalId, 'journalId', "That entry doesn't exist.", errors);
  } else if (momentId !== null) {
    checkLive(data.moments, momentId, 'momentId', "That moment doesn't exist.", errors);
  }
  checkTimestamp(input.writtenAt, 'writtenAt', errors);
  const body = input.body.trim();
  if (body === '') errors.add('body', 'Write something first.');
  errors.throwIfAny("The comment can't be saved.");

  return { journalId, momentId, writtenAt: input.writtenAt, body };
}

export interface GodNoteInput {
  journalId: string;
  writtenAt: string;
  body: string;
  verseRef?: string | null;
}

export type GodNoteValues = Pick<GodNoteRow, 'journalId' | 'writtenAt' | 'body' | 'verseRef'>;

/** Checks a god note to create or replace; it stays with its journal. */
export function prepareGodNote(id: string, input: GodNoteInput, data: JournalData): GodNoteValues {
  const existing = data.godNotes.find((n) => n.id === id);
  if (existing && !isLive(existing)) throw new ConflictError('This note was deleted.');

  const errors = new FieldErrorCollector();
  if (existing && existing.journalId !== input.journalId) errors.add('journalId', 'A note stays with its entry.');
  else checkLive(data.journals, input.journalId, 'journalId', "That entry doesn't exist.", errors);
  checkTimestamp(input.writtenAt, 'writtenAt', errors);
  const body = input.body.trim();
  if (body === '') errors.add('body', 'Write something first.');
  const verseRef = input.verseRef?.trim() || null;
  if (verseRef && verseRef.length > MAX_VERSE_REF_LENGTH) errors.add('verseRef', `Keep the verse to ${MAX_VERSE_REF_LENGTH} characters.`);
  errors.throwIfAny("The note can't be saved.");

  return { journalId: input.journalId, writtenAt: input.writtenAt, body, verseRef };
}

/** Deleting a journal also deletes its comments and god notes (soft deletes, ADR 0007). */
export function deleteJournal(id: string, data: JournalData, time: string): JournalChanges {
  const journal = data.journals.find((j) => j.id === id);
  if (!journal) throw new NotFoundError(`Entry ${id} not found.`);
  if (!isLive(journal)) return {};
  return {
    journals: [softDeleted(journal, time)],
    comments: data.comments.filter((c) => c.journalId === id && isLive(c)).map((c) => softDeleted(c, time)),
    godNotes: data.godNotes.filter((n) => n.journalId === id && isLive(n)).map((n) => softDeleted(n, time)),
  };
}

/** Deleting a moment unlinks its journals, which stay, and deletes its comments. */
export function deleteMoment(id: string, data: JournalData, time: string): JournalChanges {
  const moment = data.moments.find((m) => m.id === id);
  if (!moment) throw new NotFoundError(`Moment ${id} not found.`);
  if (!isLive(moment)) return {};
  return {
    moments: [softDeleted(moment, time)],
    journals: data.journals.filter((j) => j.momentId === id && isLive(j)).map((j) => ({ ...j, momentId: null, updatedAt: time })),
    comments: data.comments.filter((c) => c.momentId === id && isLive(c)).map((c) => softDeleted(c, time)),
  };
}

export function softDeleted<T extends { updatedAt: string; deletedAt: string | null }>(row: T, time: string): T {
  return { ...row, updatedAt: time, deletedAt: time };
}

function checkLive(rows: readonly { id: string; deletedAt: string | null }[], id: string, field: string, message: string, errors: FieldErrorCollector): void {
  const row = rows.find((r) => r.id === id);
  if (!row || !isLive(row)) errors.add(field, message);
}

function checkTimestamp(value: string, field: string, errors: FieldErrorCollector): void {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) errors.add(field, 'Enter a date and time.');
}

function isLocalDate(value: string): boolean {
  try {
    toDayNumber(value);
    return true;
  } catch (error) {
    if (error instanceof DateError) return false;
    throw error;
  }
}
