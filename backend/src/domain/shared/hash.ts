import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SCRYPT_KEYLEN = 64;

/**
 * Deterministic SHA-256 digest, used for single-use/lookup tokens where
 * only equality checks against a stored hash are needed.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Salted scrypt hash for long-lived secrets (API keys), stored as
 * `salt:hash` hex pairs. Use `verifySecret` for constant-time comparison.
 */
export function hashSecret(rawSecret: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(rawSecret, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(rawSecret: string, storedHash: string): boolean {
  const [salt, derived] = storedHash.split(':');
  if (!salt || !derived) {
    return false;
  }
  const candidate = scryptSync(rawSecret, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(derived, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}
