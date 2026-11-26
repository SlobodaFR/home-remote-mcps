import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CompleteYoutubeConnectionUseCase } from '../../../application/credentials/complete-youtube-connection.use-case';
import { StartYoutubeConnectionUseCase } from '../../../application/credentials/start-youtube-connection.use-case';
import { Credential } from '../../../domain/credential/credential';
import { CredentialRepository } from '../../../domain/credential/credential.repository';
import { YoutubeOAuthStateStore } from '../../../domain/credential/youtube-oauth-state-store';
import { CredentialCrypto } from '../../../domain/shared/credential-crypto';
import {
  YoutubeConnector,
  YoutubeTokenExchangeResult,
} from '../../../domain/youtube/youtube-connector';
import { InMemoryYoutubeOAuthStateStore } from '../../../infrastructure/youtube/in-memory-youtube-oauth-state-store';
import { configureApp } from '../configure-app';
import { CredentialsController } from './credentials.controller';

class MemoryCredentials extends CredentialRepository {
  readonly rows = new Map<string, Credential>();
  findById(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  findByUserAndService(userId: string, service: string) {
    return Promise.resolve(
      [...this.rows.values()].find(
        (c) => c.userId === userId && c.service === service,
      ) ?? null,
    );
  }
  listByUser() {
    return Promise.resolve([]);
  }
  save(credential: Credential) {
    this.rows.set(credential.id, credential);
    return Promise.resolve();
  }
  delete() {
    return Promise.resolve();
  }
}

class PlainCrypto extends CredentialCrypto {
  encrypt(p: string) {
    return `enc:${p}`;
  }
  decrypt(c: string) {
    return c.slice(4);
  }
}

class StubConnector extends YoutubeConnector {
  exchanges = 0;
  authorizeUrl(clientId: string, redirectUri: string, state: string) {
    return `https://accounts.example/auth?state=${state}`;
  }
  exchangeCode(): Promise<YoutubeTokenExchangeResult> {
    this.exchanges += 1;
    return Promise.resolve({
      status: 'ok',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
    });
  }
  call(): never {
    throw new Error('unused');
  }
}

const COOKIE = 'youtube_oauth_state';

describe('YouTube OAuth start/callback (issue #48)', () => {
  let app: NestExpressApplication;
  let credentials: MemoryCredentials;
  let connector: StubConnector;
  let store: InMemoryYoutubeOAuthStateStore;
  let nowMs: number;
  let userId: string;

  async function boot(nodeEnv = 'test'): Promise<void> {
    credentials = new MemoryCredentials();
    connector = new StubConnector();
    nowMs = 1_000_000;
    store = new InMemoryYoutubeOAuthStateStore(600_000, () => nowMs);
    userId = 'user-1';
    const env = {
      NODE_ENV: nodeEnv,
      FRONTEND_URL: 'https://app.test',
      PUBLIC_BASE_URL: 'https://app.test',
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => env],
        }),
      ],
      controllers: [CredentialsController],
      providers: [
        { provide: YoutubeOAuthStateStore, useValue: store },
        { provide: CredentialRepository, useValue: credentials },
        { provide: CredentialCrypto, useClass: PlainCrypto },
        { provide: YoutubeConnector, useValue: connector },
        StartYoutubeConnectionUseCase,
        CompleteYoutubeConnectionUseCase,
        ...[
          'ListCredentialsUseCase',
          'StartGarminLoginUseCase',
          'SubmitGarminMfaUseCase',
          'SaveCookidooConnectionUseCase',
          'ListCookidooLocalizationsUseCase',
          'SaveHomeAssistantConnectionUseCase',
          'SaveInstagramConnectionUseCase',
          'SaveLogsConnectionUseCase',
          'SaveMarkitdownConnectionUseCase',
          'SaveOpenAiConnectionUseCase',
          'SavePersonalHealthConnectionUseCase',
          'DeleteCredentialUseCase',
        ].map((name) => ({ provide: name, useValue: {} })),
      ],
    })
      .useMocker((token) => (typeof token === 'function' ? {} : undefined))
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, env);
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: userId, email: 'a@b.c', name: 'A' };
      next();
    });
    await app.init();
  }

  afterEach(() => app.close());

  async function start(): Promise<{
    state: string;
    cookie: string;
    res: request.Response;
  }> {
    const res = await request(app.getHttpServer())
      .post('/api/credentials/youtube/start')
      .set('Origin', 'https://app.test')
      .send({ clientId: 'cid', clientSecret: 'csecret' });
    expect(res.status).toBe(201);
    const state = new URL(res.body.authorizeUrl as string).searchParams.get(
      'state',
    )!;
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith(`${COOKIE}=`),
    )!;
    return { state, cookie: setCookie.split(';')[0], res };
  }

  function callback(query: string, cookie?: string): request.Test {
    const req = request(app.getHttpServer()).get(
      `/api/credentials/youtube/callback?${query}`,
    );
    return cookie ? req.set('Cookie', cookie) : req;
  }

  describe('start', () => {
    beforeEach(() => boot());

    it('uses a random state (not the credential id), identical to the cookie, different per start', async () => {
      const first = await start();
      const second = await start();
      expect(first.state).not.toBe(second.state);
      expect(first.state).not.toBe(first.res.body.pendingId);
      expect(first.cookie).toBe(`${COOKIE}=${first.state}`);
      expect(Object.keys(first.res.body as object).sort()).toEqual([
        'authorizeUrl',
        'pendingId',
      ]);
    });

    it('sets a short-lived HttpOnly Lax cookie scoped to the youtube routes', async () => {
      const { res } = await start();
      const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(`${COOKIE}=`),
      )!;
      expect(raw).toContain('HttpOnly');
      expect(raw).toContain('SameSite=Lax');
      expect(raw).toContain('Path=/api/credentials/youtube');
      expect(raw).toContain('Max-Age=600');
      expect(raw).not.toContain('Secure');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  it('marks the cookie Secure in production', async () => {
    await boot('production');
    const { res } = await start();
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(`${COOKIE}=`),
    )!;
    expect(raw).toContain('Secure');
  });

  describe('existing ok credential (issue #80)', () => {
    beforeEach(() => boot());

    function seedOk(): Credential {
      const ok = Credential.create({
        id: 'cred-ok',
        userId,
        service: 'youtube',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
      ok.markValidated('enc:{"refreshToken":"valid-rt"}', new Date(1));
      credentials.rows.set(ok.id, ok);
      return ok;
    }

    it('keeps the valid tokens and status when a flow is started then abandoned', async () => {
      const ok = seedOk();
      await start();
      expect(ok.status).toBe('ok');
      expect(ok.encryptedTokens).toBe('enc:{"refreshToken":"valid-rt"}');
      expect(credentials.rows.size).toBe(1);
    });

    it('keeps the valid credential when the Google exchange fails', async () => {
      const ok = seedOk();
      const { state, cookie } = await start();
      connector.exchangeCode = () =>
        Promise.resolve({ status: 'error' as const, message: 'bad code' });
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.headers.location).toContain('youtube=error');
      expect(ok.status).toBe('ok');
      expect(ok.encryptedTokens).toBe('enc:{"refreshToken":"valid-rt"}');
    });

    it('still marks a non-ok credential failed when the exchange fails', async () => {
      const { state, cookie } = await start();
      connector.exchangeCode = () =>
        Promise.resolve({ status: 'error' as const, message: 'bad code' });
      await callback(`state=${state}&code=abc`, cookie);
      const [row] = [...credentials.rows.values()];
      expect(row.status).toBe('failed');
      expect(row.lastError).toBe('bad code');
    });

    it('replaces the tokens only once the exchange succeeds', async () => {
      const ok = seedOk();
      const { state, cookie } = await start();
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.headers.location).toBe('https://app.test/?youtube=ok');
      expect(ok.status).toBe('ok');
      const stored = JSON.parse(ok.encryptedTokens!.slice(4)) as {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
      };
      expect(stored).toMatchObject({
        clientId: 'cid',
        clientSecret: 'csecret',
        refreshToken: 'rt',
      });
    });
  });

  describe('callback', () => {
    beforeEach(() => boot());

    it('completes with the matching cookie, to the SPA root, and clears the cookie', async () => {
      const { state, cookie } = await start();
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://app.test/?youtube=ok');
      expect(connector.exchanges).toBe(1);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).join(
        ';',
      );
      expect(cleared).toContain(`${COOKIE}=;`);
      expect(cleared).toContain('Path=/api/credentials/youtube');
    });

    it('rejects a replay of a used state', async () => {
      const { state, cookie } = await start();
      await callback(`state=${state}&code=abc`, cookie);
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(1);
    });

    it('rejects a replay after a failed exchange too', async () => {
      const { state, cookie } = await start();
      connector.exchangeCode = () =>
        Promise.resolve({ status: 'error' as const, message: 'bad code' });
      await callback(`state=${state}&code=abc`, cookie);
      connector.exchangeCode = () => {
        throw new Error('must not be called');
      };
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.headers.location).toContain('youtube=error');
    });

    it('rejects a request without the cookie (login CSRF) and does not burn the state', async () => {
      const { state, cookie } = await start();
      const forged = await callback(`state=${state}&code=attacker`);
      expect(forged.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
      const real = await callback(`state=${state}&code=abc`, cookie);
      expect(real.headers.location).toBe('https://app.test/?youtube=ok');
    });

    it('rejects a state different from the cookie', async () => {
      const a = await start();
      userId = 'user-2';
      const b = await start();
      const res = await callback(`state=${a.state}&code=x`, b.cookie);
      expect(res.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
    });

    it('rejects an expired state', async () => {
      const { state, cookie } = await start();
      nowMs += 600_000;
      const res = await callback(`state=${state}&code=abc`, cookie);
      expect(res.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
    });

    it('rejects the old state once the user starts again', async () => {
      const first = await start();
      const second = await start();
      const old = await callback(`state=${first.state}&code=x`, first.cookie);
      expect(old.headers.location).toContain('youtube=error');
      const ok = await callback(`state=${second.state}&code=x`, second.cookie);
      expect(ok.headers.location).toBe('https://app.test/?youtube=ok');
    });

    it('rejects the credential id used as state (previous behaviour)', async () => {
      const { res } = await start();
      const id = res.body.pendingId as string;
      const out = await callback(`state=${id}&code=x`, `${COOKIE}=${id}`);
      expect(out.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
    });

    it('rejects array or missing state/code without calling Google', async () => {
      const { state, cookie } = await start();
      for (const q of ['code=x', `state=${state}&state=${state}&code=x`]) {
        const res = await callback(q, cookie);
        expect(res.headers.location).toContain('youtube=error');
      }
      const noCode = await callback(`state=${state}`, cookie);
      expect(noCode.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
    });

    it('burns the state when Google reports an error and does not reflect it', async () => {
      const { state, cookie } = await start();
      const res = await callback(`state=${state}&error=%3Cscript%3E`, cookie);
      expect(res.headers.location).toContain('youtube=error');
      expect(res.headers.location).not.toContain('script');
      const again = await callback(`state=${state}&code=x`, cookie);
      expect(again.headers.location).toContain('youtube=error');
      expect(connector.exchanges).toBe(0);
    });
  });
});
