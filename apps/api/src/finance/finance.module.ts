import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsRepository } from './accounts/accounts.repository';
import { AccountsService } from './accounts/accounts.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesRepository } from './categories/categories.repository';
import { CategoriesService } from './categories/categories.service';
import { RecordsRepository } from './records/records.repository';

@Module({
  controllers: [AccountsController, CategoriesController],
  providers: [
    AccountsRepository,
    AccountsService,
    CategoriesRepository,
    CategoriesService,
    RecordsRepository,
  ],
})
export class FinanceModule {}
