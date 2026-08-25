import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { LogsConnector } from '../../domain/logs/log-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

export const LOGS_SERVICE = 'logs';

export type SaveLogsConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Tests the MinIO base path the user just typed in the form against the
 * shared home-lab bucket, and only persists it if the test call succeeds -
 * mirrors SavePersonalHealthConnectionUseCase. No bucket credentials are
 * collected here: those are shared infra config (MINIO_* env vars), not a
 * per-user secret.
 */
@Injectable()
export class SaveLogsConnectionUseCase {
  constructor(
    private readonly logsConnector: LogsConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    basePath: string,
  ): Promise<SaveLogsConnectionResult> {
    const normalizedBasePath = `${basePath.replace(/^\/+|\/+$/g, '')}/`;
    const result = await this.logsConnector.testConnection({
      basePath: normalizedBasePath,
    });
    if (result.status === 'error') {
      return { status: 'error', message: result.message };
    }

    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      LOGS_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: LOGS_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(
      this.credentialCrypto.encrypt(
        JSON.stringify({ basePath: normalizedBasePath }),
      ),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
