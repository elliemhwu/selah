import { ConflictError, RuleViolationError } from './errors';

// The category tree, apart from the budget (requirements §2).

/** Deeper than any real category tree; stops a corrupted loop from spinning. */
const MAX_DEPTH = 100;

export interface CategoryInput {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

/** A category checked and normalised, ready to store. */
export interface CategoryValues {
  name: string;
  parentId: string | null;
  sortOrder: number;
}

/** What the rules need to know about a stored category, deleted or not. */
export interface StoredCategoryRef {
  parentId: string | null;
  deletedAt: unknown;
}

/**
 * Checks a category to create or replace (ADR 0017) and normalises it.
 * `find` returns any stored category by id, deleted ones included.
 */
export function prepareCategory(
  id: string,
  input: CategoryInput,
  find: (id: string) => StoredCategoryRef | undefined,
): CategoryValues {
  if (find(id)?.deletedAt) throw new ConflictError(`Category ${id} was deleted.`);
  const parentId = input.parentId ?? null;
  if (parentId) assertValidParent(id, parentId, find);
  return { name: input.name.trim(), parentId, sortOrder: input.sortOrder ?? 0 };
}

/** The parent must be live, and must not be the category or one of its descendants. */
function assertValidParent(id: string, parentId: string, find: (id: string) => StoredCategoryRef | undefined): void {
  const invalid = (message: string) => new RuleViolationError(message, { parentId: [message] });
  let ancestorId: string | null = parentId;
  for (let depth = 0; ancestorId && depth < MAX_DEPTH; depth++) {
    if (ancestorId === id) throw invalid("A category can't be moved under itself or one of its subcategories.");
    const ancestor = find(ancestorId);
    if (!ancestor || ancestor.deletedAt) {
      throw invalid(depth === 0 ? 'The parent category does not exist.' : 'The category tree is broken.');
    }
    ancestorId = ancestor.parentId;
  }
}

/** Names are unique among the live categories under one parent. */
export function duplicateCategoryName(name: string): ConflictError {
  return new ConflictError(`A category named "${name}" already exists at this level.`);
}

/** A category can be deleted only once it has no live subcategories. */
export function assertCategoryDeletable(hasLiveChildren: boolean): void {
  if (hasLiveChildren) throw new ConflictError('The category still has subcategories. Delete or move them first.');
}
