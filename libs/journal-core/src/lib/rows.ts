import type { DatePrecision, LocalDate } from '@selah/shared-types';

// The journal rows as the app stores them (ADR 0029, 0030): the same shapes
// as the API's row DTOs, deleted rows included (ADR 0007). Timestamps are ISO
// strings; `date` is a local calendar date.

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** What actually happened. */
export interface MomentRow extends Row {
  date: LocalDate;
  title: string;
  summary: string | null;
}

/** The raw writing. */
export interface JournalRow extends Row {
  momentId: string | null;
  writtenAt: string;
  datePrecision: DatePrecision;
  body: string;
}

/** A later reply to exactly one journal or one moment. */
export interface CommentRow extends Row {
  journalId: string | null;
  momentId: string | null;
  writtenAt: string;
  body: string;
}

/** What God would say to a journal. */
export interface GodNoteRow extends Row {
  journalId: string;
  writtenAt: string;
  body: string;
  verseRef: string | null;
}

/** Every journal row the app holds. */
export interface JournalData {
  moments: readonly MomentRow[];
  journals: readonly JournalRow[];
  comments: readonly CommentRow[];
  godNotes: readonly GodNoteRow[];
}

/** Rows to save after a change, by table. */
export interface JournalChanges {
  moments?: MomentRow[];
  journals?: JournalRow[];
  comments?: CommentRow[];
  godNotes?: GodNoteRow[];
}

export const isLive = (row: { deletedAt: string | null }): boolean => !row.deletedAt;
