import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyOrmEntity } from './entities/api-key.orm-entity';
import { CredentialOrmEntity } from './entities/credential.orm-entity';
import { RevokedSessionOrmEntity } from './entities/revoked-session.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';

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
        enableWAL: true,
        entities: [
          UserOrmEntity,
          RevokedSessionOrmEntity,
          CredentialOrmEntity,
          ApiKeyOrmEntity,
        ],
        synchronize: true,
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
