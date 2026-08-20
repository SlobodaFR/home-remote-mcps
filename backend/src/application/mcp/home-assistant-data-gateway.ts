import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  HomeAssistantConnector,
  HomeAssistantCredentials,
} from '../../domain/home-assistant/home-assistant-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { HOME_ASSISTANT_SERVICE } from '../credentials/save-home-assistant-connection.use-case';

export class HomeAssistantNotConnectedError extends Error {
  constructor() {
    super(
      'No validated Home Assistant connection for this user. Connect Home Assistant in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored Home Assistant base URL + token and runs a
 * connector call against them. Mirrors GarminDataGateway; no token rotation
 * needed since a long-lived access token doesn't expire on its own.
 */
@Injectable()
export class HomeAssistantDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly homeAssistantConnector: HomeAssistantConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: HomeAssistantConnector,
      credentials: HomeAssistantCredentials,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      HOME_ASSISTANT_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new HomeAssistantNotConnectedError();
    }

    const credentials = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as HomeAssistantCredentials;

    return call(this.homeAssistantConnector, credentials);
  }
}
