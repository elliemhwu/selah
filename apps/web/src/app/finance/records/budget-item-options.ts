import { type Section, SECTIONS } from '@selah/shared-types';
import type { PlanItemDto } from '../data/finance-api';

export const SECTION_LABELS: Record<Section, string> = {
  income: $localize`:@@section.income:Income`,
  government: $localize`:@@section.government:Government`,
  offering: $localize`:@@section.offering:Offerings`,
  saving: $localize`:@@section.saving:Savings`,
  expense: $localize`:@@section.expense:Expenses`,
};

export interface BudgetItemOption {
  id: string;
  name: string;
  /** Depth in the item tree, for indenting. */
  depth: number;
}

export interface BudgetItemGroup {
  section: Section;
  label: string;
  items: BudgetItemOption[];
}

/**
 * Plan items a record line can link to, grouped by section in plan order
 * (requirements §2): Income items for income, any other section for expenses.
 */
export function budgetItemGroups(items: readonly PlanItemDto[], type: 'income' | 'expense'): BudgetItemGroup[] {
  const parents = new Map(items.map((i) => [i.budgetItemId, i.parentItemId]));
  const depthOf = (id: string): number => {
    let depth = 0;
    const seen = new Set<string>();
    for (let parent = parents.get(id); parent && !seen.has(parent); parent = parents.get(parent)) {
      seen.add(parent);
      depth++;
    }
    return depth;
  };
  return SECTIONS.filter((section) => (type === 'income') === (section === 'income'))
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      items: items
        .filter((i) => i.section === section)
        .map((i) => ({ id: i.budgetItemId, name: i.name, depth: depthOf(i.budgetItemId) })),
    }))
    .filter((group) => group.items.length > 0);
}

/** "1200.00" → "1200" for whole-unit currencies, so inputs read naturally. */
export function toInputAmount(value: string): string {
  return value.replace(/\.00$/, '');
}
