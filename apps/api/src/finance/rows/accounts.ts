import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_TYPES, type AccountType, CURRENCIES, type Currency } from '@selah/shared-types';
import { IsIn, IsInt, IsString, MaxLength } from 'class-validator';
import { IsMoney } from '../../common/validation';
import { fromExcluded, inSaveOrder, iso, isoOrNull, StoredRowDto, type StoreTable } from '../../store/row';

/** An account as the app stores it; the balance is calculated, not stored (ADR 0011). */
export class AccountRowDto extends StoredRowDto {
  @ApiProperty({ maxLength: 100, example: 'Wallet' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @IsMoney()
  openingBalance!: string;

  @ApiProperty()
  @IsInt()
  sortOrder!: number;
}

const COLUMNS = ['name', 'type', 'currency', 'openingBalance', 'sortOrder', 'createdAt', 'updatedAt', 'deletedAt'] as const;

export const accountsTable: StoreTable<AccountRowDto> = {
  async load(db) {
    const rows = await db.selectFrom('finance.accounts').selectAll().orderBy('id').execute();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as AccountType,
      currency: r.currency as Currency,
      openingBalance: r.openingBalance,
      sortOrder: r.sortOrder,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      deletedAt: isoOrNull(r.deletedAt),
    }));
  },

  async save(trx, rows) {
    if (rows.length === 0) return;
    await trx
      .insertInto('finance.accounts')
      .values(inSaveOrder(rows))
      .onConflict((oc) => oc.column('id').doUpdateSet(fromExcluded(COLUMNS)))
      .execute();
  },

  async clear(trx) {
    await trx.deleteFrom('finance.accounts').execute();
  },
};
