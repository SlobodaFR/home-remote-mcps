import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { HomeAssistantConnector } from '../../domain/home-assistant/home-assistant-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const HOME_ASSISTANT_SERVICE = 'home_assistant';

export type SaveHomeAssistantConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Tests the base URL + long-lived token the user just typed in the form
 * against the live Home Assistant instance, and only persists them if the
 * test call succeeds - mirrors StartGarminLoginUseCase, but single-step
 * since Home Assistant has no MFA/session dance.
 */
@Injectable()
export class SaveHomeAssistantConnectionUseCase {
  constructor(
    private readonly homeAssistantConnector: HomeAssistantConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    baseUrl: string,
    token: string,
  ): Promise<SaveHomeAssistantConnectionResult> {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const result = await this.homeAssistantConnector.testConnection({
      baseUrl: normalizedBaseUrl,
      token,
    });
    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }

    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      HOME_ASSISTANT_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: HOME_ASSISTANT_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(
      this.credentialCrypto.encrypt(
        JSON.stringify({ baseUrl: normalizedBaseUrl, token }),
      ),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
