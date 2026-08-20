import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  GarminConnector,
  GarminDataResult,
} from '../../domain/garmin/garmin-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { GARMIN_SERVICE } from '../credentials/start-garmin-login.use-case';

export class GarminNotConnectedError extends Error {
  constructor() {
    super(
      'No validated Garmin credential for this user. Connect Garmin in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored Garmin session tokens, runs a connector call
 * against them, and persists any rotated tokens the sidecar hands back -
 * so a live MCP call transparently keeps the vault's tokens fresh instead
 * of silently letting them go stale.
 */
@Injectable()
export class GarminDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly garminConnector: GarminConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: GarminConnector,
      tokensJson: string,
    ) => Promise<GarminDataResult<T>>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      GARMIN_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new GarminNotConnectedError();
    }

    const tokensJson = this.credentialCrypto.decrypt(
      credential.encryptedTokens,
    );
    const result = await call(this.garminConnector, tokensJson);

    if (result.refreshedTokensJson) {
      credential.markValidated(
        this.credentialCrypto.encrypt(result.refreshedTokensJson),
        new Date(),
      );
      await this.credentialRepository.save(credential);
    }

    return result.data;
  }
}
