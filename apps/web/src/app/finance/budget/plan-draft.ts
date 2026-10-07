import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { YearMonth } from '@selah/shared-types';
import { problemOf } from '../../core/problem';
import { PlanApi, type PlanItemDto, type PlanVersionDto } from '../data/finance-api';

/** A plan version being edited. It's saved whole, in one call (ADR 0018). */
export interface PlanDraftState {
  versionId: string;
  effectiveFromMonth: YearMonth;
  note: string | null;
  items: PlanItemDto[];
  /** The items as they were when editing began, to tell what changed. */
  base: PlanItemDto[];
  /** The version doesn't exist on the server yet. */
  isNew: boolean;
}

export interface DraftErrors {
  /** Errors that belong to no item, e.g. the start month. */
  general: string[];
  /** Errors per budget item id, from `items.N.*` in Problem Details. */
  byItem: Record<string, string[]>;
}

export type SaveResult = { ok: true; version: PlanVersionDto } | { ok: false; message: string };

const STORAGE_KEY = 'selah.planDraft.v1';
const NO_ERRORS: DraftErrors = { general: [], byItem: {} };

/**
 * The one draft of the budget editor. It lives on the device (localStorage),
 * so a reload or switching apps doesn't lose unsaved edits.
 */
@Injectable({ providedIn: 'root' })
export class PlanDraft {
  private readonly api = inject(PlanApi);
  readonly state = signal<PlanDraftState | null>(load());
  readonly errors = signal<DraftErrors>(NO_ERRORS);

  /** Item ids that are new, edited, or (from the base) removed. */
  readonly changes = computed(() => {
    const draft = this.state();
    const added = new Set<string>();
    const edited = new Set<string>();
    let removed = 0;
    if (draft) {
      const base = new Map(draft.base.map((i) => [i.budgetItemId, JSON.stringify(i)]));
      for (const item of draft.items) {
        const before = base.get(item.budgetItemId);
        if (before === undefined) added.add(item.budgetItemId);
        else if (before !== JSON.stringify(item)) edited.add(item.budgetItemId);
      }
      const ids = new Set(draft.items.map((i) => i.budgetItemId));
      removed = draft.base.filter((i) => !ids.has(i.budgetItemId)).length;
    }
    return { added, edited, removed, count: added.size + edited.size + removed };
  });

  constructor() {
    effect(() => store(this.state()));
  }

  /** Starts editing a saved version (the newest one; older ones are read-only). */
  edit(version: PlanVersionDto): void {
    const items = clone(version.items);
    this.begin({ versionId: version.id, effectiveFromMonth: version.effectiveFromMonth, note: version.note, items, base: clone(items), isNew: false });
  }

  /** Starts a new version as a copy of `from` (none for the very first plan). */
  startNew(from: PlanVersionDto | null, effectiveFromMonth: YearMonth, note: string | null): void {
    const items = clone(from?.items ?? []);
    this.begin({ versionId: crypto.randomUUID(), effectiveFromMonth, note, items, base: clone(items), isNew: true });
  }

  item(id: string): PlanItemDto | undefined {
    return this.state()?.items.find((i) => i.budgetItemId === id);
  }

  /** Adds an item or replaces the one with the same id, keeping its place. */
  putItem(item: PlanItemDto): void {
    this.update((draft) => {
      const index = draft.items.findIndex((i) => i.budgetItemId === item.budgetItemId);
      const items = [...draft.items];
      if (index >= 0) items[index] = item;
      else items.push(item);
      return { ...draft, items };
    });
  }

  /** Removes an item and everything under it. Returns how many were removed. */
  removeItem(id: string): number {
    const draft = this.state();
    if (!draft) return 0;
    const doomed = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const item of draft.items) {
        if (item.parentItemId && doomed.has(item.parentItemId) && !doomed.has(item.budgetItemId)) {
          doomed.add(item.budgetItemId);
          grew = true;
        }
      }
    }
    this.update((d) => ({ ...d, items: d.items.filter((i) => !doomed.has(i.budgetItemId)) }));
    return doomed.size;
  }

  discard(): void {
    this.state.set(null);
    this.errors.set(NO_ERRORS);
  }

  /** Saves the whole version. On a rule violation, the errors land on their items. */
  async save(): Promise<SaveResult> {
    const draft = this.state();
    if (!draft) return { ok: false, message: $localize`:@@budget.noDraft:There is nothing to save.` };
    try {
      const version = await this.api.saveVersion(draft.versionId, {
        effectiveFromMonth: draft.effectiveFromMonth,
        note: draft.note,
        items: draft.items,
      });
      this.discard();
      return { ok: true, version };
    } catch (error) {
      const problem = problemOf(error);
      const errors: DraftErrors = { general: [], byItem: {} };
      for (const [field, messages] of Object.entries(problem.errors)) {
        const match = /^items\.(\d+)\./.exec(field);
        const item = match ? draft.items[Number(match[1])] : undefined;
        if (item) (errors.byItem[item.budgetItemId] ??= []).push(...messages);
        else errors.general.push(...messages);
      }
      if (errors.general.length === 0 && Object.keys(errors.byItem).length === 0) errors.general.push(problem.message);
      this.errors.set(errors);
      return { ok: false, message: problem.message };
    }
  }

  private begin(state: PlanDraftState): void {
    this.state.set(state);
    this.errors.set(NO_ERRORS);
  }

  private update(change: (draft: PlanDraftState) => PlanDraftState): void {
    const draft = this.state();
    if (draft) this.state.set(change(draft));
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

// Storage may be unavailable (private mode, blocked site data); the draft then lives in memory only.
function load(): PlanDraftState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlanDraftState) : null;
  } catch {
    return null;
  }
}

function store(state: PlanDraftState | null): void {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep working from memory.
  }
}
