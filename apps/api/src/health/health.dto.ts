import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok'], description: 'The API process is running.' })
  status!: 'ok';

  @ApiProperty({
    enum: ['ok', 'unavailable'],
    description: 'Whether the database answered a trivial query.',
  })
  database!: 'ok' | 'unavailable';
}
