import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SecretHasher } from '../../domain/shared/secret-hasher';

const SCRYPT_KEYLEN = 64;
/**
 * scrypt runs on the libuv pool (4 threads by default, shared with DNS lookups of every outbound
 * call): verifications beyond this many in flight are refused instead of queued.
 */
export const MAX_CONCURRENT_VERIFICATIONS = 2;

function derive(secret: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, SCRYPT_KEYLEN, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Same `salt:hash` format and parameters as the former synchronous implementation. */
@Injectable()
export class ScryptSecretHasher extends SecretHasher {
  private inFlight = 0;

  async hash(rawSecret: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await derive(rawSecret, salt);
    return `${salt}:${derived.toString('hex')}`;
  }

  async verify(rawSecret: string, storedHash: string): Promise<boolean> {
    const [salt, derived] = storedHash.split(':');
    if (!salt || !derived) {
      return false;
    }
    if (this.inFlight >= MAX_CONCURRENT_VERIFICATIONS) {
      return false;
    }
    this.inFlight += 1;
    try {
      const candidate = await derive(rawSecret, salt);
      const expected = Buffer.from(derived, 'hex');
      return (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      );
    } finally {
      this.inFlight -= 1;
    }
  }
}
