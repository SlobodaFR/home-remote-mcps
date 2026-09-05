import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { MarkitdownConnector } from '../../domain/markitdown/markitdown-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const MARKITDOWN_SERVICE = 'markitdown';

export type SaveMarkitdownConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * There is nothing for the user to enter - MarkItDown is a stateless
 * conversion service, no login/token/base path. This just pings the
 * markitdown-connector sidecar and, on success, creates/validates a
 * `Credential` row with an empty payload so the service still gets a card
 * on the Credentials page and an MCP link, same as every other integration.
 * Mirrors SaveLogsConnectionUseCase.
 */
@Injectable()
export class SaveMarkitdownConnectionUseCase {
  constructor(
    private readonly markitdownConnector: MarkitdownConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(userId: string): Promise<SaveMarkitdownConnectionResult> {
    const result = await this.markitdownConnector.testConnection();
    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }

    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      MARKITDOWN_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: MARKITDOWN_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(this.credentialCrypto.encrypt('{}'), now);
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
