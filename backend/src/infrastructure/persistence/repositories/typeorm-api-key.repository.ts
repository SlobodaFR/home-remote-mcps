import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ApiKey } from '../../../domain/api-key/api-key';
import { ApiKeyRepository } from '../../../domain/api-key/api-key.repository';
import { ApiKeyOrmEntity } from '../entities/api-key.orm-entity';

@Injectable()
export class TypeOrmApiKeyRepository extends ApiKeyRepository {
  constructor(
    @InjectRepository(ApiKeyOrmEntity)
    private readonly repository: Repository<ApiKeyOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<ApiKey | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string): Promise<ApiKey[]> {
    const rows = await this.repository.find({ where: { userId } });
    return rows.map(toDomain);
  }

  async findActiveByLookupHash(lookupHash: string): Promise<ApiKey | null> {
    const row = await this.repository.findOne({
      where: { lookupHash, revokedAt: IsNull() },
    });
    return row ? toDomain(row) : null;
  }

  async listActiveWithoutLookupHash(): Promise<ApiKey[]> {
    const rows = await this.repository.find({
      where: { lookupHash: IsNull(), revokedAt: IsNull() },
    });
    return rows.map(toDomain);
  }

  async touchIfActive(id: string, now: Date): Promise<boolean> {
    const result = await this.repository.update(
      { id, revokedAt: IsNull() },
      { lastUsedAt: now },
    );
    return (result.affected ?? 0) > 0;
  }

  async backfillLookupHash(id: string, lookupHash: string): Promise<void> {
    await this.repository.update(
      { id, revokedAt: IsNull(), lookupHash: IsNull() },
      { lookupHash },
    );
  }

  async save(apiKey: ApiKey): Promise<void> {
    await this.repository.save({
      id: apiKey.id,
      userId: apiKey.userId,
      label: apiKey.label,
      hashedKey: apiKey.hashedKey,
      lookupHash: apiKey.lookupHash,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      revokedAt: apiKey.revokedAt,
    });
  }
}

function toDomain(row: ApiKeyOrmEntity): ApiKey {
  return ApiKey.restore({
    id: row.id,
    userId: row.userId,
    label: row.label,
    hashedKey: row.hashedKey,
    lookupHash: row.lookupHash,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  });
}
