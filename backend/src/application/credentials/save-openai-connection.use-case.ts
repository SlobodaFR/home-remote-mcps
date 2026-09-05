import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { OpenAiConnector } from '../../domain/openai/openai-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

const OPENAI_SERVICE_PREFIX = 'openai:';
const CONNECTION_NAME_PATTERN = /^[a-z0-9_.]{1,64}$/;

/**
 * Unlike every other single-token integration, a user can hold several
 * OpenAI API keys at once (e.g. one per project), so "service" alone can't
 * identify one - it's namespaced by a user-chosen connection name, which also
 * becomes the last URL path segment MCP clients call
 * (/api/mcp/openai/<apiKey>/<connectionName>). Mirrors
 * save-instagram-connection.use-case.ts.
 */
export function openaiServiceFor(connectionName: string): string {
  return `${OPENAI_SERVICE_PREFIX}${connectionName}`;
}

export function isOpenAiService(service: string): boolean {
  return service.startsWith(OPENAI_SERVICE_PREFIX);
}

export function openaiConnectionNameOf(service: string): string {
  return service.slice(OPENAI_SERVICE_PREFIX.length);
}

export function normalizeOpenAiConnectionName(connectionName: string): string {
  return connectionName.trim().toLowerCase();
}

export type SaveOpenAiConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Tests the OpenAI API key the user just typed in the form against the live
 * API, and only persists the credential (keyed by the chosen connection
 * name) if that test call succeeds - mirrors
 * SavePersonalHealthConnectionUseCase, but keyed by an extra
 * connection-name segment like SaveInstagramConnectionUseCase.
 */
@Injectable()
export class SaveOpenAiConnectionUseCase {
  constructor(
    private readonly openAiConnector: OpenAiConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    userId: string,
    connectionName: string,
    apiKey: string,
    organization?: string,
  ): Promise<SaveOpenAiConnectionResult> {
    const normalizedConnectionName =
      normalizeOpenAiConnectionName(connectionName);
    if (!CONNECTION_NAME_PATTERN.test(normalizedConnectionName)) {
      return {
        status: 'error',
        message:
          'Connection name must be 1-64 characters, lowercase letters/digits/dots/underscores only (it becomes part of the MCP URL).',
      };
    }

    const result = await this.openAiConnector.testConnection({
      apiKey,
      organization,
    });
    if (result.status === 'error') {
      return result;
    }

    const service = openaiServiceFor(normalizedConnectionName);
    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      service,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service,
        createdAt: now,
        updatedAt: now,
      });
    credential.markValidated(
      this.credentialCrypto.encrypt(JSON.stringify({ apiKey, organization })),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
