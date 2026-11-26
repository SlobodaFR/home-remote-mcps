import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';

/**
 * Logs once at startup how many active API keys still have no lookup hash (issued before it
 * existed, never used since). Each costs an asynchronous scrypt check for unknown keys until it
 * is used once or revoked: the owner can use or revoke-and-reissue them.
 */
@Injectable()
export class LegacyApiKeyAudit implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyApiKeyAudit.name);

  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const legacy = await this.apiKeyRepository.listActiveWithoutLookupHash();
      this.logger.log(
        `active API keys without lookup hash (legacy, migrated on first use): ${legacy.length}`,
      );
    } catch (error) {
      this.logger.warn(
        `legacy API key audit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
