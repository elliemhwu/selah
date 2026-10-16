import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthModule } from '../health/health.module';
import { StoreModule } from '../store/store.module';

@Module({
  imports: [DatabaseModule, HealthModule, StoreModule],
})
export class AppModule {}
