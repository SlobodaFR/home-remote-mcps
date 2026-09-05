import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  InstagramConnector,
  InstagramCredentials,
} from '../../domain/instagram/instagram-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  instagramServiceFor,
  normalizeInstagramAccountName,
} from '../credentials/save-instagram-connection.use-case';

export class InstagramNotConnectedError extends Error {
  constructor(accountName: string) {
    super(
      `No validated Instagram connection named "${accountName}" for this user. Connect it in the web UI first.`,
    );
  }
}

/**
 * Loads the user's stored Instagram credential for one named account and
 * runs a connector call against it. Mirrors HomeAssistantDataGateway, except
 * the credential lookup is keyed by (userId, accountName) instead of just
 * userId, since a user can have several Instagram accounts connected.
 */
@Injectable()
export class InstagramDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly instagramConnector: InstagramConnector,
  ) {}

  async run<T>(
    userId: string,
    accountName: string,
    call: (
      connector: InstagramConnector,
      credentials: InstagramCredentials,
    ) => Promise<T>,
  ): Promise<T> {
    const normalizedAccountName = normalizeInstagramAccountName(accountName);
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      instagramServiceFor(normalizedAccountName),
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new InstagramNotConnectedError(normalizedAccountName);
    }

    const credentials = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as InstagramCredentials;

    return call(this.instagramConnector, credentials);
  }
}
