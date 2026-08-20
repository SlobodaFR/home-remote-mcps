import { randomBytes, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ApiKey } from '../../domain/api-key/api-key';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { hashSecret } from '../../domain/shared/hash';

const KEY_PREFIX = 'hrm_';

export interface CreatedApiKey {
  id: string;
  rawKey: string;
  label: string;
  createdAt: Date;
}

/** Issues a new API key for a user. The raw key is returned once and never stored. */
@Injectable()
export class CreateApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(userId: string, label: string): Promise<CreatedApiKey> {
    const rawKey = KEY_PREFIX + randomBytes(32).toString('base64url');
    const now = new Date();
    const apiKey = ApiKey.create({
      id: randomUUID(),
      userId,
      label,
      hashedKey: hashSecret(rawKey),
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
