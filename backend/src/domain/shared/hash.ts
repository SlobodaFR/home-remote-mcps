import { createHash } from 'crypto';

/**
 * Deterministic SHA-256 digest (hex). Used as the lookup identifier of API
 * keys: they are 256 random bits, so a fast unsalted hash is a sound verifier
 * and lets the row be found by equality instead of scanning every key.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
