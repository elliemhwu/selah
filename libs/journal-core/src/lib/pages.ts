import { NotFoundError } from '@selah/shared-utils';
import { type CommentRow, type GodNoteRow, isLive, type JournalData, type JournalRow, type MomentRow } from './rows';

// What the journal screens show, built from the rows in memory (ADR 0030).
// The Dear Diary page needs no aggregate endpoint: one call here gathers it.

/** A memo stuck on a page: a view's main canvas shows the others as memos. */
export type DiaryMemo =
  | { kind: 'moment'; id: string; moment: MomentRow }
  | { kind: 'comment'; id: string; comment: CommentRow }
  | { kind: 'godNote'; id: string; godNote: GodNoteRow };

export interface DiaryPage {
  journal: JournalRow;
  moment: MomentRow | null;
  /** The linked moment first, as the page's context; then replies as a timeline, by `writtenAt`. */
  memos: DiaryMemo[];
}

/** One journal with its moment, comments and god notes; NotFoundError for an unknown or deleted one. */
export function diaryPage(id: string, data: JournalData): DiaryPage {
  const journal = data.journals.find((j) => j.id === id && isLive(j));
  if (!journal) throw new NotFoundError(`Entry ${id} not found.`);
  const moment = (journal.momentId && data.moments.find((m) => m.id === journal.momentId && isLive(m))) || null;

  const replies: DiaryMemo[] = [
    ...data.comments.filter((c) => c.journalId === id && isLive(c)).map((comment) => ({ kind: 'comment' as const, id: comment.id, comment })),
    ...data.godNotes.filter((n) => n.journalId === id && isLive(n)).map((godNote) => ({ kind: 'godNote' as const, id: godNote.id, godNote })),
  ].sort((a, b) => compareTimeline(writtenAtOf(a), a.id, writtenAtOf(b), b.id));

  return { journal, moment, memos: moment ? [{ kind: 'moment', id: moment.id, moment }, ...replies] : replies };
}

/** Live journals, newest first. */
export function journalList(data: JournalData): JournalRow[] {
  return data.journals.filter(isLive).sort((a, b) => compareTimeline(b.writtenAt, b.id, a.writtenAt, a.id));
}

/** Live moments, newest first, for picking one to link. */
export function momentList(data: JournalData): MomentRow[] {
  return data.moments.filter(isLive).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** A memo stuck on a moment, the Life view's canvas (ADR 0032). */
export type MomentMemo = { kind: 'journal'; id: string; journal: JournalRow };

export interface MomentPage {
  moment: MomentRow;
  /** Its journals, oldest first. */
  journals: JournalRow[];
  comments: CommentRow[];
  /** Its journals as memos, in the same order. */
  memos: MomentMemo[];
}

/** One moment with what links to it; NotFoundError for an unknown or deleted one. */
export function momentPage(id: string, data: JournalData): MomentPage {
  const moment = data.moments.find((m) => m.id === id && isLive(m));
  if (!moment) throw new NotFoundError(`Moment ${id} not found.`);
  const journals = data.journals.filter((j) => j.momentId === id && isLive(j)).sort((a, b) => compareTimeline(a.writtenAt, a.id, b.writtenAt, b.id));
  return {
    moment,
    journals,
    comments: data.comments.filter((c) => c.momentId === id && isLive(c)).sort((a, b) => compareTimeline(a.writtenAt, a.id, b.writtenAt, b.id)),
    memos: journals.map((journal) => ({ kind: 'journal', id: journal.id, journal })),
  };
}

export interface JournalChoice {
  journal: JournalRow;
  /** The live moment it belongs to now, if any; picking it for another moment moves it from this one. */
  moment: MomentRow | null;
}

export interface JournalChoices {
  /** The moment's own journals, newest first. */
  linked: JournalChoice[];
  /** Every other live journal, newest first. */
  others: JournalChoice[];
}

/** The journals to pick from for a moment's journal memo (ADR 0032). */
export function journalChoices(momentId: string, data: JournalData): JournalChoices {
  const moments = new Map(data.moments.filter(isLive).map((m) => [m.id, m]));
  const choices = journalList(data).map((journal) => ({ journal, moment: (journal.momentId && moments.get(journal.momentId)) || null }));
  return {
    linked: choices.filter((c) => c.moment?.id === momentId),
    others: choices.filter((c) => c.moment?.id !== momentId),
  };
}

function writtenAtOf(memo: DiaryMemo): string {
  return memo.kind === 'comment' ? memo.comment.writtenAt : memo.kind === 'godNote' ? memo.godNote.writtenAt : memo.moment.createdAt;
}

/** Oldest first by time, then by id so equal times keep a steady order. */
function compareTimeline(aTime: string, aId: string, bTime: string, bId: string): number {
  return Date.parse(aTime) - Date.parse(bTime) || aId.localeCompare(bId);
}
