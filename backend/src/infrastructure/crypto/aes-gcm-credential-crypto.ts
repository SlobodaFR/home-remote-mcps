import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Encrypts credential session tokens at rest with AES-256-GCM. The key is
 * derived once from CREDENTIALS_ENCRYPTION_KEY (a long random secret set via
 * env, never committed). Ciphertext layout: base64(iv):base64(authTag):base64(data).
 */
@Injectable()
export class AesGcmCredentialCrypto extends CredentialCrypto {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    super();
    const secret = config.getOrThrow<string>('CREDENTIALS_ENCRYPTION_KEY');
    if (secret.length < 32) {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters long',
      );
    }
    this.key = scryptSync(secret, 'home-remote-mcps-credentials', KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    const [ivB64, authTagB64, dataB64] = ciphertext.split(':');
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error('Malformed ciphertext');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
