import { Injectable } from '@nestjs/common';
import type { Currency, RecordType } from '@selah/shared-types';
import {
  assertValidAmount,
  formatMoney,
  formatRate,
  isRecordCurrencyAllowed,
  isWholeUnit,
  parseMoney,
  parseRate,
  toDayNumber,
  toTwd,
} from '@selah/shared-utils';
import { randomUUID } from 'node:crypto';
import { type FieldErrors, NotFoundError, RuleViolationError } from '../../common/errors';
import type {
  ListRecordsQuery,
  RecordDto,
  RecordLineInput,
  UpsertRecordBatchDto,
  UpsertRecordDto,
} from './records.dto';
import {
  type Lookups,
  type LineWrite,
  type RecordWithLines,
  type RecordWrite,
  RecordsRepository,
} from './records.repository';

type RecordInput = UpsertRecordDto & { id: string };

@Injectable()
export class RecordsService {
  constructor(private readonly records: RecordsRepository) {}

  async list(query: ListRecordsQuery): Promise<RecordDto[]> {
    const errors: FieldErrors = {};
    if (!isRealDate(query.from)) errors['from'] = ['from is not a real date'];
    if (!isRealDate(query.to)) errors['to'] = ['to is not a real date'];
    if (!errors['from'] && !errors['to'] && query.from > query.to) errors['to'] = ['to must not be before from'];
    if (Object.keys(errors).length) throw new RuleViolationError('The date range is invalid.', errors);
    return (await this.records.list(query)).map(toDto);
  }

  async get(id: string): Promise<RecordDto> {
    const [found] = await this.records.findByIds([id]);
    if (!found || found.record.deletedAt) throw new NotFoundError(`Record ${id} not found.`);
    return toDto(found);
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
    const lookups = await this.records.lookups({
      accounts: unique(inputs.flatMap((r) => [r.accountId, r.counterAccountId])),
      categories: unique(inputs.flatMap((r) => r.lines.map((l) => l.categoryId))),
      budgetItems: unique(inputs.flatMap((r) => r.lines.map((l) => l.budgetItemId))),
    });

    const errors: FieldErrors = {};
    const seenRecords = new Map<string, number>();
    const seenLines = new Set<string>();
    const writes = inputs.map((input, index) => {
      const add = (field: string, message: string) => {
        const key = prefix(index) + field;
        (errors[key] ??= []).push(message);
      };
      if (seenRecords.has(input.id)) add('id', `Duplicate record id (also at index ${seenRecords.get(input.id)}).`);
      seenRecords.set(input.id, index);
      const write = toWrite(input, lookups, add);
      write.lines.forEach((line, j) => {
        if (seenLines.has(line.id)) add(`lines.${j}.id`, 'Duplicate line id.');
        seenLines.add(line.id);
      });
      return write;
    });
    if (Object.keys(errors).length) {
      throw new RuleViolationError('The request breaks finance rules.', errors);
    }

    const created = await this.records.save(writes);
    const saved = new Map(
      (await this.records.findByIds(writes.map((w) => w.id))).map((r) => [r.record.id, r]),
    );
    return { records: writes.map((w) => toDto(saved.get(w.id) as RecordWithLines)), created };
  }
}

/** Checks one record against the rules and converts it to rows. */
function toWrite(
  input: RecordInput,
  lookups: Lookups,
  add: (field: string, message: string) => void,
): RecordWrite {
  const type: RecordType = input.type;
  const currency: Currency = input.currency;

  if (!isRealDate(input.occurredOn)) add('occurredOn', 'occurredOn is not a real date');

  const account = lookups.accounts.get(input.accountId);
  if (!account) add('accountId', 'The account does not exist.');
  else if (!isRecordCurrencyAllowed(currency, account.currency)) {
    add('currency', `A ${currency} record can't be posted to a ${account.currency} account (ADR 0016).`);
  }

  const counterAccount = input.counterAccountId ? lookups.accounts.get(input.counterAccountId) : undefined;
  let counterAmount: string | null = null;
  let targetBalance: string | null = null;

  if (type === 'transfer') {
    if (!input.counterAccountId) add('counterAccountId', 'A transfer needs a receiving account.');
    else if (!counterAccount) add('counterAccountId', 'The receiving account does not exist.');
    else if (input.counterAccountId === input.accountId) add('counterAccountId', 'A transfer needs two different accounts.');
    if (input.counterAmount == null) add('counterAmount', 'A transfer needs the amount received.');
    else {
      counterAmount = positiveAmount(input.counterAmount, counterAccount?.currency, 'counterAmount', add);
    }
    if (input.lines.length !== 1) add('lines', 'A transfer has exactly one line: the amount sent.');
  } else {
    if (input.counterAccountId != null) add('counterAccountId', 'Only transfers have a receiving account.');
    if (input.counterAmount != null) add('counterAmount', 'Only transfers have an amount received.');
  }

  if (type === 'adjustment') {
    if (input.targetBalance == null) add('targetBalance', 'An adjustment needs the actual balance.');
    else {
      const target = parseMoney(input.targetBalance);
      if (account && !wholeIfRequired(target, account.currency)) {
        add('targetBalance', `${account.currency} amounts must be whole.`);
      }
      targetBalance = formatMoney(target);
    }
    if (account && currency !== account.currency) add('currency', "An adjustment uses the account's currency.");
    if (input.lines.length > 0) add('lines', 'An adjustment has no lines; it sets the balance (ADR 0014).');
  } else {
    if (input.targetBalance != null) add('targetBalance', 'Only adjustments have a target balance.');
    if (type !== 'transfer' && input.lines.length === 0) add('lines', 'Add at least one line.');
  }

  const lines = input.lines.map((line, j) => toLineWrite(line, j, type, currency, lookups, add));

  return {
    id: input.id,
    type,
    occurredOn: input.occurredOn,
    occurredAt: input.occurredAt ?? null,
    accountId: input.accountId,
    currency,
    counterAccountId: type === 'transfer' ? (input.counterAccountId ?? null) : null,
    counterAmount,
    targetBalance,
    note: blankToNull(input.note),
    lines,
  };
}

function toLineWrite(
  line: RecordLineInput,
  index: number,
  type: RecordType,
  currency: Currency,
  lookups: Lookups,
  add: (field: string, message: string) => void,
): LineWrite {
  const field = (name: string) => `lines.${index}.${name}`;
  const amount = positiveAmount(line.amount, currency, field('amount'), add) ?? formatMoney(0n);

  let fxRate: string | null = null;
  let twdAmount = amount;
  if (currency === 'TWD') {
    if (line.fxRate != null) add(field('fxRate'), 'TWD lines have no exchange rate.');
    if (line.twdAmount != null && parseMoney(line.twdAmount) !== parseMoney(amount)) {
      add(field('twdAmount'), 'For TWD lines, twdAmount equals amount.');
    }
  } else if (line.fxRate == null) {
    add(field('fxRate'), `A ${currency} line needs an exchange rate.`);
  } else if (!/[1-9]/.test(line.fxRate)) {
    // The format is already a non-negative decimal; this rules out zero.
    add(field('fxRate'), 'The exchange rate must be positive.');
  } else {
    const rate = parseRate(line.fxRate);
    fxRate = formatRate(rate);
    const twd = line.twdAmount != null ? parseMoney(line.twdAmount) : toTwd(parseMoney(amount), rate);
    if (twd <= 0n) add(field('twdAmount'), 'The TWD amount must be at least 1.');
    else if (!isWholeUnit(twd)) add(field('twdAmount'), 'TWD amounts must be whole.');
    twdAmount = formatMoney(twd);
  }

  if (line.categoryId && !lookups.categories.has(line.categoryId)) {
    add(field('categoryId'), 'The category does not exist.');
  }
  if (line.budgetItemId) {
    const item = lookups.budgetItems.get(line.budgetItemId);
    if (!item) add(field('budgetItemId'), 'The budget item does not exist.');
    else if (type === 'transfer' || type === 'adjustment') {
      add(field('budgetItemId'), `A ${type} has no budget item.`);
    } else if (type === 'income' && item.section !== 'income') {
      add(field('budgetItemId'), 'Income links to an item in the Income section.');
    } else if (type === 'expense' && item.section === 'income') {
      add(field('budgetItemId'), "An expense can't use an Income item.");
    }
  }

  return {
    id: line.id ?? randomUUID(),
    amount,
    twdAmount,
    fxRate,
    categoryId: line.categoryId ?? null,
    budgetItemId: line.budgetItemId ?? null,
    note: blankToNull(line.note),
    sortOrder: index,
  };
}

/** Parses a positive amount, checking whole units when the currency is known. */
function positiveAmount(
  value: string,
  currency: Currency | undefined,
  field: string,
  add: (field: string, message: string) => void,
): string | null {
  const cents = parseMoney(value);
  if (cents <= 0n) {
    add(field, 'Amounts must be positive; the record type sets the direction.');
    return null;
  }
  if (currency && !wholeIfRequired(cents, currency)) add(field, `${currency} amounts must be whole.`);
  return formatMoney(cents);
}

function wholeIfRequired(cents: bigint, currency: Currency): boolean {
  try {
    assertValidAmount(cents, currency);
    return true;
  } catch {
    return false;
  }
}

function isRealDate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

function blankToNull(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null;
}

function toDto({ record: r, lines }: RecordWithLines): RecordDto {
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
