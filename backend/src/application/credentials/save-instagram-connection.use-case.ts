import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { InstagramConnector } from '../../domain/instagram/instagram-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

const INSTAGRAM_SERVICE_PREFIX = 'instagram:';
const ACCOUNT_NAME_PATTERN = /^[a-z0-9_.]{1,64}$/;

/**
 * Unlike every other integration, a user can hold several Instagram
 * credentials at once (one per Instagram professional account), so "service"
 * alone can't identify one - it's namespaced by a user-chosen account name,
 * which also becomes the last URL path segment MCP clients call
 * (/api/mcp/instagram/<apiKey>/<accountName>).
 */
export function instagramServiceFor(accountName: string): string {
  return `${INSTAGRAM_SERVICE_PREFIX}${accountName}`;
}

export function isInstagramService(service: string): boolean {
  return service.startsWith(INSTAGRAM_SERVICE_PREFIX);
}

export function instagramAccountNameOf(service: string): string {
  return service.slice(INSTAGRAM_SERVICE_PREFIX.length);
}

export function normalizeInstagramAccountName(accountName: string): string {
  return accountName.trim().toLowerCase();
}

export type SaveInstagramConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Resolves the Facebook Page + linked Instagram professional account for the
 * access token the user just typed in the form, and only persists the
 * credential (keyed by the chosen account name) if that resolution succeeds
 * - mirrors SaveHomeAssistantConnectionUseCase, but keyed by an extra
 * account-name segment instead of one fixed service string.
 */
@Injectable()
export class SaveInstagramConnectionUseCase {
  constructor(
    private readonly instagramConnector: InstagramConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    accountName: string,
    accessToken: string,
  ): Promise<SaveInstagramConnectionResult> {
    const normalizedAccountName = normalizeInstagramAccountName(accountName);
    if (!ACCOUNT_NAME_PATTERN.test(normalizedAccountName)) {
      return {
        status: 'error',
        message:
          'Account name must be 1-64 characters, lowercase letters/digits/dots/underscores only (it becomes part of the MCP URL).',
      };
    }

    const result = await this.instagramConnector.resolveAccount(accessToken);
    if (result.status === 'error') {
      return result;
    }

    const service = instagramServiceFor(normalizedAccountName);
    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      service,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(
      this.credentialCrypto.encrypt(
        JSON.stringify({
          accessToken,
          pageId: result.pageId,
          igUserId: result.igUserId,
          igUsername: result.igUsername,
        }),
      ),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
