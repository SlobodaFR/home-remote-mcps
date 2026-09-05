import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarkitdownGateway } from '../../application/mcp/markitdown-gateway';
import { ResolveUserFromApiKeyUseCase } from '../../application/mcp/resolve-user-from-api-key.use-case';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { ApiKeyOrmEntity } from '../../infrastructure/persistence/entities/api-key.orm-entity';
import { TypeOrmApiKeyRepository } from '../../infrastructure/persistence/repositories/typeorm-api-key.repository';
import { ApiKeyGuard } from '../http/guards/api-key.guard';
import { MarkitdownMcpController } from './markitdown-mcp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyOrmEntity])],
  controllers: [MarkitdownMcpController],
  providers: [
    { provide: ApiKeyRepository, useClass: TypeOrmApiKeyRepository },
    ResolveUserFromApiKeyUseCase,
    MarkitdownGateway,
    ApiKeyGuard,
  ],
})
export class MarkitdownMcpModule {}
