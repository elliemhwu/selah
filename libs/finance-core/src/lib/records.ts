import type { Currency, RecordType, Section } from '@selah/shared-types';
import {
  assertValidAmount,
  formatMoney,
  formatRate,
  isRecordCurrencyAllowed,
  isWholeUnit,
  parseMoney,
  parseRate,
  toTwd,
} from '@selah/shared-utils';
import { blankToNull, isRealDate } from './dates';
import { FieldErrorCollector } from './errors';

// Records and their lines (requirements §2, ADR 0013, 0014, 0016).

export interface RecordLineInput {
  /** Kept across edits; a new line without one gets a fresh id. */
  id?: string;
  amount: string;
  fxRate?: string | null;
  twdAmount?: string | null;
  categoryId?: string | null;
  budgetItemId?: string | null;
  note?: string | null;
}

export interface RecordInput {
  id: string;
  type: RecordType;
  occurredOn: string;
  occurredAt?: string | null;
  accountId: string;
  currency: Currency;
  counterAccountId?: string | null;
  counterAmount?: string | null;
  targetBalance?: string | null;
  note?: string | null;
  lines: RecordLineInput[];
}

/** A line checked and normalised, ready to store. */
export interface LineWrite {
  id: string;
  amount: string;
  twdAmount: string;
  fxRate: string | null;
  categoryId: string | null;
  budgetItemId: string | null;
  note: string | null;
  sortOrder: number;
}

/** A record checked and normalised, ready to store. */
export interface RecordWrite {
  id: string;
  type: RecordType;
  occurredOn: string;
  occurredAt: string | null;
  accountId: string;
  currency: Currency;
  counterAccountId: string | null;
  counterAmount: string | null;
  targetBalance: string | null;
  note: string | null;
  lines: LineWrite[];
}

/** The live accounts, categories and budget items the records refer to. */
export interface RecordLookups {
  accounts: ReadonlyMap<string, { currency: Currency }>;
  categories: ReadonlySet<string>;
  budgetItems: ReadonlyMap<string, { section: Section }>;
}

/** The ids `prepareRecords` needs looked up. */
export function referencedIds(inputs: readonly RecordInput[]): {
  accounts: string[];
  categories: string[];
  budgetItems: string[];
} {
  return {
    accounts: unique(inputs.flatMap((r) => [r.accountId, r.counterAccountId])),
    categories: unique(inputs.flatMap((r) => r.lines.map((l) => l.categoryId))),
    budgetItems: unique(inputs.flatMap((r) => r.lines.map((l) => l.budgetItemId))),
  };
}

/**
 * Checks records against every rule and normalises them, all or nothing.
 * Field errors are prefixed per record, e.g. `records.2.lines.0.amount` for
 * a batch (`prefix = i => \`records.${i}.\``) or `lines.0.amount` for one.
 * Throws a RuleViolationError listing every problem.
 */
export function prepareRecords(
  inputs: readonly RecordInput[],
  lookups: RecordLookups,
  prefix: (index: number) => string = () => '',
): RecordWrite[] {
  const errors = new FieldErrorCollector();
  const seenRecords = new Map<string, number>();
  const seenLines = new Set<string>();
  const writes = inputs.map((input, index) => {
    const add = errors.nested(prefix(index));
    if (seenRecords.has(input.id)) add.add('id', `Duplicate record id (also at index ${seenRecords.get(input.id)}).`);
    seenRecords.set(input.id, index);
    const write = toWrite(input, lookups, add);
    write.lines.forEach((line, j) => {
      if (seenLines.has(line.id)) add.add(`lines.${j}.id`, 'Duplicate line id.');
      seenLines.add(line.id);
    });
    return write;
  });
  errors.throwIfAny('The request breaks finance rules.');
  return writes;
}

/** Checks one record against the rules and converts it to rows. */
function toWrite(input: RecordInput, lookups: RecordLookups, errors: FieldErrorCollector): RecordWrite {
  const add = (field: string, message: string) => errors.add(field, message);
  const type = input.type;
  const currency = input.currency;

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
  lookups: RecordLookups,
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
    id: line.id ?? globalThis.crypto.randomUUID(),
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

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

// ---- Lists, as the API's queries return them -------------------------------

/** The fields the list helpers read. */
export interface ListedRecord {
  type: RecordType;
  occurredOn: string;
  occurredAt: string | null;
  accountId: string;
  counterAccountId: string | null;
  currency: Currency;
  createdAt: string;
  lines: readonly { fxRate: string | null; categoryId: string | null; budgetItemId: string | null }[];
}

export interface RecordFilters {
  from: string;
  to: string;
  /** Either side of a transfer. */
  accountId?: string;
  /** Any line. */
  categoryId?: string;
  /** Any line. */
  budgetItemId?: string;
  type?: RecordType;
}

/** True if the record is in the date range and matches every filter given. */
export function matchesRecordFilters(record: ListedRecord, filters: RecordFilters): boolean {
  if (record.occurredOn < filters.from || record.occurredOn > filters.to) return false;
  if (filters.type && record.type !== filters.type) return false;
  if (filters.accountId && record.accountId !== filters.accountId && record.counterAccountId !== filters.accountId) {
    return false;
  }
  if (filters.categoryId && !record.lines.some((l) => l.categoryId === filters.categoryId)) return false;
  if (filters.budgetItemId && !record.lines.some((l) => l.budgetItemId === filters.budgetItemId)) return false;
  return true;
}

/** Newest first; a record without a time counts as the end of its day (ADR 0014). */
export function compareRecordsNewestFirst(a: ListedRecord, b: ListedRecord): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn > b.occurredOn ? -1 : 1;
  if (a.occurredAt !== b.occurredAt) {
    if (a.occurredAt === null) return -1;
    if (b.occurredAt === null) return 1;
    return a.occurredAt > b.occurredAt ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
  return 0;
}

export interface LastUsedRate {
  currency: Currency;
  rate: string;
  occurredOn: string;
}

/** The most recent rate used per foreign currency, by currency (requirements §2). */
export function lastUsedRates(records: readonly ListedRecord[]): LastUsedRate[] {
  const latest = new Map<Currency, LastUsedRate>();
  for (const record of [...records].sort(compareRecordsNewestFirst)) {
    const rate = record.lines.find((l) => l.fxRate !== null)?.fxRate;
    if (rate && !latest.has(record.currency)) {
      latest.set(record.currency, { currency: record.currency, rate, occurredOn: record.occurredOn });
    }
  }
  return [...latest.values()].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
}
