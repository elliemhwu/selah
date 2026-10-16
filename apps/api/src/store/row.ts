import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import type { ExpressionBuilder } from 'kysely';
import type { Database } from '../database/database';

// Shared pieces of the row store (ADR 0029). Each table keeps rows in the
// shape the app stores them, deleted ones included (ADR 0007), and the store
// saves them as they are: the app ran the rules before sending them.

/** The columns every stored row has. */
export class StoredRowDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated (ADR 0007).' })
  @IsUUID('all')
  id!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  updatedAt!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true, description: 'Set when soft-deleted.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  deletedAt!: string | null;
}

/** How one table loads and saves its rows. */
export interface StoreTable<Row> {
  /** Every row, deleted ones included. */
  load(db: Database): Promise<Row[]>;
  /** Creates or replaces the rows, inside the caller's transaction. */
  save(trx: Database, rows: readonly Row[]): Promise<void>;
  /** Removes every row, for replacing everything (restoring a backup). */
  clear(trx: Database): Promise<void>;
}

export const iso = (value: Date): string => value.toISOString();
export const isoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);
/** TIME columns come back as 'HH:MM:SS'; the app keeps 'HH:MM'. */
export const hourMinute = (value: string | null): string | null => (value ? value.slice(0, 5) : null);
/** 'YYYY-MM-01' ⇄ 'YYYY-MM' */
export const toMonth = (firstOfMonth: string): string => firstOfMonth.slice(0, 7);
export const toFirstOfMonth = (month: string): string => `${month}-01`;

/**
 * The last row per id, soft-deleted rows first, so a row deleted in the same
 * save frees its unique name before another row takes it.
 */
export function inSaveOrder<Row extends { id: string; deletedAt?: string | Date | null }>(rows: readonly Row[]): Row[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const unique = [...byId.values()];
  return [...unique.filter((r) => r.deletedAt), ...unique.filter((r) => !r.deletedAt)];
}

/** For `onConflict(...).doUpdateSet(...)`: every given column takes the new row's value. */
export function fromExcluded(columns: readonly string[]) {
  // Kysely can't type a dynamic column list; the inserted rows' types check the column names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (eb: ExpressionBuilder<any, any>): any =>
    Object.fromEntries(columns.map((c) => [c, eb.ref(`excluded.${c}`)]));
}
