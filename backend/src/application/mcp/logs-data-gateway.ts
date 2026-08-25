import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  LogsConnector,
  LogsCredentials,
} from '../../domain/logs/log-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { LOGS_SERVICE } from '../credentials/save-logs-connection.use-case';

export class LogsNotConnectedError extends Error {
  constructor() {
    super(
      'No validated logs connection for this user. Connect the MinIO log base path in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored MinIO log base path and runs a connector call
 * against it. Mirrors PersonalHealthDataGateway; no token rotation needed
 * since there's no token here, just a bucket prefix.
 */
@Injectable()
export class LogsDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly logsConnector: LogsConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: LogsConnector,
      credentials: LogsCredentials,
    ) => Promise<T>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      LOGS_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new LogsNotConnectedError();
    }

    const credentials = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as LogsCredentials;

    return call(this.logsConnector, credentials);
  }
}
