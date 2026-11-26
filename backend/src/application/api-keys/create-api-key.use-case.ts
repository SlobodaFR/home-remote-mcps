import { randomBytes, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ApiKey } from '../../domain/api-key/api-key';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { hashToken } from '../../domain/shared/hash';
import { SecretHasher } from '../../domain/shared/secret-hasher';

export const KEY_PREFIX = 'hrm_';
/** `hrm_` + 32 random bytes in base64url: the only shape ever issued. */
export const API_KEY_PATTERN = /^hrm_[A-Za-z0-9_-]{43}$/;

export interface CreatedApiKey {
  id: string;
  rawKey: string;
  label: string;
  createdAt: Date;
}

/** Issues a new API key for a user. The raw key is returned once and never stored. */
@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly secretHasher: SecretHasher,
  ) {}

  async execute(userId: string, label: string): Promise<CreatedApiKey> {
    const rawKey = KEY_PREFIX + randomBytes(32).toString('base64url');
    const now = new Date();
    const apiKey = ApiKey.create({
      id: randomUUID(),
      userId,
      label,
      hashedKey: await this.secretHasher.hash(rawKey),
      lookupHash: hashToken(rawKey),
      createdAt: now,
    });
    await this.apiKeyRepository.save(apiKey);
    return {
      id: apiKey.id,
      rawKey,
      label: apiKey.label,
      createdAt: apiKey.createdAt,
    };
  }
}
