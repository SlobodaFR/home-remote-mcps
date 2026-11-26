import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { YoutubeOAuthStateStore } from '../../domain/credential/youtube-oauth-state-store';
import { YoutubeConnector } from '../../domain/youtube/youtube-connector';
import { StartYoutubeConnectionUseCase } from './start-youtube-connection.use-case';

class FakeRepository extends CredentialRepository {
  rows: Credential[] = [];
  /** Rows that appear "concurrently" while save() fails on the unique index. */
  concurrentWinner?: Credential;
  saveError?: Error;

  findById(): Promise<Credential | null> {
    return Promise.resolve(null);
  }
  findByUserAndService(userId: string, service: string) {
    return Promise.resolve(
      this.rows.find((r) => r.userId === userId && r.service === service) ??
        null,
    );
  }
  listByUser(): Promise<Credential[]> {
    return Promise.resolve([]);
  }
  save(credential: Credential): Promise<void> {
    if (this.concurrentWinner) {
      this.rows.push(this.concurrentWinner);
      return Promise.reject(new Error('UNIQUE constraint failed'));
    }
    if (this.saveError) {
      return Promise.reject(this.saveError);
    }
    this.rows.push(credential);
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

describe('StartYoutubeConnectionUseCase', () => {
  const issued: { credentialId: string }[] = [];
  let repository: FakeRepository;
  let useCase: StartYoutubeConnectionUseCase;

  beforeEach(() => {
    issued.length = 0;
    repository = new FakeRepository();
    useCase = new StartYoutubeConnectionUseCase(
      {
        authorizeUrl: (_id: string, _uri: string, state: string) =>
          `https://google/?state=${state}`,
      } as unknown as YoutubeConnector,
      repository,
      { encrypt: (v: string) => `enc(${v})` } as unknown as CredentialCrypto,
      {
        issue: (flow: { credentialId: string }) => {
          issued.push(flow);
          return Promise.resolve('state-1');
        },
      } as unknown as YoutubeOAuthStateStore,
    );
  });

  const run = () => useCase.execute('u1', 'client', 'secret', 'http://cb');

  it('creates the pending credential on a first start', async () => {
    const result = await run();

    expect(repository.rows).toHaveLength(1);
    expect(result.pendingId).toBe(repository.rows[0].id);
  });

  it('adopts the row a concurrent first start created (unique user/service)', async () => {
    const now = new Date();
    const winner = Credential.create({
      id: 'winner',
      userId: 'u1',
      service: 'youtube',
      createdAt: now,
      updatedAt: now,
    });
    repository.concurrentWinner = winner;

    const result = await run();

    expect(result.pendingId).toBe('winner');
    expect(issued).toEqual([
      expect.objectContaining({ credentialId: 'winner' }),
    ]);
  });

  it('rethrows a save failure that is not a lost race', async () => {
    repository.saveError = new Error('disk full');

    await expect(run()).rejects.toThrow('disk full');
  });
});
