import { ApiKey } from './api-key';

/** Port (driven side) implemented by the infrastructure layer. */
export abstract class ApiKeyRepository {
  abstract findById(id: string): Promise<ApiKey | null>;
  abstract listByUser(userId: string): Promise<ApiKey[]>;
  /** The active (non-revoked) key whose lookup hash is exactly this one. */
  abstract findActiveByLookupHash(lookupHash: string): Promise<ApiKey | null>;
  /** Active keys issued before lookup hashes existed (no lookup hash yet). */
  abstract listActiveWithoutLookupHash(): Promise<ApiKey[]>;
  abstract save(apiKey: ApiKey): Promise<void>;
  /**
   * Records a use, as a conditional UPDATE: false when the key is revoked (or gone), so a
   * revocation landing during authentication is never overwritten by a stale snapshot.
   */
  abstract touchIfActive(id: string, now: Date): Promise<boolean>;
  /** Idempotent, conditional (still active, still without one) backfill of the lookup hash. */
  abstract backfillLookupHash(id: string, lookupHash: string): Promise<void>;
}
