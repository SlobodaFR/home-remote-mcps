import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AesGcmCredentialCrypto } from './aes-gcm-credential-crypto';

const SECRET = 'a'.repeat(40);

function makeCrypto(): AesGcmCredentialCrypto {
  return new AesGcmCredentialCrypto(
    new ConfigService({ CREDENTIALS_ENCRYPTION_KEY: SECRET }),
  );
}

function encryptWithDefaultNodeOptions(plaintext: string): string {
  const key = scryptSync(SECRET, 'home-remote-mcps-credentials', 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString('base64'))
    .join(':');
}

describe('AesGcmCredentialCrypto', () => {
  it('should decrypt what it encrypted', () => {
    const crypto = makeCrypto();

    expect(crypto.decrypt(crypto.encrypt('{"token":"x"}'))).toBe(
      '{"token":"x"}',
    );
  });

  it('should decrypt ciphertexts stored before the auth tag length was pinned', () => {
    expect(makeCrypto().decrypt(encryptWithDefaultNodeOptions('legacy'))).toBe(
      'legacy',
    );
  });

  it('should reject a ciphertext whose auth tag was truncated', () => {
    const crypto = makeCrypto();
    const [iv, tag, data] = crypto.encrypt('secret').split(':');
    const truncatedTag = Buffer.from(tag, 'base64')
      .subarray(0, 4)
      .toString('base64');

    expect(() => crypto.decrypt([iv, truncatedTag, data].join(':'))).toThrow();
  });
});
