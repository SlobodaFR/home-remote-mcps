import { Injectable } from '@nestjs/common';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { verifySecret } from '../../domain/shared/hash';

/**
 * Resolves the raw API key an MCP client (e.g. Claude) sends as a Bearer
 * token to the user who issued it. Keys are hashed at rest (scrypt, salted
 * per key), so this scans active keys and does a constant-time compare
 * against each - fine at personal scale (a handful of keys).
 */
@Injectable()
export class ResolveUserFromApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(rawKey: string): Promise<{ userId: string } | null> {
    const activeKeys = await this.apiKeyRepository.listActive();
    const match = activeKeys.find((key) => verifySecret(rawKey, key.hashedKey));
    if (!match) {
      return null;
    }
    match.markUsed(new Date());
    await this.apiKeyRepository.save(match);
    return { userId: match.userId };
  }
}
