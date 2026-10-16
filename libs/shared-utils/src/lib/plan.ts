import type {
  Anchor,
  Cadence,
  LocalDate,
  PercentBase,
  ResetAction,
  ResetCycle,
  Section,
  YearMonth,
} from '@selah/shared-types';
import { monthlyAmount } from './cadence';
import type { Cents } from './money';
import { type Percent, percentOf } from './percent';

// Planned amounts for one month of a plan version (requirements §3, ADR 0019).

/** A plan item as one version defines it. */
export interface PlanItem {
  budgetItemId: string;
  section: Section;
  parentItemId: string | null;
  cadence: Cadence;
  cadenceMonth: number | null;
  cadenceDate: LocalDate | null;
  anchor: Anchor;
  /** Whole TWD per cadence period. Anchor `amount` only. */
  amount: Cents | null;
  /** Anchor `percent` only. */
  percent: Percent | null;
  percentBase: PercentBase;
  rollover: boolean;
  resetCycle: ResetCycle | null;
  onReset: ResetAction | null;
  carryToItemId: string | null;
  /** Monthly items only. */
  overrides: readonly { month: YearMonth; amount: Cents }[];
}

export interface PlanBases {
  /** Planned income of the top-level Income items. */
  grossIncome: Cents;
  /** Planned total of the top-level Government items. */
  government: Cents;
  /** grossIncome − government: the default allocation base. */
  netIncome: Cents;
}

export interface MonthPlan {
  month: YearMonth;
  bases: PlanBases;
  /** Per item: the amount per cadence period, with percentages resolved. */
  periodAmounts: Map<string, Cents>;
  /** Per item: what it contributes to this month (cadence conversion, overrides). */
  monthlyAmounts: Map<string, Cents>;
}

/** Thrown for a plan the rules in ADR 0018 and 0019 don't allow. */
export class PlanError extends Error {
  override name = 'PlanError';
}

/**
 * Resolves every item of a version for one month. Percentages apply to the
 * month's base (whole TWD), so they are allowed on monthly, yearly and
 * one-time items only. Only top-level items count towards the bases, because a
 * parent's amount already covers its children.
 */
export function planMonth(items: readonly PlanItem[], month: YearMonth): MonthPlan {
  const periodAmounts = new Map<string, Cents>();
  const monthlyAmounts = new Map<string, Cents>();

  const resolve = (item: PlanItem, bases: Partial<PlanBases>): void => {
    let amount: Cents;
    if (item.anchor === 'amount') {
      if (item.amount == null) throw new PlanError(`Item ${item.budgetItemId} is anchored to an amount but has none`);
      amount = item.amount;
    } else {
      if (item.percent == null) throw new PlanError(`Item ${item.budgetItemId} is anchored to a percent but has none`);
      if (item.cadence === 'daily' || item.cadence === 'weekly') {
        throw new PlanError(`A ${item.cadence} item can't be a percentage of a monthly base`);
      }
      const base = item.percentBase === 'gross_income' ? bases.grossIncome : bases.netIncome;
      if (base === undefined) {
        throw new PlanError(`Item ${item.budgetItemId} (${item.section}) can't use ${item.percentBase} as its base`);
      }
      amount = percentOf(base, item.percent);
    }
    const override = item.cadence === 'monthly' ? item.overrides.find((o) => o.month === month)?.amount : undefined;
    periodAmounts.set(item.budgetItemId, amount);
    monthlyAmounts.set(
      item.budgetItemId,
      monthlyAmount({ ...item, amount }, month, override ?? null),
    );
  };

  const topLevelTotal = (section: Section): Cents => {
    let total = 0n;
    for (const item of items) {
      if (item.section === section && item.parentItemId === null) total += monthlyAmounts.get(item.budgetItemId) ?? 0n;
    }
    return total;
  };

  // Income is the base of everything; Government may only use gross income.
  for (const item of items) if (item.section === 'income') resolve(item, {});
  const grossIncome = topLevelTotal('income');
  for (const item of items) if (item.section === 'government') resolve(item, { grossIncome });
  const government = topLevelTotal('government');
  const bases: PlanBases = { grossIncome, government, netIncome: grossIncome - government };
  for (const item of items) {
    if (item.section !== 'income' && item.section !== 'government') resolve(item, bases);
  }

  return { month, bases, periodAmounts, monthlyAmounts };
}

/** The version in effect for a month: the latest one starting on or before it (ADR 0012). */
export function activeVersionFor<V extends { effectiveFromMonth: YearMonth }>(
  versions: readonly V[],
  month: YearMonth,
): V | undefined {
  let active: V | undefined;
  for (const version of versions) {
    if (version.effectiveFromMonth <= month && (!active || version.effectiveFromMonth > active.effectiveFromMonth)) {
      active = version;
    }
  }
  return active;
}
