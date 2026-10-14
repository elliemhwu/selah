import type { CategoryDto } from '../data/finance-api';

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  /** Depth in the tree, for indenting. */
  depth: number;
}

/**
 * Categories in tree order: each parent followed by its subcategories, siblings
 * in the API's order (sort order, then name). A category whose parent is
 * missing is shown at the top level, so nothing disappears.
 */
export function categoryTree(categories: readonly CategoryDto[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id));
  const children = new Map<string | null, CategoryDto[]>();
  for (const category of categories) {
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), category]);
  }
  const result: CategoryNode[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const category of children.get(parentId) ?? []) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      result.push({ id: category.id, name: category.name, parentId: category.parentId, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  // The API refuses loops, but a broken tree still shows every category.
  for (const category of categories) {
    if (seen.has(category.id)) continue;
    seen.add(category.id);
    result.push({ id: category.id, name: category.name, parentId: category.parentId, depth: 0 });
    visit(category.id, 1);
  }
  return result;
}

/** The category and everything under it: the parents it can't be moved under. */
export function categoryWithDescendants(categories: readonly CategoryDto[], id: string): Set<string> {
  const result = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id);
        grew = true;
      }
    }
  }
  return result;
}
