import { computed, inject, Injectable } from '@angular/core';
import {
  type CommentInput,
  deleteJournal,
  deleteMoment,
  diaryPage,
  type GodNoteInput,
  journalChoices,
  type JournalChanges,
  type JournalData,
  type JournalInput,
  journalList,
  type MomentInput,
  momentList,
  momentPage,
  prepareComment,
  prepareGodNote,
  prepareJournal,
  prepareMoment,
  softDeleted,
} from '@selah/journal-core';
import { NotFoundError } from '@selah/shared-utils';
import { deviceResource, IDLE } from '../../data/device-resource';
import type { DeviceChanges, StoredComment, StoredGodNote, StoredJournal, StoredMoment } from '../../data/device-storage';
import { DeviceStore } from '../../data/device-store';

const now = () => new Date().toISOString();

/**
 * The Journal's data (ADR 0030): read from the device store, checked by the
 * journal-core rules before every save, in both builds (ADR 0029). Callers
 * generate ids (ADR 0007). Bodies are never logged.
 */
@Injectable({ providedIn: 'root' })
export class JournalApi {
  readonly store = inject(DeviceStore);

  private readonly data = computed<JournalData>(() => {
    const { moments, journals, comments, godNotes } = this.store.data();
    return { moments, journals, comments, godNotes };
  });

  /** Live journals, newest first. */
  list() {
    return deviceResource(this.store, () => journalList(this.data()), { defaultValue: [] as StoredJournal[] });
  }

  /** One journal with its moment and memos (the Dear Diary page); idle while `id` is undefined. */
  page(id: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = id();
      return value ? diaryPage(value, this.data()) : IDLE;
    });
  }

  /** Whether a live journal with this id is stored yet. */
  isSaved(id: string): boolean {
    return this.data().journals.some((j) => j.id === id && !j.deletedAt);
  }

  /** `id` if it is a live moment, else null. */
  liveMoment(id: string | null): string | null {
    return id && this.data().moments.some((m) => m.id === id && !m.deletedAt) ? id : null;
  }

  /** The journals to pick from for a moment's journal memo; idle while `momentId` is undefined. */
  journalChoices(momentId: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = momentId();
      return value ? journalChoices(value, this.data()) : IDLE;
    });
  }

  /** Live moments, newest first. */
  moments() {
    return deviceResource(this.store, () => momentList(this.data()), { defaultValue: [] as StoredMoment[] });
  }

  /** One moment with its journals and comments; idle while `id` is undefined. */
  moment(id: () => string | undefined) {
    return deviceResource(this.store, () => {
      const value = id();
      return value ? momentPage(value, this.data()) : IDLE;
    });
  }

  /** Creates or replaces a journal; linking or unlinking a moment is a replace. */
  async saveJournal(id: string, input: JournalInput): Promise<StoredJournal> {
    const journal = this.journalRow(id, input, this.data());
    await this.store.save({ journals: [journal] });
    return journal;
  }

  /** Links a journal to a moment, moving it from any other, or unlinks it with null. */
  async linkMoment(journalId: string, momentId: string | null): Promise<void> {
    await this.saveJournal(journalId, { ...this.existingJournal(journalId), momentId });
  }

  /** Creates a moment and links the journal to it, together. */
  async createMomentFor(journalId: string, momentId: string, input: MomentInput): Promise<void> {
    const data = this.data();
    const moment = this.momentRow(momentId, input, data);
    const withMoment = { ...data, moments: [...data.moments, moment] };
    const journal = this.journalRow(journalId, { ...this.existingJournal(journalId), momentId }, withMoment);
    await this.store.save({ moments: [moment], journals: [journal] });
  }

  /** Creates or replaces a moment. */
  async saveMoment(id: string, input: MomentInput): Promise<StoredMoment> {
    const moment = this.momentRow(id, input, this.data());
    await this.store.save({ moments: [moment] });
    return moment;
  }

  async saveComment(id: string, input: CommentInput): Promise<void> {
    const data = this.data();
    const values = prepareComment(id, input, data);
    const comment: StoredComment = { id, ...values, ...this.stamps(data.comments, id) };
    await this.store.save({ comments: [comment] });
  }

  async saveGodNote(id: string, input: GodNoteInput): Promise<void> {
    const data = this.data();
    const values = prepareGodNote(id, input, data);
    const godNote: StoredGodNote = { id, ...values, ...this.stamps(data.godNotes, id) };
    await this.store.save({ godNotes: [godNote] });
  }

  /** Deletes a journal with its comments and god notes. */
  async removeJournal(id: string): Promise<void> {
    await this.store.save(toDeviceChanges(deleteJournal(id, this.data(), now())));
  }

  /** Deletes a moment and its comments; its journals stay, unlinked. */
  async removeMoment(id: string): Promise<void> {
    await this.store.save(toDeviceChanges(deleteMoment(id, this.data(), now())));
  }

  async removeComment(id: string): Promise<void> {
    const comment = this.data().comments.find((c) => c.id === id);
    if (!comment) throw new NotFoundError(`Comment ${id} not found.`);
    if (!comment.deletedAt) await this.store.save({ comments: [softDeleted(comment, now())] });
  }

  async removeGodNote(id: string): Promise<void> {
    const godNote = this.data().godNotes.find((n) => n.id === id);
    if (!godNote) throw new NotFoundError(`Note ${id} not found.`);
    if (!godNote.deletedAt) await this.store.save({ godNotes: [softDeleted(godNote, now())] });
  }

  private journalRow(id: string, input: JournalInput, data: JournalData): StoredJournal {
    const values = prepareJournal(id, input, data);
    return { id, ...values, ...this.stamps(data.journals, id) };
  }

  private momentRow(id: string, input: MomentInput, data: JournalData): StoredMoment {
    const values = prepareMoment(id, input, data);
    return { id, ...values, ...this.stamps(data.moments, id) };
  }

  private existingJournal(id: string): JournalInput {
    const journal = this.data().journals.find((j) => j.id === id && !j.deletedAt);
    if (!journal) throw new NotFoundError(`Entry ${id} not found.`);
    return journal;
  }

  /** A new row's timestamps, or a changed row's: it keeps its `createdAt`. */
  private stamps(rows: readonly { id: string; createdAt: string }[], id: string) {
    const time = now();
    return { createdAt: rows.find((r) => r.id === id)?.createdAt ?? time, updatedAt: time, deletedAt: null };
  }
}

function toDeviceChanges(changes: JournalChanges): DeviceChanges {
  return changes;
}
