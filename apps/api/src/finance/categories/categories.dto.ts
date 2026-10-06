import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Food' })
  name!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: 'string' })
  parentId!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class UpsertCategoryDto {
  @ApiProperty({ maxLength: 100, example: 'Food' })
  @IsString()
  @Matches(/\S/, { message: 'name must not be blank' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: 'string' })
  @IsOptional()
  @IsUUID('all')
  parentId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
