import { Injectable } from '@nestjs/common';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { hashToken } from '../../domain/shared/hash';
import { SecretHasher } from '../../domain/shared/secret-hasher';
import { API_KEY_PATTERN } from '../api-keys/create-api-key.use-case';

/**
 * Resolves the raw API key an MCP client (e.g. Claude) puts in the URL to the user who issued
 * it. Keys are 256 random bits, so they are found by equality on their sha256 (indexed
 * `lookup_hash`): no scrypt on the hot path, and an unknown key costs one indexed query.
 *
 * Keys issued before `lookup_hash` existed only have a scrypt hash. They stay valid through a
 * fallback that checks just those rows with asynchronous scrypt (never blocking the event loop,
 * capped in flight by the hasher) and backfills their lookup hash, so each is migrated on first
 * use. Revoke-and-reissue is the clean way to retire a legacy key that is never used.
 *
 * Writes are targeted conditional UPDATEs: a revocation landing while a (slow) legacy check is
 * running can never be overwritten by a stale snapshot of the row.
 */
@Injectable()
export class ResolveUserFromApiKeyUseCase {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly secretHasher: SecretHasher,
  ) {}

  async execute(rawKey: string): Promise<{ userId: string } | null> {
    if (!API_KEY_PATTERN.test(rawKey)) {
      return null;
    }
    const lookupHash = hashToken(rawKey);

    const found =
      await this.apiKeyRepository.findActiveByLookupHash(lookupHash);
    if (found) {
      return this.markUsed(found.id, found.userId);
    }

    for (const legacy of await this.apiKeyRepository.listActiveWithoutLookupHash()) {
      if (await this.secretHasher.verify(rawKey, legacy.hashedKey)) {
        await this.apiKeyRepository.backfillLookupHash(legacy.id, lookupHash);
        return this.markUsed(legacy.id, legacy.userId);
      }
    }
    return null;
  }

  private async markUsed(
    id: string,
    userId: string,
  ): Promise<{ userId: string } | null> {
    // false = revoked meanwhile.
    return (await this.apiKeyRepository.touchIfActive(id, new Date()))
      ? { userId }
      : null;
  }
}
