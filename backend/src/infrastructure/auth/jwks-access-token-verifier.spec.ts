import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import {
  exportJWK,
  generateKeyPair,
  JWK,
  KeyLike,
  SignJWT,
  type JWTPayload,
} from 'jose';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { JwksAccessTokenVerifier } from './jwks-access-token-verifier';

const FLAG = 'auth-verify-token-claims';
const CLIENT_ID = 'home-remote-mcps';

class StubFlags extends FeatureFlags {
  readonly asked: { key: string; codeDefault: boolean }[] = [];
  constructor(private readonly value: boolean | 'throws') {
    super();
  }
  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.asked.push({ key, codeDefault });
    if (this.value === 'throws') {
      throw new Error('flags down');
    }
    return this.value;
  }
}

describe('JwksAccessTokenVerifier', () => {
  let server: Server;
  let origin: string;
  let rsa: { publicKey: KeyLike; privateKey: KeyLike };
  let other: { publicKey: KeyLike; privateKey: KeyLike };
  let ec: { publicKey: KeyLike; privateKey: KeyLike };

  beforeAll(async () => {
    rsa = await generateKeyPair('RS256');
    other = await generateKeyPair('RS256');
    ec = await generateKeyPair('ES256');
    const jwks: { keys: JWK[] } = {
      keys: [
        { ...(await exportJWK(rsa.publicKey)), kid: 'rsa', alg: 'RS256' },
        { ...(await exportJWK(ec.publicKey)), kid: 'ec', alg: 'ES256' },
      ],
    };
    server = createServer((req, res) => {
      if (req.url === '/.well-known/jwks.json') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(jwks));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function verifier(
    flags: FeatureFlags,
    authServiceUrl = `${origin}/`,
  ): JwksAccessTokenVerifier {
    const config = new ConfigService({
      AUTH_SERVICE_URL: authServiceUrl,
      AUTH_CLIENT_ID: CLIENT_ID,
    });
    return new JwksAccessTokenVerifier(config, flags);
  }

  async function sign(
    overrides: {
      payload?: JWTPayload;
      alg?: string;
      kid?: string;
      key?: KeyLike;
      aud?: string | string[] | null;
      iss?: string | null;
    } = {},
  ): Promise<string> {
    const jwt = new SignJWT({
      email: 'ada@example.test',
      name: 'Ada',
      ...overrides.payload,
    })
      .setProtectedHeader({
        alg: overrides.alg ?? 'RS256',
        kid: overrides.kid ?? 'rsa',
      })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('5m');
    if (overrides.aud !== null) {
      jwt.setAudience(overrides.aud ?? CLIENT_ID);
    }
    if (overrides.iss !== null) {
      jwt.setIssuer(overrides.iss ?? origin);
    }
    return jwt.sign(overrides.key ?? rsa.privateKey);
  }

  describe('flag off (current behaviour)', () => {
    const flags = () => new StubFlags(false);

    it('accepts a valid token', async () => {
      const result = await verifier(flags()).verify(await sign());
      expect(result).toMatchObject({
        sub: 'user-1',
        email: 'ada@example.test',
        name: 'Ada',
      });
    });

    it('still accepts another app audience, a wrong issuer and no claims at all', async () => {
      const v = verifier(flags());
      expect(await v.verify(await sign({ aud: 'home-chat' }))).not.toBeNull();
      expect(
        await v.verify(await sign({ iss: 'https://evil.example.test' })),
      ).not.toBeNull();
      expect(
        await v.verify(await sign({ aud: null, iss: null })),
      ).not.toBeNull();
    });

    it('still accepts a non-RS256 token signed with a published key', async () => {
      expect(
        await verifier(flags()).verify(
          await sign({ alg: 'ES256', kid: 'ec', key: ec.privateKey }),
        ),
      ).not.toBeNull();
    });

    it('still rejects a bad signature', async () => {
      expect(
        await verifier(flags()).verify(await sign({ key: other.privateKey })),
      ).toBeNull();
    });
  });

  describe('flag on (aud / iss / RS256 enforced)', () => {
    const flags = () => new StubFlags(true);

    it('accepts a valid token', async () => {
      expect(await verifier(flags()).verify(await sign())).toMatchObject({
        sub: 'user-1',
      });
    });

    it('rejects a token issued for another app (audience)', async () => {
      expect(
        await verifier(flags()).verify(await sign({ aud: 'home-chat' })),
      ).toBeNull();
    });

    it('accepts an audience array containing our id (jose semantics; home-auth emits a string)', async () => {
      expect(
        await verifier(flags()).verify(
          await sign({ aud: [CLIENT_ID, 'home-chat'] }),
        ),
      ).not.toBeNull();
    });

    it('rejects a missing audience', async () => {
      expect(
        await verifier(flags()).verify(await sign({ aud: null })),
      ).toBeNull();
    });

    it('rejects a wrong issuer', async () => {
      expect(
        await verifier(flags()).verify(
          await sign({ iss: 'https://evil.example.test' }),
        ),
      ).toBeNull();
    });

    it('expects the origin of AUTH_SERVICE_URL as issuer, whatever path it carries', async () => {
      const withPath = verifier(flags(), `${origin}/auth`);

      expect(await withPath.verify(await sign())).not.toBeNull(); // iss = origin
      expect(
        await withPath.verify(await sign({ iss: `${origin}/auth` })),
      ).toBeNull();
      expect(
        await withPath.verify(await sign({ iss: `${origin}/` })),
      ).toBeNull();
    });

    it('rejects a missing issuer', async () => {
      expect(
        await verifier(flags()).verify(await sign({ iss: null })),
      ).toBeNull();
    });

    it('rejects an algorithm other than RS256 even with a published key', async () => {
      expect(
        await verifier(flags()).verify(
          await sign({ alg: 'ES256', kid: 'ec', key: ec.privateKey }),
        ),
      ).toBeNull();
    });

    it('rejects an alg=none token', async () => {
      const header = Buffer.from('{"alg":"none"}').toString('base64url');
      const body = Buffer.from(
        JSON.stringify({
          sub: 'user-1',
          email: 'ada@example.test',
          name: 'Ada',
          iat: Math.floor(Date.now() / 1000),
          aud: CLIENT_ID,
          iss: origin,
        }),
      ).toString('base64url');
      expect(await verifier(flags()).verify(`${header}.${body}.`)).toBeNull();
    });

    it('still rejects a bad signature', async () => {
      expect(
        await verifier(flags()).verify(await sign({ key: other.privateKey })),
      ).toBeNull();
    });
  });

  describe('flag evaluation', () => {
    it('asks for auth-verify-token-claims with code default false', async () => {
      const flags = new StubFlags(false);
      await verifier(flags).verify(await sign());
      expect(flags.asked).toEqual([{ key: FLAG, codeDefault: false }]);
    });

    it('never fails the request when the flag evaluation throws (current behaviour)', async () => {
      const result = await verifier(new StubFlags('throws')).verify(
        await sign({ aud: 'home-chat' }),
      );
      expect(result).not.toBeNull();
    });
  });
});
