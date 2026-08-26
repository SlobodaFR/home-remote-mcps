import { Injectable } from '@nestjs/common';
import {
  CookidooConnector,
  CookidooDataResult,
} from '../../domain/cookidoo/cookidoo-connector';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  COOKIDOO_SERVICE,
  CookidooCredentialPayload,
} from '../credentials/save-cookidoo-connection.use-case';

export class CookidooNotConnectedError extends Error {
  constructor() {
    super(
      'No validated Cookidoo credential for this user. Connect Cookidoo in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored Cookidoo session cookies, runs a connector call
 * against them, and persists any rotated cookies the sidecar hands back -
 * so a live MCP call transparently keeps the vault's session fresh instead
 * of silently letting it go stale.
 */
@Injectable()
export class CookidooDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly cookidooConnector: CookidooConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: CookidooConnector,
      payload: CookidooCredentialPayload,
    ) => Promise<CookidooDataResult<T>>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      COOKIDOO_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new CookidooNotConnectedError();
    }

    const payload = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as CookidooCredentialPayload;
    const result = await call(this.cookidooConnector, payload);

    if (result.refreshedCookiesJson) {
      const refreshedPayload: CookidooCredentialPayload = {
        cookiesJson: result.refreshedCookiesJson,
        localization: payload.localization,
      };
      credential.markValidated(
        this.credentialCrypto.encrypt(JSON.stringify(refreshedPayload)),
        new Date(),
      );
      await this.credentialRepository.save(credential);
    }

    return result.data;
  }
}
