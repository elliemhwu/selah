import { Injectable } from '@nestjs/common';
import { assertBudgetTransferDeletable, prepareBudgetTransfer } from '@selah/finance-core';
import type { BudgetTransferKind } from '@selah/shared-types';
import { assertDateRange } from '../../common/dates';
import { NotFoundError } from '../../common/errors';
import type { BudgetTransferDto, ListBudgetTransfersQuery, UpsertBudgetTransferDto } from './budget-transfers.dto';
import { type BudgetTransferRow, BudgetTransfersRepository } from './budget-transfers.repository';

/** Manual budget transfers; the rules are in finance-core (ADR 0025). */
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
    const values = prepareBudgetTransfer(id, input, {
      existing: existing && { kind: existing.kind as BudgetTransferKind, deletedAt: existing.deletedAt },
      sections: await this.transfers.itemSections([input.fromItemId, input.toItemId]),
    });
    if (existing) await this.transfers.update(id, values);
    else await this.transfers.insert(id, values);
    return { transfer: await this.get(id), created: !existing };
  }

  async remove(id: string): Promise<void> {
    const row = await this.transfers.findById(id);
    if (!row) throw new NotFoundError(`Budget transfer ${id} not found.`);
    if (row.deletedAt) return;
    assertBudgetTransferDeletable(row.kind as BudgetTransferKind);
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
