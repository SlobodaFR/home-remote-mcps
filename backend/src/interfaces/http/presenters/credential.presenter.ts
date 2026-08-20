import { Credential } from '../../../domain/credential/credential';

export interface CredentialDto {
  id: string;
  service: string;
  status: string;
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
}

/** Never exposes encryptedTokens - the vault's contents stay server-side only. */
export function toCredentialDto(credential: Credential): CredentialDto {
  return {
    id: credential.id,
    service: credential.service,
    status: credential.status,
    lastError: credential.lastError,
    lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
    createdAt: credential.createdAt.toISOString(),
  };
}
