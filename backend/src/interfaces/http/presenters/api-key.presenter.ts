import { ApiKey } from '../../../domain/api-key/api-key';

export interface ApiKeyDto {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** Never exposes hashedKey. */
export function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    label: apiKey.label,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
  };
}
