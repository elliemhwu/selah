import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ACCOUNT_TYPES,
  type AccountType,
  CURRENCIES,
  type Currency,
} from '@selah/shared-types';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsMoney } from '../../common/validation';

export class AccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Wallet' })
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  type!: AccountType;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  currency!: Currency;

  @ApiProperty({ type: 'string', example: '1000.00' })
  openingBalance!: string;

  @ApiProperty({
    type: 'string',
    example: '850.00',
    description: 'Derived from the opening balance and all records (ADR 0011).',
  })
  balance!: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class UpsertAccountDto {
  @ApiProperty({ maxLength: 100, example: 'Wallet' })
  @IsString()
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  @IsIn(CURRENCIES)
  currency!: Currency;

  @IsMoney({ description: 'May be negative, e.g. a credit card that starts with debt.' })
  openingBalance!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
