import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateApiKeyUseCase } from '../../../application/api-keys/create-api-key.use-case';
import { ListApiKeysUseCase } from '../../../application/api-keys/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../../application/api-keys/revoke-api-key.use-case';
import { ApiKeyRepository } from '../../../domain/api-key/api-key.repository';
import { ApiKeyOrmEntity } from '../../../infrastructure/persistence/entities/api-key.orm-entity';
import { TypeOrmApiKeyRepository } from '../../../infrastructure/persistence/repositories/typeorm-api-key.repository';
import { ApiKeysController } from '../controllers/api-keys.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyOrmEntity])],
  controllers: [ApiKeysController],
  providers: [
    { provide: ApiKeyRepository, useClass: TypeOrmApiKeyRepository },
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
  ],
  exports: [ApiKeyRepository],
})
export class ApiKeysModule {}
