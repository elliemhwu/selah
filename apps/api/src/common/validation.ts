import { applyDecorators } from '@nestjs/common';
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Request-shape validators for the API's string formats (ADR 0006, 0014, 0017).

/** Up to 12 integer digits and 2 decimals, matching NUMERIC(14,2). */
const MONEY = /^-?\d{1,12}(\.\d{1,2})?$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function IsMoney(options: ApiPropertyOptions = {}) {
  return applyDecorators(
    Matches(MONEY, { message: '$property must be a decimal string with up to 2 decimals' }),
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
    ApiProperty({ type: 'string', format: 'date', example: '2026-10-06', ...options } as ApiPropertyOptions),
  );
}
