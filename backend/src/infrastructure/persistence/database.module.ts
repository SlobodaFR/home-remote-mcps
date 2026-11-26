import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';
import { SchemaGuard } from './schema-guard';
import { serializedDataSourceFactory } from './serialized-connection';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3' as const,
        database: config.get<string>(
          'DATABASE_PATH',
          'data/home-remote-mcps.sqlite',
        ),
        // Do not enable TypeORM's `logging`: its console logger prints query parameters (emails,
        // names, encrypted credentials) to stdout, bypassing the pino whitelist serializer.
        enableWAL: true,
        entities: ENTITIES,
        // Schema changes only through reviewed migrations: synchronize could rebuild a SQLite
        // table and drop data, which Litestream would then replicate.
        synchronize: false,
        migrations: MIGRATIONS,
        migrationsRun: true,
      }),
      // Before initialize(): migrations and the app run on the serialized connection
      // (convention sqlite-serialized-transactions).
      dataSourceFactory: serializedDataSourceFactory,
    }),
  ],
  providers: [SchemaGuard],
})
export class DatabaseModule {}
