/**
 * Port (driven side) implemented by the infrastructure layer. Encrypts the
 * opaque session material (e.g. Garmin OAuth1/OAuth2 tokens) stored at rest
 * in the `credentials` table. Never handles the user's raw password - only
 * the tokens obtained after a validated login.
 */
export abstract class CredentialCrypto {
  abstract encrypt(plaintext: string): string;
  abstract decrypt(ciphertext: string): string;
}
