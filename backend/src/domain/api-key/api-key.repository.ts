import { ApiKey } from './api-key';

/** Port (driven side) implemented by the infrastructure layer. */
export abstract class ApiKeyRepository {
  abstract findById(id: string): Promise<ApiKey | null>;
  abstract listByUser(userId: string): Promise<ApiKey[]>;
  /** All active (non-revoked) keys, used to resolve a raw key presented by an MCP client. */
  abstract listActive(): Promise<ApiKey[]>;
  abstract save(apiKey: ApiKey): Promise<void>;
}
