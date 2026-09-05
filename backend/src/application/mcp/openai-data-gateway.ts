import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  OpenAiConnector,
  OpenAiCredentials,
} from '../../domain/openai/openai-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  normalizeOpenAiConnectionName,
  openaiServiceFor,
} from '../credentials/save-openai-connection.use-case';

export class OpenAiNotConnectedError extends Error {
  constructor(connectionName: string) {
    super(
      `No validated OpenAI connection named "${connectionName}" for this user. Connect it in the web UI first.`,
    );
  }
}

/**
 * Loads the user's stored OpenAI credential for one named connection and
 * runs a connector call against it. Mirrors InstagramDataGateway: the
 * credential lookup is keyed by (userId, connectionName) instead of just
 * userId, since a user can have several OpenAI API keys connected.
 */
@Injectable()
export class OpenAiDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly openAiConnector: OpenAiConnector,
  ) {}

  async run<T>(
    userId: string,
    connectionName: string,
    call: (
      connector: OpenAiConnector,
      credentials: OpenAiCredentials,
    ) => Promise<T>,
  ): Promise<T> {
    const normalizedConnectionName =
      normalizeOpenAiConnectionName(connectionName);
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      openaiServiceFor(normalizedConnectionName),
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new OpenAiNotConnectedError(normalizedConnectionName);
    }

    const credentials = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as OpenAiCredentials;

    return call(this.openAiConnector, credentials);
  }
}
