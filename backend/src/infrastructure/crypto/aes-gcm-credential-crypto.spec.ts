import { ConfigService } from '@nestjs/config';
import { AesGcmCredentialCrypto } from './aes-gcm-credential-crypto';

const SECRET = 'a'.repeat(40);

// Produit une fois par le code d'avant le correctif (options Node par défaut), avec SECRET.
const LEGACY_CIPHERTEXT =
  'AAECAwQFBgcICQoL:nY3YDHy87PBxQC0pT91+AA==:GwS0jxcZFKhSnnjRebqLSCAG';

function makeCrypto(): AesGcmCredentialCrypto {
  return new AesGcmCredentialCrypto(
    new ConfigService({ CREDENTIALS_ENCRYPTION_KEY: SECRET }),
  );
}

describe('AesGcmCredentialCrypto', () => {
  it('should decrypt what it encrypted', () => {
    const crypto = makeCrypto();

    expect(crypto.decrypt(crypto.encrypt('{"token":"x"}'))).toBe(
      '{"token":"x"}',
    );
  });

  it('should still decrypt ciphertext stored before the fix', () => {
    expect(makeCrypto().decrypt(LEGACY_CIPHERTEXT)).toBe('{"token":"legacy"}');
  });

  it('should reject a ciphertext whose auth tag was truncated to 96 bits', () => {
    const [iv, tag, data] = LEGACY_CIPHERTEXT.split(':');
    const truncated = Buffer.from(tag, 'base64').subarray(0, 12);

    expect(() =>
      makeCrypto().decrypt([iv, truncated.toString('base64'), data].join(':')),
    ).toThrow(/authentication tag/i);
  });
});
