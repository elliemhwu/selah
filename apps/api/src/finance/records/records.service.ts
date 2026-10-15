import { Injectable } from '@nestjs/common';
import { prepareRecords, type RecordInput, referencedIds } from '@selah/finance-core';
import type { Currency, RecordType } from '@selah/shared-types';
import { assertDateRange } from '../../common/dates';
import { NotFoundError } from '../../common/errors';
import type { ListRecordsQuery, RecordDto, UpsertRecordBatchDto, UpsertRecordDto } from './records.dto';
import { type RecordWithLines, RecordsRepository } from './records.repository';

/** Records with lines; the rules are in finance-core, shared with the device (ADR 0025). */
@Injectable()
export class RecordsService {
  constructor(private readonly records: RecordsRepository) {}

  async list(query: ListRecordsQuery): Promise<RecordDto[]> {
    assertDateRange(query.from, query.to);
    return (await this.records.list(query)).map(toRecordDto);
  }

  async get(id: string): Promise<RecordDto> {
    const [found] = await this.records.findByIds([id]);
    if (!found || found.record.deletedAt) throw new NotFoundError(`Record ${id} not found.`);
    return toRecordDto(found);
  }

  /** Creates or replaces one record and its lines (ADR 0017). */
  async upsert(id: string, input: UpsertRecordDto): Promise<{ record: RecordDto; created: boolean }> {
    const { records, created } = await this.saveAll([{ ...input, id }], () => '');
    return { record: records[0], created: created.has(id) };
  }

  /** Creates or replaces several records, all or nothing (batch entry). */
  async upsertBatch(input: UpsertRecordBatchDto): Promise<RecordDto[]> {
    return (await this.saveAll(input.records, (i) => `records.${i}.`)).records;
  }

  async remove(id: string): Promise<void> {
    const [found] = await this.records.findByIds([id]);
    if (!found) throw new NotFoundError(`Record ${id} not found.`);
    if (found.record.deletedAt) return;
    await this.records.softDelete(id);
  }

  async lastUsedRates() {
    return this.records.lastUsedRates();
  }

  private async saveAll(
    inputs: readonly RecordInput[],
    prefix: (index: number) => string,
  ): Promise<{ records: RecordDto[]; created: Set<string> }> {
    const lookups = await this.records.lookups(referencedIds(inputs));
    const writes = prepareRecords(inputs, lookups, prefix);
    const created = await this.records.save(writes);
    const saved = new Map(
      (await this.records.findByIds(writes.map((w) => w.id))).map((r) => [r.record.id, r]),
    );
    return { records: writes.map((w) => toRecordDto(saved.get(w.id) as RecordWithLines)), created };
  }
}

export function toRecordDto({ record: r, lines }: RecordWithLines): RecordDto {
  return {
    id: r.id,
    type: r.type as RecordType,
    occurredOn: r.occurredOn,
    occurredAt: r.occurredAt ? r.occurredAt.slice(0, 5) : null,
    accountId: r.accountId,
    currency: r.currency as Currency,
    counterAccountId: r.counterAccountId,
    counterAmount: r.counterAmount,
    targetBalance: r.targetBalance,
    note: r.note,
    lines: lines.map((l) => ({
      id: l.id,
      amount: l.amount,
      twdAmount: l.twdAmount,
      fxRate: l.fxRate,
      categoryId: l.categoryId,
      budgetItemId: l.budgetItemId,
      note: l.note,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
