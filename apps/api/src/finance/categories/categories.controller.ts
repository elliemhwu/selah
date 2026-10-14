import { Body, Controller, Delete, Get, HttpCode, Param, Put, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiProblems } from '../../common/api-problems.decorator';
import { UUID_PARAM } from '../../common/uuid-param';
import { CategoryDto, UpsertCategoryDto } from './categories.dto';
import { CategoriesService } from './categories.service';

@ApiTags('finance: categories')
@Controller('finance/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ operationId: 'listCategories', summary: 'All categories as a flat list (tree via parentId)' })
  @ApiOkResponse({ type: CategoryDto, isArray: true })
  list(): Promise<CategoryDto[]> {
    return this.categories.list();
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getCategory', summary: 'One category' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiProblems(400, 404)
  get(@Param('id', UUID_PARAM) id: string): Promise<CategoryDto> {
    return this.categories.get(id);
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'upsertCategory',
    summary: 'Create or replace a category (the client generates the id)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryDto, description: 'Replaced.' })
  @ApiCreatedResponse({ type: CategoryDto, description: 'Created.' })
  @ApiProblems(400, 409, 422)
  async upsert(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpsertCategoryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryDto> {
    const { category, created } = await this.categories.upsert(id, body);
    response.status(created ? 201 : 200);
    return category;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteCategory', summary: 'Soft-delete a category without subcategories' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted (or already deleted).' })
  @ApiProblems(400, 404, 409)
  remove(@Param('id', UUID_PARAM) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
