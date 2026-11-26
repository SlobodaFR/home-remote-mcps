/**
 * Port: salted, slow hash of long-lived secrets (stored as `salt:hash`). Both
 * operations are asynchronous so they never block the event loop.
 */
export abstract class SecretHasher {
  abstract hash(rawSecret: string): Promise<string>;
  /**
   * Constant-time check. Resolves false (never queues) when too many checks
   * are already in flight: callers must treat that as "not verified".
   */
  abstract verify(rawSecret: string, storedHash: string): Promise<boolean>;
}
