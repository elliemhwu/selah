import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsRepository } from './accounts/accounts.repository';
import { AccountsService } from './accounts/accounts.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesRepository } from './categories/categories.repository';
import { CategoriesService } from './categories/categories.service';
import {
  ActivePlanController,
  PlanVersionsController,
} from './plan/plan.controller';
import { PlanRepository } from './plan/plan.repository';
import { PlanService } from './plan/plan.service';
import {
  FxRatesController,
  RecordsController,
} from './records/records.controller';
import { RecordsRepository } from './records/records.repository';
import { RecordsService } from './records/records.service';

@Module({
  controllers: [
    AccountsController,
    CategoriesController,
    RecordsController,
    FxRatesController,
    PlanVersionsController,
    ActivePlanController,
  ],
  providers: [
    AccountsRepository,
    AccountsService,
    CategoriesRepository,
    CategoriesService,
    PlanRepository,
    PlanService,
    RecordsRepository,
    RecordsService,
  ],
})
export class FinanceModule {}
