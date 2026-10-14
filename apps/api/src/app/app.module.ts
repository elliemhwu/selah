import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [DatabaseModule, HealthModule, FinanceModule],
})
export class AppModule {}
