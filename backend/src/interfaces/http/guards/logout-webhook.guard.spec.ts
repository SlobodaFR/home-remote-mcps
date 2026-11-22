import { ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MockInstance } from 'vitest';
import { computeWebhookSignature } from '../../../domain/auth/webhook-signature';
import { FeatureFlags } from '../../../domain/shared/feature-flags';
import { LogoutWebhookGuard } from './logout-webhook.guard';

const SIGNING = 'ab12'.repeat(16);
const LEGACY = 'legacy-shared-secret';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const BODY = Buffer.from('{"userId":"u1"}');

class Flags extends FeatureFlags {
  async isEnabled(_key: string, codeDefault: boolean): Promise<boolean> {
    return codeDefault;
  }
}

describe('LogoutWebhookGuard (unit, injectable clock)', () => {
  let nowMs: number;
  let warn: MockInstance<Logger['warn']>;
  let info: MockInstance<Logger['log']>;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function guard(signing: string | undefined = SIGNING): LogoutWebhookGuard {
    const config = new ConfigService({
      AUTH_WEBHOOK_SECRET: LEGACY,
      AUTH_WEBHOOK_SIGNING_SECRET: signing,
    });
    return new LogoutWebhookGuard(config, new Flags(), () => nowMs);
  }

  function ctx(
    headers: Record<string, string>,
    opts: { rawBody?: Buffer | undefined; secret?: string } = {},
  ): ExecutionContext {
    const lower = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const request = {
      header: (name: string) => lower[name.toLowerCase()],
      rawBody: 'rawBody' in opts ? opts.rawBody : BODY,
      query: opts.secret === undefined ? {} : { secret: opts.secret },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function signed(id = ID): Record<string, string> {
    const ts = String(Math.floor(nowMs / 1000));
    return {
      'x-auth-webhook-id': id,
      'x-auth-webhook-timestamp': ts,
      'x-auth-webhook-signature': `v1=${computeWebhookSignature(SIGNING, id, ts, BODY)}`,
    };
  }

  const warned = () => warn.mock.calls.map((c) => String(c[0]));

  it('accepts through the legacy secret with the reason raw-body-unavailable', async () => {
    await expect(
      guard().canActivate(
        ctx(signed(), { rawBody: undefined, secret: LEGACY }),
      ),
    ).resolves.toBe(true);
    expect(warned()).toHaveLength(1);
    expect(warned()[0]).toContain('raw-body-unavailable');
  });

  it('refuses a replayed lone id with the valid legacy secret', async () => {
    const g = guard();
    await expect(g.canActivate(ctx(signed()))).resolves.toBe(true);
    await expect(
      g.canActivate(ctx({ 'x-auth-webhook-id': ID }, { secret: LEGACY })),
    ).rejects.toThrow('Unauthorized');
  });

  it('checks the seen id before the missing-signing-secret and raw-body reasons', async () => {
    const g = guard();
    await g.canActivate(ctx(signed()));
    await expect(
      g.canActivate(ctx(signed(), { rawBody: undefined, secret: LEGACY })),
    ).rejects.toThrow('Unauthorized');
  });

  it('throttles one WARN per reason and one INFO using the injected clock', async () => {
    const g = guard();
    await g.canActivate(ctx({}, { secret: LEGACY }));
    await g.canActivate(ctx({}, { secret: LEGACY }));
    expect(warned()).toHaveLength(1);
    nowMs += 5 * 60_000 + 1;
    await g.canActivate(ctx({}, { secret: LEGACY }));
    expect(warned()).toHaveLength(2);

    await g.canActivate(ctx(signed('00000000-0000-4000-8000-000000000001')));
    await g.canActivate(ctx(signed('00000000-0000-4000-8000-000000000002')));
    expect(info).toHaveBeenCalledTimes(1);
    nowMs += 5 * 60_000 + 1;
    await g.canActivate(ctx(signed('00000000-0000-4000-8000-000000000003')));
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('forgets an id after the 10 minute replay TTL, using the injected clock', async () => {
    const g = guard();
    await g.canActivate(ctx(signed()));
    nowMs += 10 * 60_000 + 1;
    await expect(
      g.canActivate(ctx({ 'x-auth-webhook-id': ID }, { secret: LEGACY })),
    ).resolves.toBe(true);
  });
});
