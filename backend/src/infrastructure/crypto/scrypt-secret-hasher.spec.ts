import { scryptSync } from 'crypto';
import {
  MAX_CONCURRENT_VERIFICATIONS,
  ScryptSecretHasher,
} from './scrypt-secret-hasher';

describe('ScryptSecretHasher', () => {
  const hasher = new ScryptSecretHasher();

  it('verifies a hash it produced and rejects another secret', async () => {
    const stored = await hasher.hash('secret');
    expect(await hasher.verify('secret', stored)).toBe(true);
    expect(await hasher.verify('other', stored)).toBe(false);
  });

  it('stays compatible with hashes stored by the former synchronous implementation', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const stored = `${salt}:${scryptSync('legacy', salt, 64).toString('hex')}`;
    expect(await hasher.verify('legacy', stored)).toBe(true);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await hasher.verify('x', 'nocolon')).toBe(false);
    expect(await hasher.verify('x', ':')).toBe(false);
  });

  it('refuses (does not queue) verifications beyond the in-flight cap', async () => {
    const stored = await hasher.hash('secret');
    const results = await Promise.all(
      Array.from({ length: MAX_CONCURRENT_VERIFICATIONS + 3 }, () =>
        hasher.verify('secret', stored),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(MAX_CONCURRENT_VERIFICATIONS);
    expect(await hasher.verify('secret', stored)).toBe(true);
  });
});
