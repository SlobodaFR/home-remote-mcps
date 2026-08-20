import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Credential,
  CredentialStatus,
} from '../../../domain/credential/credential';
import { CredentialRepository } from '../../../domain/credential/credential.repository';
import { CredentialOrmEntity } from '../entities/credential.orm-entity';

@Injectable()
export class TypeOrmCredentialRepository extends CredentialRepository {
  constructor(
    @InjectRepository(CredentialOrmEntity)
    private readonly repository: Repository<CredentialOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<Credential | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByUserAndService(
    userId: string,
    service: string,
  ): Promise<Credential | null> {
    const row = await this.repository.findOne({ where: { userId, service } });
    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string): Promise<Credential[]> {
    const rows = await this.repository.find({ where: { userId } });
    return rows.map(toDomain);
  }

  async save(credential: Credential): Promise<void> {
    await this.repository.save({
      id: credential.id,
      userId: credential.userId,
      service: credential.service,
      status: credential.status,
      encryptedTokens: credential.encryptedTokens,
      lastError: credential.lastError,
      lastTestedAt: credential.lastTestedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

function toDomain(row: CredentialOrmEntity): Credential {
  return Credential.restore({
    id: row.id,
    userId: row.userId,
    service: row.service,
    status: row.status as CredentialStatus,
    encryptedTokens: row.encryptedTokens,
    lastError: row.lastError,
    lastTestedAt: row.lastTestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
