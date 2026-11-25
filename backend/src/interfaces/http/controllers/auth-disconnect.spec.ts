import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { HandleOAuthCallbackUseCase } from '../../../application/auth/handle-oauth-callback.use-case';
import { InitiateServiceLogoutUseCase } from '../../../application/auth/initiate-service-logout.use-case';
import { HandleSessionRevokedUseCase } from '../../../application/auth/handle-session-revoked.use-case';
import { OAuthClient } from '../../../domain/auth/oauth-client';
import { computeWebhookSignature } from '../../../domain/auth/webhook-signature';
import { FeatureFlags } from '../../../domain/shared/feature-flags';
import { configureApp, NEST_APPLICATION_OPTIONS } from '../configure-app';
import { REQUIRE_SIGNATURE_FLAG } from '../guards/logout-webhook.guard';
import { AuthController } from './auth.controller';

/** Fixed vectors of contract PC7 (home-auth#83), see domain/auth/webhook-signature.spec.ts. */
const SECRET_1 =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SECRET_2 =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const TIMESTAMP = 1_700_000_000;
const BODY = '{"userId":"u1"}';
const LEGACY_SECRET = 'legacy-shared-secret';

class StubFlags extends FeatureFlags {
  requireSignature: boolean | 'throws' = false;
  readonly asked: { key: string; codeDefault: boolean }[] = [];
  async isEnabled(key: string, codeDefault: boolean): Promise<boolean> {
    this.asked.push({ key, codeDefault });
    if (this.requireSignature === 'throws') {
      throw new Error('flags down');
    }
    return key === REQUIRE_SIGNATURE_FLAG ? this.requireSignature : codeDefault;
  }
}

describe('POST /api/auth/disconnect (signed logout webhook, PC7)', () => {
  let app: NestExpressApplication;
  let flags: StubFlags;
  const revoked: string[] = [];

  async function boot(signingSecret?: string): Promise<void> {
    flags = new StubFlags();
    revoked.length = 0;
    const env = {
      AUTH_WEBHOOK_SECRET: LEGACY_SECRET,
      AUTH_WEBHOOK_SIGNING_SECRET: signingSecret,
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
      controllers: [AuthController],
      providers: [
        { provide: FeatureFlags, useValue: flags },
        { provide: OAuthClient, useValue: {} },
        { provide: HandleOAuthCallbackUseCase, useValue: {} },
        { provide: InitiateServiceLogoutUseCase, useValue: {} },
        {
          provide: HandleSessionRevokedUseCase,
          useValue: {
            execute: (userId: string) => {
              revoked.push(userId);
              return Promise.resolve();
            },
          },
        },
      ],
    }).compile();
    // The options main.ts uses: rawBody is what the signature is computed over.
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: NEST_APPLICATION_OPTIONS.rawBody,
    });
    configureApp(app, env);
    await app.init();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TIMESTAMP * 1000);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  function sign(
    secret: string,
    overrides: { id?: string; ts?: number; body?: string } = {},
  ): Record<string, string> {
    const id = overrides.id ?? ID;
    const ts = overrides.ts ?? TIMESTAMP;
    const body = overrides.body ?? BODY;
    return {
      'X-Auth-Webhook-Id': id,
      'X-Auth-Webhook-Timestamp': String(ts),
      'X-Auth-Webhook-Signature': `v1=${computeWebhookSignature(secret, id, ts, body)}`,
    };
  }

  /** What home-auth does: raw JSON bytes, no Origin, no cookie. */
  function post(
    headers: Record<string, string> = {},
    body = BODY,
    query = '',
  ): request.Test {
    return request(app.getHttpServer())
      .post(`/api/auth/disconnect${query}`)
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);
  }

  describe('with a signing secret, flag off (double acceptance)', () => {
    beforeEach(() => boot(SECRET_1));

    it('accepts a valid signature (vector 1) without any Origin header', async () => {
      await post(sign(SECRET_1)).expect(204);
      expect(revoked).toEqual(['u1']);
    });

    it('accepts the old ?secret= without signature', async () => {
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
      expect(revoked).toEqual(['u1']);
    });

    it('refuses neither proof (no signature, no secret, wrong secret, array secret)', async () => {
      await post().expect(401);
      await post({}, BODY, '?secret=nope').expect(401);
      await post({}, BODY, `?secret=${LEGACY_SECRET}x`).expect(401);
      await post(
        {},
        BODY,
        `?secret=${LEGACY_SECRET}&secret=${LEGACY_SECRET}`,
      ).expect(401);
      expect(revoked).toEqual([]);
    });

    it('signs the exact bytes received, not a re-serialisation', async () => {
      const spaced = '{ "userId": "u1" }';
      await post(sign(SECRET_1, { body: spaced }), spaced).expect(204);
      // Signed for BODY, sent as another string with the same JSON meaning.
      await post(
        sign(SECRET_1, { id: '00000000-0000-4000-8000-000000000009' }),
        spaced,
      ).expect(401);
      expect(revoked).toEqual(['u1']);
    });

    it('verifies a body with non-ASCII characters as UTF-8 bytes (vector 3)', async () => {
      const body = '{"userId":"4b8f-é"}';
      const id = '9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30';
      vi.setSystemTime(1_700_000_123 * 1000);
      await post(
        {
          'X-Auth-Webhook-Id': id,
          'X-Auth-Webhook-Timestamp': '1700000123',
          'X-Auth-Webhook-Signature':
            'v1=d9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac',
        },
        body,
      ).expect(204);
      expect(revoked).toEqual(['4b8f-é']);
    });

    it('accepts either secret during an overlap (two v1= entries, vector 4)', async () => {
      const headers = {
        ...sign(SECRET_2),
        'X-Auth-Webhook-Signature': `v1=${computeWebhookSignature(SECRET_2, ID, TIMESTAMP, BODY)},v1=${computeWebhookSignature(SECRET_1, ID, TIMESTAMP, BODY)}`,
      };
      await post(headers).expect(204);
    });

    it('refuses a signature made with another secret when no legacy secret is sent', async () => {
      await post(sign(SECRET_2)).expect(401);
    });

    it('refuses a modified body', async () => {
      await post(sign(SECRET_1), '{"userId":"u2"}').expect(401);
      expect(revoked).toEqual([]);
    });

    it('accepts |now - ts| <= 120 s and refuses beyond, both directions', async () => {
      const ids = [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
      ];
      await post(sign(SECRET_1, { id: ids[0], ts: TIMESTAMP - 120 })).expect(
        204,
      );
      await post(sign(SECRET_1, { id: ids[1], ts: TIMESTAMP + 120 })).expect(
        204,
      );
      await post(sign(SECRET_1, { id: ids[2], ts: TIMESTAMP - 121 })).expect(
        401,
      );
      await post(sign(SECRET_1, { id: ids[3], ts: TIMESTAMP + 121 })).expect(
        401,
      );
    });

    it('refuses a replayed delivery (same id), even with the correct legacy secret', async () => {
      await post(sign(SECRET_1)).expect(204);
      await post(sign(SECRET_1)).expect(401);
      await post(sign(SECRET_1), BODY, `?secret=${LEGACY_SECRET}`).expect(401);
      expect(revoked).toEqual(['u1']);
    });

    it('refuses a replayed id even when the other signature headers are absent (lone id) or wrong', async () => {
      await post(sign(SECRET_1)).expect(204);
      await post(
        { 'X-Auth-Webhook-Id': ID },
        BODY,
        `?secret=${LEGACY_SECRET}`,
      ).expect(401);
      await post(
        { ...sign(SECRET_2), 'X-Auth-Webhook-Timestamp': 'abc' },
        BODY,
        `?secret=${LEGACY_SECRET}`,
      ).expect(401);
      expect(revoked).toEqual(['u1']);
    });

    it('a lone unseen id with the correct legacy secret falls back to the legacy proof', async () => {
      await post(
        { 'X-Auth-Webhook-Id': ID },
        BODY,
        `?secret=${LEGACY_SECRET}`,
      ).expect(204);
      // Not remembered: nothing verified it.
      await post(
        { 'X-Auth-Webhook-Id': ID },
        BODY,
        `?secret=${LEGACY_SECRET}`,
      ).expect(204);
    });

    it('does not burn an id with a forged signature: the real delivery still passes', async () => {
      await post({
        ...sign(SECRET_1),
        'X-Auth-Webhook-Signature': `v1=${'0'.repeat(64)}`,
      }).expect(401);
      await post(sign(SECRET_1)).expect(204);
    });

    it('forgets an id after 10 minutes (the timestamp window is the limit then)', async () => {
      await post(sign(SECRET_1)).expect(204);
      vi.setSystemTime((TIMESTAMP + 601) * 1000);
      await post(sign(SECRET_1)).expect(401); // timestamp now outside the 120 s window
      await post(sign(SECRET_1, { ts: TIMESTAMP + 601 })).expect(204);
    });

    it.each([
      ['a non-uuid id', { 'X-Auth-Webhook-Id': 'not-a-uuid' }],
      ['a non-numeric timestamp', { 'X-Auth-Webhook-Timestamp': '17e8' }],
      ['an empty signature', { 'X-Auth-Webhook-Signature': '' }],
      ['a short signature', { 'X-Auth-Webhook-Signature': 'v1=abcd' }],
      [
        'an unknown scheme',
        { 'X-Auth-Webhook-Signature': `v2=${'a'.repeat(64)}` },
      ],
    ])('refuses %s', async (_name, override) => {
      await post({ ...sign(SECRET_1), ...override }).expect(401);
      expect(revoked).toEqual([]);
    });

    it('refuses a signed request missing one of the three headers', async () => {
      for (const header of [
        'X-Auth-Webhook-Id',
        'X-Auth-Webhook-Timestamp',
        'X-Auth-Webhook-Signature',
      ]) {
        const headers = sign(SECRET_1, {
          id: `00000000-0000-4000-8000-0000000000${header.length.toString()}`,
        });
        delete headers[header];
        await post(headers).expect(401);
      }
    });

    it('the path is exempt from the same-origin middleware, so only a proof authenticates', async () => {
      // Exempt path: a browser-looking request still needs a proof.
      await post({ Origin: 'https://evil.test' }).expect(401);
      await post({ Origin: 'https://evil.test', ...sign(SECRET_1) }).expect(
        204,
      );
    });
  });

  describe('observability (to confirm the signature is used before the strict flag)', () => {
    let warn: MockInstance<Logger['warn']>;
    let info: MockInstance<Logger['log']>;
    const FIVE_MINUTES = 5 * 60;
    const warned = () => warn.mock.calls.map((call) => String(call[0]));
    const informed = () => info.mock.calls.map((call) => String(call[0]));

    beforeEach(() => {
      warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('with a signing secret', () => {
      beforeEach(() => boot(SECRET_1));

      it('warns when a delivery is accepted through the legacy ?secret=, with the reason', async () => {
        await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);

        expect(warned()).toHaveLength(1);
        expect(warned()[0]).toContain('legacy');
        expect(warned()[0]).toContain('no-signature-headers');
      });

      it.each([
        [
          'format',
          () => ({ ...sign(SECRET_1), 'X-Auth-Webhook-Id': 'not-a-uuid' }),
        ],
        ['window', () => sign(SECRET_1, { ts: TIMESTAMP - 121 })],
        ['hmac', () => sign(SECRET_2)],
      ])('names the reason %s', async (reason, headers) => {
        await post(headers(), BODY, `?secret=${LEGACY_SECRET}`).expect(204);

        expect(warned()).toHaveLength(1);
        expect(warned()[0]).toContain(reason);
      });

      it('refuses a replay even with the legacy secret, logging the refusal and no legacy acceptance', async () => {
        await post(sign(SECRET_1)).expect(204);
        await post(sign(SECRET_1), BODY, `?secret=${LEGACY_SECRET}`).expect(
          401,
        );

        expect(warned()).toHaveLength(1);
        expect(warned()[0]).toContain('refused');
        expect(warned()[0]).toContain('replay');
        expect(warned().join('\n')).not.toContain('accepted');
      });

      it('warns at most once per 5 minutes per reason, and again after', async () => {
        await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
        await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
        await post(sign(SECRET_2), BODY, `?secret=${LEGACY_SECRET}`).expect(
          204,
        ); // other reason
        expect(warned()).toHaveLength(2);

        vi.setSystemTime((TIMESTAMP + FIVE_MINUTES + 1) * 1000);
        await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
        expect(warned()).toHaveLength(3);
      });

      it('logs an acceptance through the signature (throttled), and no warning', async () => {
        await post(sign(SECRET_1)).expect(204);
        await post(
          sign(SECRET_1, { id: '00000000-0000-4000-8000-00000000000a' }),
        ).expect(204);

        expect(warned()).toEqual([]);
        expect(informed().filter((m) => m.includes('signature'))).toHaveLength(
          1,
        );

        vi.setSystemTime((TIMESTAMP + FIVE_MINUTES + 1) * 1000);
        await post(
          sign(SECRET_1, {
            id: '00000000-0000-4000-8000-00000000000b',
            ts: TIMESTAMP + FIVE_MINUTES + 1,
          }),
        ).expect(204);
        expect(informed().filter((m) => m.includes('signature'))).toHaveLength(
          2,
        );
      });

      it('never logs a secret, a signature or a user id', async () => {
        const headers = sign(SECRET_2);
        await post(headers, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
        await post({}, BODY, '?secret=wrong-value').expect(401);
        await post(sign(SECRET_1)).expect(204);

        const logs = [...warned(), ...informed()].join('\n');
        for (const forbidden of [
          SECRET_1,
          SECRET_2,
          LEGACY_SECRET,
          'wrong-value',
          headers['X-Auth-Webhook-Signature'],
          headers['X-Auth-Webhook-Signature'].slice(3),
          'u1',
        ]) {
          expect(logs).not.toContain(forbidden);
        }
      });

      it('warns about a refusal too, with the reason (nothing else accepted it)', async () => {
        await post(sign(SECRET_2)).expect(401);

        expect(warned()).toHaveLength(1);
        expect(warned()[0]).toContain('refused');
        expect(warned()[0]).toContain('hmac');
      });
    });

    describe('without a signing secret', () => {
      beforeEach(() => boot(undefined));

      it('names the reason missing-signing-secret when a signed delivery arrives', async () => {
        await post(sign(SECRET_1), BODY, `?secret=${LEGACY_SECRET}`).expect(
          204,
        );

        expect(warned()).toHaveLength(1);
        expect(warned()[0]).toContain('missing-signing-secret');
      });
    });
  });

  describe('flag auth-webhook-require-signature on', () => {
    beforeEach(async () => {
      await boot(SECRET_1);
      flags.requireSignature = true;
    });

    it('still accepts a valid signature', async () => {
      await post(sign(SECRET_1)).expect(204);
    });

    it('refuses the old ?secret=, even a correct one', async () => {
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(401);
      expect(revoked).toEqual([]);
    });

    it('refuses a replayed signature even with the correct legacy secret (flag on)', async () => {
      await post(sign(SECRET_1)).expect(204);
      await post(sign(SECRET_1), BODY, `?secret=${LEGACY_SECRET}`).expect(401);
      expect(revoked).toEqual(['u1']);
    });

    it('refuses a bad signature even with the correct legacy secret', async () => {
      await post(sign(SECRET_2), BODY, `?secret=${LEGACY_SECRET}`).expect(401);
    });

    it('asks the flag with code default false', async () => {
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(401);
      expect(flags.asked).toContainEqual({
        key: 'auth-webhook-require-signature',
        codeDefault: false,
      });
    });
  });

  describe('flag evaluation failing', () => {
    it('never fails the delivery: the legacy secret is still accepted', async () => {
      await boot(SECRET_1);
      flags.requireSignature = 'throws';
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
    });
  });

  describe('without AUTH_WEBHOOK_SIGNING_SECRET', () => {
    beforeEach(() => boot(undefined));

    it('only the old ?secret= path exists, a signature proves nothing', async () => {
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(204);
      await post(sign(SECRET_1)).expect(401);
      await post({
        ...sign(''),
      }).expect(401);
    });

    it('with the flag on, everything is refused (nothing to verify with)', async () => {
      flags.requireSignature = true;
      await post(sign(SECRET_1)).expect(401);
      await post({}, BODY, `?secret=${LEGACY_SECRET}`).expect(401);
    });
  });
});
