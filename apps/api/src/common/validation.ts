import { applyDecorators } from '@nestjs/common';
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Request-shape validators for the API's string formats (ADR 0006, 0014, 0017).

/** Up to 12 integer digits and 2 decimals, matching NUMERIC(14,2). */
const MONEY = /^-?\d{1,12}(\.\d{1,2})?$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 0–100 with up to 4 decimals, matching NUMERIC(7,4). */
const PERCENT = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;
/** Up to 10 integer digits and 8 decimals, matching NUMERIC(18,8). */
const RATE = /^\d{1,10}(\.\d{1,8})?$/;

export function IsMoney(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(MONEY, {
      message: '$property must be a decimal string with up to 2 decimals',
    }),
    ApiProperty({
      type: 'string',
      pattern: MONEY.source,
      example: '1234.00',
      ...options,
    } as ApiPropertyOptions),
  );
}

export function IsLocalDate(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(LOCAL_DATE, { message: '$property must be a date as YYYY-MM-DD' }),
    ApiProperty({
      type: 'string',
      format: 'date',
      example: '2026-10-06',
      ...options,
    } as ApiPropertyOptions),
  );
}

export function IsLocalTime(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(LOCAL_TIME, { message: '$property must be a time as HH:MM' }),
    ApiProperty({
      type: 'string',
      pattern: LOCAL_TIME.source,
      example: '12:30',
      ...options,
    } as ApiPropertyOptions),
  );
}

export function IsRate(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(RATE, {
      message: '$property must be a positive decimal with up to 8 decimals',
    }),
    ApiProperty({
      type: 'string',
      pattern: RATE.source,
      example: '0.2083',
      description: 'TWD per 1 unit of the record currency.',
      ...options,
    } as ApiPropertyOptions),
  );
}

export function IsYearMonth(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(YEAR_MONTH, { message: '$property must be a month as YYYY-MM' }),
    ApiProperty({
      type: 'string',
      pattern: YEAR_MONTH.source,
      example: '2026-10',
      ...options,
    } as ApiPropertyOptions),
  );
}

export function IsPercent(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(PERCENT, {
      message:
        '$property must be a percentage from 0 to 100 with up to 4 decimals',
    }),
    ApiProperty({
      type: 'string',
      pattern: PERCENT.source,
      example: '12.5',
      description: 'Percentage points: "12.5" means 12.5%.',
      ...options,
    } as ApiPropertyOptions),
  );
}
