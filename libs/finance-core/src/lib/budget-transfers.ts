import type { BudgetTransferKind, Section } from '@selah/shared-types';
import { formatMoney, isWholeUnit, parseMoney } from '@selah/shared-utils';
import { isRealDate } from './dates';
import { ConflictError, FieldErrorCollector } from './errors';

// Manual budget transfers between items; they never touch accounts
// (requirements §3.2, ADR 0019).

export interface BudgetTransferInput {
  occurredOn: string;
  occurredAt?: string | null;
  fromItemId: string;
  toItemId: string;
  amount: string;
  note?: string | null;
}

/** A manual transfer checked and normalised, ready to store. */
export interface BudgetTransferValues {
  occurredOn: string;
  occurredAt: string | null;
  fromItemId: string;
  toItemId: string;
  amount: string;
  note: string | null;
}

export interface BudgetTransferContext {
  /** The stored transfer with this id, deleted or not. */
  existing?: { kind: BudgetTransferKind; deletedAt: unknown };
  /** Sections of the live budget items among `fromItemId` and `toItemId`. */
  sections: ReadonlyMap<string, Section>;
}

/** Checks a manual transfer to create or replace (ADR 0017, 0019) and normalises it. */
export function prepareBudgetTransfer(
  id: string,
  input: BudgetTransferInput,
  { existing, sections }: BudgetTransferContext,
): BudgetTransferValues {
  if (existing?.deletedAt) throw new ConflictError(`Budget transfer ${id} was deleted.`);
  if (existing && existing.kind !== 'manual') {
    throw new ConflictError("Stored resets belong to Close Week and can't be edited here.");
  }

  const errors = new FieldErrorCollector();
  if (!isRealDate(input.occurredOn)) errors.add('occurredOn', 'occurredOn is not a real date');
  for (const field of ['fromItemId', 'toItemId'] as const) {
    const section = sections.get(input[field]);
    if (!section) errors.add(field, 'The budget item does not exist.');
    else if (section === 'income') errors.add(field, 'Income items are not budgets; they take no transfers (ADR 0019).');
  }
  if (input.fromItemId === input.toItemId) errors.add('toItemId', 'A transfer needs two different items.');
  const amount = parseMoney(input.amount);
  if (amount <= 0n) errors.add('amount', 'The amount must be positive.');
  else if (!isWholeUnit(amount)) errors.add('amount', 'Budgets are whole TWD.');
  errors.throwIfAny('The transfer breaks the rules.');

  return {
    occurredOn: input.occurredOn,
    occurredAt: input.occurredAt ?? null,
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    amount: formatMoney(amount),
    note: input.note && input.note.trim() ? input.note : null,
  };
}

/** Only manual transfers can be deleted here; stored resets belong to Close Week. */
export function assertBudgetTransferDeletable(kind: BudgetTransferKind): void {
  if (kind !== 'manual') throw new ConflictError("Stored resets belong to Close Week and can't be deleted here.");
}
