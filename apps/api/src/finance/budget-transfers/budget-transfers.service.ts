import { Injectable } from '@nestjs/common';
import type { BudgetTransferKind } from '@selah/shared-types';
import { formatMoney, isWholeUnit, parseMoney } from '@selah/shared-utils';
import { assertDateRange, isRealDate } from '../../common/dates';
import { ConflictError, type FieldErrors, NotFoundError, RuleViolationError } from '../../common/errors';
import type { BudgetTransferDto, ListBudgetTransfersQuery, UpsertBudgetTransferDto } from './budget-transfers.dto';
import { type BudgetTransferRow, BudgetTransfersRepository } from './budget-transfers.repository';

@Injectable()
export class BudgetTransfersService {
  constructor(private readonly transfers: BudgetTransfersRepository) {}

  async list(query: ListBudgetTransfersQuery): Promise<BudgetTransferDto[]> {
    assertDateRange(query.from, query.to);
    return (await this.transfers.list(query)).map(toDto);
  }

  async get(id: string): Promise<BudgetTransferDto> {
    const row = await this.transfers.findById(id);
    if (!row || row.deletedAt) throw new NotFoundError(`Budget transfer ${id} not found.`);
    return toDto(row);
  }

  /** Creates or replaces a manual transfer (ADR 0017, 0019). */
  async upsert(id: string, input: UpsertBudgetTransferDto): Promise<{ transfer: BudgetTransferDto; created: boolean }> {
    const existing = await this.transfers.findById(id);
    if (existing?.deletedAt) throw new ConflictError(`Budget transfer ${id} was deleted.`);
    if (existing && existing.kind !== 'manual') {
      throw new ConflictError('Stored resets belong to Close Week and can\'t be edited here.');
    }

    const errors: FieldErrors = {};
    const add = (field: string, message: string) => (errors[field] ??= []).push(message);

    if (!isRealDate(input.occurredOn)) add('occurredOn', 'occurredOn is not a real date');
    const sections = await this.transfers.itemSections([input.fromItemId, input.toItemId]);
    for (const field of ['fromItemId', 'toItemId'] as const) {
      const section = sections.get(input[field]);
      if (!section) add(field, 'The budget item does not exist.');
      else if (section === 'income') add(field, 'Income items are not budgets; they take no transfers (ADR 0019).');
    }
    if (input.fromItemId === input.toItemId) add('toItemId', 'A transfer needs two different items.');
    const amount = parseMoney(input.amount);
    if (amount <= 0n) add('amount', 'The amount must be positive.');
    else if (!isWholeUnit(amount)) add('amount', 'Budgets are whole TWD.');
    if (Object.keys(errors).length) throw new RuleViolationError('The transfer breaks the rules.', errors);

    const values = {
      occurredOn: input.occurredOn,
      occurredAt: input.occurredAt ?? null,
      fromItemId: input.fromItemId,
      toItemId: input.toItemId,
      amount: formatMoney(amount),
      note: input.note && input.note.trim() ? input.note : null,
    };
    if (existing) await this.transfers.update(id, values);
    else await this.transfers.insert(id, values);
    return { transfer: await this.get(id), created: !existing };
  }

  async remove(id: string): Promise<void> {
    const row = await this.transfers.findById(id);
    if (!row) throw new NotFoundError(`Budget transfer ${id} not found.`);
    if (row.deletedAt) return;
    if (row.kind !== 'manual') throw new ConflictError('Stored resets belong to Close Week and can\'t be deleted here.');
    await this.transfers.softDelete(id);
  }
}

function toDto(row: BudgetTransferRow): BudgetTransferDto {
  return {
    id: row.id,
    kind: row.kind as BudgetTransferKind,
    occurredOn: row.occurredOn,
    occurredAt: row.occurredAt ? row.occurredAt.slice(0, 5) : null,
    fromItemId: row.fromItemId,
    toItemId: row.toItemId,
    amount: row.amount,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
