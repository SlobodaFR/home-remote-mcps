import { randomBytes } from 'crypto';
import { ApiKey } from '../../domain/api-key/api-key';
import { ApiKeyRepository } from '../../domain/api-key/api-key.repository';
import { hashToken } from '../../domain/shared/hash';
import { SecretHasher } from '../../domain/shared/secret-hasher';
import { CreateApiKeyUseCase } from '../api-keys/create-api-key.use-case';
import { ResolveUserFromApiKeyUseCase } from './resolve-user-from-api-key.use-case';

class FakeHasher extends SecretHasher {
  verifyCalls: string[] = [];
  /** Lets a test pause a verification mid-flight. */
  gate: Promise<void> | null = null;
  hash(raw: string): Promise<string> {
    return Promise.resolve(`fake:${raw}`);
  }
  async verify(raw: string, stored: string): Promise<boolean> {
    this.verifyCalls.push(stored);
    if (this.gate) {
      await this.gate;
    }
    return stored === `fake:${raw}`;
  }
}

class FakeRepo extends ApiKeyRepository {
  rows = new Map<string, ApiKey>();
  calls: string[] = [];
  findById(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  listByUser() {
    return Promise.resolve([]);
  }
  findActiveByLookupHash(hash: string) {
    this.calls.push('findActiveByLookupHash');
    return Promise.resolve(
      [...this.rows.values()].find(
        (k) => k.isActive && k.lookupHash === hash,
      ) ?? null,
    );
  }
  listActiveWithoutLookupHash() {
    this.calls.push('listActiveWithoutLookupHash');
    return Promise.resolve(
      [...this.rows.values()].filter(
        (k) => k.isActive && k.lookupHash === null,
      ),
    );
  }
  save(k: ApiKey) {
    this.rows.set(k.id, k);
    return Promise.resolve();
  }
  touchIfActive(id: string) {
    this.calls.push('touchIfActive');
    return Promise.resolve(this.rows.get(id)?.isActive ?? false);
  }
  backfillLookupHash(id: string, lookupHash: string) {
    this.calls.push('backfill');
    const k = this.rows.get(id)!;
    if (k.isActive && k.lookupHash === null) {
      this.rows.set(
        id,
        ApiKey.restore({
          id: k.id,
          userId: k.userId,
          label: k.label,
          hashedKey: k.hashedKey,
          lookupHash,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
          revokedAt: k.revokedAt,
        }),
      );
    }
    return Promise.resolve();
  }
}

const rawKey = () => `hrm_${randomBytes(32).toString('base64url')}`;

function legacyKey(id: string, userId: string, raw: string): ApiKey {
  return ApiKey.restore({
    id,
    userId,
    label: 'old',
    hashedKey: `fake:${raw}`,
    lookupHash: null,
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
  });
}

describe('ResolveUserFromApiKeyUseCase', () => {
  let repo: FakeRepo;
  let hasher: FakeHasher;
  let resolve: ResolveUserFromApiKeyUseCase;

  beforeEach(() => {
    repo = new FakeRepo();
    hasher = new FakeHasher();
    resolve = new ResolveUserFromApiKeyUseCase(repo, hasher);
  });

  it('authenticates a freshly created key through the lookup, without scrypt', async () => {
    const created = await new CreateApiKeyUseCase(repo, hasher).execute(
      'u1',
      'Claude',
    );
    expect(created.rawKey).toMatch(/^hrm_[A-Za-z0-9_-]{43}$/);
    hasher.verifyCalls = [];
    repo.calls = [];
    expect(await resolve.execute(created.rawKey)).toEqual({ userId: 'u1' });
    expect(hasher.verifyCalls).toEqual([]);
    expect(repo.calls).toEqual(['findActiveByLookupHash', 'touchIfActive']);
  });

  it('stores the sha256 lookup hash and keeps the slow hash for rollback', async () => {
    const created = await new CreateApiKeyUseCase(repo, hasher).execute(
      'u1',
      'x',
    );
    const row = repo.rows.get(created.id)!;
    expect(row.lookupHash).toBe(hashToken(created.rawKey));
    expect(row.hashedKey).toBe(`fake:${created.rawKey}`);
  });

  it('rejects an unknown well-formed key with no scrypt and no legacy scan when none are unmigrated', async () => {
    const other = rawKey();
    await new CreateApiKeyUseCase(repo, hasher).execute('u1', 'x');
    hasher.verifyCalls = [];
    expect(await resolve.execute(other)).toBeNull();
    expect(hasher.verifyCalls).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['no prefix', randomBytes(32).toString('base64url')],
    ['too short', 'hrm_abc'],
    ['too long', `${rawKey()}A`],
    ['bad alphabet', `hrm_${'+'.repeat(43)}`],
  ])(
    'rejects a malformed key (%s) without touching the repository',
    async (_n, bad) => {
      expect(await resolve.execute(bad)).toBeNull();
      expect(repo.calls).toEqual([]);
      expect(hasher.verifyCalls).toEqual([]);
    },
  );

  it('keeps a legacy key valid, backfills it, then serves it from the lookup', async () => {
    const raw = rawKey();
    repo.rows.set('k1', legacyKey('k1', 'u1', raw));
    expect(await resolve.execute(raw)).toEqual({ userId: 'u1' });
    expect(hasher.verifyCalls).toHaveLength(1);
    expect(repo.rows.get('k1')!.lookupHash).toBe(hashToken(raw));

    hasher.verifyCalls = [];
    expect(await resolve.execute(raw)).toEqual({ userId: 'u1' });
    expect(hasher.verifyCalls).toEqual([]);
  });

  it('rejects an unknown key against legacy rows (async check only, no match)', async () => {
    repo.rows.set('k1', legacyKey('k1', 'u1', rawKey()));
    expect(await resolve.execute(rawKey())).toBeNull();
    expect(hasher.verifyCalls).toHaveLength(1);
  });

  it('rejects a revoked key on the lookup path', async () => {
    const created = await new CreateApiKeyUseCase(repo, hasher).execute(
      'u1',
      'x',
    );
    repo.rows.get(created.id)!.revoke(new Date());
    expect(await resolve.execute(created.rawKey)).toBeNull();
  });

  it('rejects a revoked legacy key', async () => {
    const raw = rawKey();
    const key = legacyKey('k1', 'u1', raw);
    key.revoke(new Date());
    repo.rows.set('k1', key);
    expect(await resolve.execute(raw)).toBeNull();
    expect(hasher.verifyCalls).toEqual([]);
  });

  it('rejects a legacy key revoked while its scrypt check is running', async () => {
    const raw = rawKey();
    repo.rows.set('k1', legacyKey('k1', 'u1', raw));
    let release!: () => void;
    hasher.gate = new Promise<void>((r) => (release = r));
    const pending = resolve.execute(raw);
    await vi.waitFor(() => expect(hasher.verifyCalls).toHaveLength(1));
    repo.rows.get('k1')!.revoke(new Date());
    release();
    expect(await pending).toBeNull();
    expect(repo.rows.get('k1')!.revokedAt).not.toBeNull();
  });
});
