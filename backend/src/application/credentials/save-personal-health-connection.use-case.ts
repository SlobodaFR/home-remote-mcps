import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { PersonalHealthConnector } from '../../domain/personal-health/personal-health-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const PERSONAL_HEALTH_SERVICE = 'personal_health';

export type SavePersonalHealthConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Tests the health.sloboda.fr API key the user just typed in the form
 * against the live service, and only persists it if the test call succeeds -
 * mirrors SaveHomeAssistantConnectionUseCase (single-token, no OAuth dance).
 */
@Injectable()
export class SavePersonalHealthConnectionUseCase {
  constructor(
    private readonly personalHealthConnector: PersonalHealthConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    apiKey: string,
  ): Promise<SavePersonalHealthConnectionResult> {
    const result = await this.personalHealthConnector.testConnection({
      apiKey,
    });
    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }

    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      PERSONAL_HEALTH_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: PERSONAL_HEALTH_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(
      this.credentialCrypto.encrypt(JSON.stringify({ apiKey })),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
