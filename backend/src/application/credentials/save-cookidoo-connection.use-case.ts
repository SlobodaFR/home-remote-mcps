import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { CookidooConnector } from '../../domain/cookidoo/cookidoo-connector';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const COOKIDOO_SERVICE = 'cookidoo';

export interface CookidooCredentialPayload {
  cookiesJson: unknown;
  localization: { countryCode: string; language: string; url: string };
}

export type SaveCookidooConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Attempts a live Cookidoo login with the credentials the user just typed
 * in the form. Nothing is persisted unless the login actually succeeds -
 * mirrors StartGarminLoginUseCase, but single-step since Cookidoo has no
 * MFA/session dance. The raw password never touches the database, only the
 * resulting session cookies + the localization they were issued under
 * (needed on every later call to derive the right cookidoo.<tld> host).
 */
@Injectable()
export class SaveCookidooConnectionUseCase {
  constructor(
    private readonly cookidooConnector: CookidooConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    email: string,
    password: string,
    countryCode: string,
    language: string,
  ): Promise<SaveCookidooConnectionResult> {
    const result = await this.cookidooConnector.login(
      email,
      password,
      countryCode,
      language,
    );
    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }

    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      COOKIDOO_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: COOKIDOO_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    const payload: CookidooCredentialPayload = {
      cookiesJson: JSON.parse(result.cookiesJson) as unknown,
      localization: result.localization,
    };
    credential.markValidated(
      this.credentialCrypto.encrypt(JSON.stringify(payload)),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
