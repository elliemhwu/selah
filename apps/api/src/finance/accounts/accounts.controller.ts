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
import { AccountDto, UpsertAccountDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@ApiTags('finance: accounts')
@Controller('finance/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ operationId: 'listAccounts', summary: 'Accounts with their derived balances' })
  @ApiOkResponse({ type: AccountDto, isArray: true })
  list(): Promise<AccountDto[]> {
    return this.accounts.list();
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getAccount', summary: 'One account with its derived balance' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AccountDto })
  @ApiProblems(400, 404)
  get(@Param('id', UUID_PARAM) id: string): Promise<AccountDto> {
    return this.accounts.get(id);
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'upsertAccount',
    summary: 'Create or replace an account (the client generates the id)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AccountDto, description: 'Replaced.' })
  @ApiCreatedResponse({ type: AccountDto, description: 'Created.' })
  @ApiProblems(400, 409, 422)
  async upsert(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: UpsertAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountDto> {
    const { account, created } = await this.accounts.upsert(id, body);
    response.status(created ? 201 : 200);
    return account;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteAccount', summary: 'Soft-delete an account without records' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted (or already deleted).' })
  @ApiProblems(400, 404, 409)
  remove(@Param('id', UUID_PARAM) id: string): Promise<void> {
    return this.accounts.remove(id);
  }
}
