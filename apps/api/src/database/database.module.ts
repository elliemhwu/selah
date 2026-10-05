import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createDatabase, type Database } from './database';

export const DATABASE = Symbol('DATABASE');

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => {
        const url = process.env['DATABASE_URL'];
        if (!url) {
          throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
        }
        return createDatabase(url);
      },
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
