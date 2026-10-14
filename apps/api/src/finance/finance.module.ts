import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsRepository } from './accounts/accounts.repository';
import { AccountsService } from './accounts/accounts.service';
import { BudgetTransfersController } from './budget-transfers/budget-transfers.controller';
import { BudgetTransfersRepository } from './budget-transfers/budget-transfers.repository';
import { BudgetTransfersService } from './budget-transfers/budget-transfers.service';
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
import { ReportsController } from './reports/reports.controller';
import { ReportsRepository } from './reports/reports.repository';
import { ReportsService } from './reports/reports.service';

@Module({
  controllers: [
    AccountsController,
    CategoriesController,
    RecordsController,
    FxRatesController,
    PlanVersionsController,
    ActivePlanController,
    BudgetTransfersController,
    ReportsController,
  ],
  providers: [
    AccountsRepository,
    AccountsService,
    BudgetTransfersRepository,
    BudgetTransfersService,
    CategoriesRepository,
    CategoriesService,
    PlanRepository,
    PlanService,
    RecordsRepository,
    RecordsService,
    ReportsRepository,
    ReportsService,
  ],
})
export class FinanceModule {}
