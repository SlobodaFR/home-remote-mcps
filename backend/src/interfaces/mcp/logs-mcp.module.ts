import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogsDataGateway } from '../../application/mcp/logs-data-gateway';
import { ResolveUserFromApiKeyUseCase } from '../../application/mcp/resolve-user-from-api-key.use-case';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { ApiKeyOrmEntity } from '../../infrastructure/persistence/entities/api-key.orm-entity';
import { CredentialOrmEntity } from '../../infrastructure/persistence/entities/credential.orm-entity';
import { TypeOrmApiKeyRepository } from '../../infrastructure/persistence/repositories/typeorm-api-key.repository';
import { TypeOrmCredentialRepository } from '../../infrastructure/persistence/repositories/typeorm-credential.repository';
import { ApiKeyGuard } from '../http/guards/api-key.guard';
import { LogsMcpController } from './logs-mcp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyOrmEntity, CredentialOrmEntity])],
  controllers: [LogsMcpController],
  providers: [
    { provide: ApiKeyRepository, useClass: TypeOrmApiKeyRepository },
    { provide: CredentialRepository, useClass: TypeOrmCredentialRepository },
    ResolveUserFromApiKeyUseCase,
    LogsDataGateway,
    ApiKeyGuard,
  ],
})
export class LogsMcpModule {}
