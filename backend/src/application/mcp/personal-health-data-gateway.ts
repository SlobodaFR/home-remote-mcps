import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  PersonalHealthConnector,
  PersonalHealthCredentials,
} from '../../domain/personal-health/personal-health-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { PERSONAL_HEALTH_SERVICE } from '../credentials/save-personal-health-connection.use-case';

export class PersonalHealthNotConnectedError extends Error {
  constructor() {
    super(
      'No validated personal-health connection for this user. Connect health.sloboda.fr in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored health.sloboda.fr API key and runs a connector
 * call against it. Mirrors HomeAssistantDataGateway; no token rotation
 * needed since the key doesn't expire on its own.
 */
@Injectable()
export class PersonalHealthDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly personalHealthConnector: PersonalHealthConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: PersonalHealthConnector,
      credentials: PersonalHealthCredentials,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      PERSONAL_HEALTH_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new PersonalHealthNotConnectedError();
    }

    const credentials = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as PersonalHealthCredentials;

    return call(this.personalHealthConnector, credentials);
  }
}
