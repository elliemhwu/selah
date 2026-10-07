import { type Section, SECTIONS, type YearMonth } from '@selah/shared-types';
import {
  type Cents,
  formatMoney,
  formatPercent,
  MoneyError,
  parseMoney,
  parsePercent,
  percentOfBase,
  type PlanItem,
  PlanError,
  planMonth,
  sumCents,
} from '@selah/shared-utils';
import type { PlanItemDto } from '../data/finance-api';
import { SECTION_LABELS } from '../records/budget-item-options';

// The budget screen's numbers for one month, from a version's items (ADR 0019).
// All math goes through libs/shared-utils; this only arranges it.

export interface PlanRow {
  item: PlanItemDto;
  /** Depth in the item tree, 0 for top-level items. */
  depth: number;
  /** What the item contributes to the month, as a decimal string; null if the plan can't be calculated. */
  monthly: string | null;
}

export interface PlanSection {
  section: Section;
  label: string;
  rows: PlanRow[];
  /** Total of the top-level items. */
  total: string | null;
  /** Share of net income, as percentage points ("42.6170"); allocation sections only. */
  share: string | null;
}

export interface PlanView {
  sections: PlanSection[];
  netIncome: string | null;
  /** Net income no Offerings, Savings or Expenses item claims. */
  unallocated: string | null;
  unallocatedShare: string | null;
  /** Why the numbers can't be calculated, e.g. a percentage on a daily item. */
  error: string | null;
}

const ALLOCATION: readonly Section[] = ['offering', 'saving', 'expense'];

/** A plan item in the integer form the shared-utils math takes (ADR 0006). */
export function toPlanItem(item: PlanItemDto): PlanItem {
  return {
    ...item,
    amount: item.amount == null ? null : parseMoney(item.amount),
    percent: item.percent == null ? null : parsePercent(item.percent),
    overrides: item.overrides.map((o) => ({ month: o.month, amount: parseMoney(o.amount) })),
  };
}

/** Items in tree order within each section: every child right after its parent. */
export function treeRows(items: readonly PlanItemDto[]): { item: PlanItemDto; depth: number }[] {
  const ids = new Set(items.map((i) => i.budgetItemId));
  const children = new Map<string | null, PlanItemDto[]>();
  for (const item of items) {
    const parent = item.parentItemId && ids.has(item.parentItemId) ? item.parentItemId : null;
    children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  const rows: { item: PlanItemDto; depth: number }[] = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const item of children.get(parent) ?? []) {
      if (seen.has(item.budgetItemId)) continue;
      seen.add(item.budgetItemId);
      rows.push({ item, depth });
      visit(item.budgetItemId, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export function buildPlanView(items: readonly PlanItemDto[], month: YearMonth): PlanView {
  let monthly: Map<string, Cents> | null = null;
  let net: Cents | null = null;
  let error: string | null = null;
  try {
    const plan = planMonth(items.map(toPlanItem), month);
    monthly = plan.monthlyAmounts;
    net = plan.bases.netIncome;
  } catch (e) {
    if (!(e instanceof PlanError || e instanceof MoneyError)) throw e;
    error = e.message;
  }

  const rows = treeRows(items);
  const totals = new Map<Section, Cents>();
  const sections = SECTIONS.map((section): PlanSection => {
    const inSection = rows.filter((r) => r.item.section === section);
    const total = monthly
      ? sumCents(inSection.filter((r) => r.depth === 0).map((r) => monthly?.get(r.item.budgetItemId) ?? 0n))
      : null;
    if (total !== null) totals.set(section, total);
    return {
      section,
      label: SECTION_LABELS[section],
      rows: inSection.map((r) => ({ ...r, monthly: monthly ? formatMoney(monthly.get(r.item.budgetItemId) ?? 0n) : null })),
      total: total === null ? null : formatMoney(total),
      share: total !== null && net !== null && ALLOCATION.includes(section) ? share(total, net) : null,
    };
  });

  const unallocated = net === null ? null : net - sumCents(ALLOCATION.map((s) => totals.get(s) ?? 0n));
  return {
    sections,
    netIncome: net === null ? null : formatMoney(net),
    unallocated: unallocated === null ? null : formatMoney(unallocated),
    unallocatedShare: unallocated !== null && net !== null ? share(unallocated, net) : null,
    error,
  };
}

function share(amount: Cents, base: Cents): string | null {
  const percent = percentOfBase(amount, base);
  return percent === null ? null : formatPercent(percent);
}
