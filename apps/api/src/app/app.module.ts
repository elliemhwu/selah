import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { DatabaseModule } from '../database/database.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [DatabaseModule, HealthModule, CoreModule, FinanceModule],
})
export class AppModule {}
