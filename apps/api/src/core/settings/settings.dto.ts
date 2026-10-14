import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency, ISO_WEEKDAYS, type IsoWeekday } from '@selah/shared-types';
import { IsIn, IsInt, Max, Min } from 'class-validator';

const WEEK_START_DAY = {
  type: 'integer',
  enum: [...ISO_WEEKDAYS],
  example: 1,
  description: 'ISO day of week: 1 = Monday … 7 = Sunday.',
} as const;

export class SettingsDto {
  @ApiProperty(WEEK_START_DAY)
  weekStartDay!: IsoWeekday;

  @ApiProperty({
    enum: CURRENCIES,
    enumName: 'Currency',
    description: 'Preselected for new accounts and entries. Reports stay in TWD.',
  })
  defaultCurrency!: Currency;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: 'string',
    description: 'Null until the settings are first saved; the defaults apply until then.',
  })
  updatedAt!: string | null;
}

export class UpdateSettingsDto {
  @ApiProperty(WEEK_START_DAY)
  @IsInt()
  @Min(1)
  @Max(7)
  weekStartDay!: IsoWeekday;

  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' })
  @IsIn(CURRENCIES)
  defaultCurrency!: Currency;
}
