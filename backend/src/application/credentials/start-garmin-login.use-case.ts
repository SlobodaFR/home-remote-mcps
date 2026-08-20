import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { GarminConnector } from '../../domain/garmin/garmin-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const GARMIN_SERVICE = 'garmin';

export type StartGarminLoginResult =
  | { status: 'ok' }
  | { status: 'mfa_required'; pendingId: string }
  | { status: 'error'; message: string };

/**
 * Attempts a live Garmin login with the credentials the user just typed in
 * the form. Nothing is persisted unless the login actually succeeds (or
 * needs an MFA code, in which case the pending attempt lives in the
 * garmin-connector sidecar, not here). The raw password never touches the
 * database.
 */
@Injectable()
export class StartGarminLoginUseCase {
  constructor(
    private readonly garminConnector: GarminConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    email: string,
    password: string,
  ): Promise<StartGarminLoginResult> {
    const result = await this.garminConnector.startLogin(email, password);

    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }
    if (result.status === 'mfa_required') {
      return { status: 'mfa_required', pendingId: result.pendingId };
    }

    await this.persistValidatedTokens(userId, result.tokensJson);
    return { status: 'ok' };
  }

  async persistValidatedTokens(
    userId: string,
    tokensJson: string,
  ): Promise<void> {
    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      GARMIN_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: GARMIN_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(this.credentialCrypto.encrypt(tokensJson), now);
    await this.credentialRepository.save(credential);
  }
}
