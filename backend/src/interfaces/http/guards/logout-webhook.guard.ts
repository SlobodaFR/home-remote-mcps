import { createHash, timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RecentIds } from '../../../domain/auth/seen-ids';
import {
  checkWebhookSignature,
  WEBHOOK_TOLERANCE_SECONDS,
} from '../../../domain/auth/webhook-signature';
import { FeatureFlags } from '../../../domain/shared/feature-flags';

/** home-features flag: the signature becomes mandatory, the legacy `?secret=` is refused. Default: off. */
export const REQUIRE_SIGNATURE_FLAG = 'auth-webhook-require-signature';

/** Optional provider of the clock (epoch ms), for tests; defaults to Date.now. */
export const LOGOUT_WEBHOOK_CLOCK = Symbol('LOGOUT_WEBHOOK_CLOCK');

const REPLAY_WINDOW_MS = 10 * 60_000;
const LOG_INTERVAL_MS = 5 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIX_SECONDS = /^\d{1,15}$/;

/** Why a delivery did not authenticate through its signature (logged, never the values). */
type SignatureProblem =
  | 'no-signature-headers'
  | 'raw-body-unavailable'
  | 'missing-signing-secret'
  | 'format'
  | 'window'
  | 'hmac'
  | 'replay';

/**
 * Authenticates the home-auth logout webhook (contract PC7), during the transition with two
 * accepted proofs:
 * - the signature: `X-Auth-Webhook-Signature` = HMAC-SHA256(AUTH_WEBHOOK_SIGNING_SECRET,
 *   id.timestamp.rawBody) with |now - timestamp| <= 120 s and an id not seen in the last 10 minutes;
 * - or the legacy shared secret in the query string (`?secret=`, AUTH_WEBHOOK_SECRET).
 * With the `auth-webhook-require-signature` flag on, only the signature is accepted. A signature
 * that does not hold (bad, expired, replayed, no secret configured) falls back to the legacy
 * proof like any other request, with a throttled warning naming why. A replayed id is the
 * exception: as soon as any signature header is present and the id was already accepted, the
 * delivery is refused, even with a valid `?secret=`. Without
 * AUTH_WEBHOOK_SIGNING_SECRET, only the legacy proof exists.
 */
@Injectable()
export class LogoutWebhookGuard implements CanActivate {
  private readonly logger = new Logger(LogoutWebhookGuard.name);
  private readonly seenIds: RecentIds;
  private readonly lastLogs = new Map<string, number>();
  private warnedMissingSecret = false;

  constructor(
    private readonly config: ConfigService,
    private readonly flags: FeatureFlags,
    @Optional()
    @Inject(LOGOUT_WEBHOOK_CLOCK)
    private readonly now: () => number = Date.now,
  ) {
    this.seenIds = new RecentIds(REPLAY_WINDOW_MS, this.now);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    const problem = this.signatureProblem(request);
    if (problem === null) {
      this.throttled('signature', () =>
        this.logger.log('Logout webhook accepted through its signature'),
      );
      return true;
    }
    if (problem === 'replay') {
      return this.refused(problem);
    }
    if (await this.signatureRequired()) {
      this.warnIfNoSigningSecret();
      this.refused(problem);
    }
    if (this.legacySecretMatches(request)) {
      // The operator reads this before enabling auth-webhook-require-signature: none over a full
      // day of deliveries means every delivery is signed.
      this.throttled(`legacy:${problem}`, () =>
        this.logger.warn(
          `Logout webhook accepted through the legacy ?secret= (signature: ${problem})`,
        ),
      );
      return true;
    }
    return this.refused(problem);
  }

  /** Null when the signature authenticates the delivery, else the first reason it does not. */
  private signatureProblem(
    request: RawBodyRequest<Request>,
  ): SignatureProblem | null {
    const id = request.header('x-auth-webhook-id');
    const timestamp = request.header('x-auth-webhook-timestamp');
    const signature = request.header('x-auth-webhook-signature');
    if (!id && !timestamp && !signature) {
      return 'no-signature-headers';
    }
    // Replay first: a seen id is refused whatever else is wrong, and even with a valid ?secret=.
    if (id && this.seenIds.has(id.toLowerCase())) {
      return 'replay';
    }
    const secret = this.config.get<string>('AUTH_WEBHOOK_SIGNING_SECRET');
    if (!secret) {
      return 'missing-signing-secret';
    }
    const { rawBody } = request;
    if (!rawBody) {
      return 'raw-body-unavailable';
    }
    if (
      !id ||
      !timestamp ||
      !signature ||
      !UUID.test(id) ||
      !UNIX_SECONDS.test(timestamp)
    ) {
      return 'format';
    }
    if (
      Math.abs(Math.floor(this.now() / 1000) - Number(timestamp)) >
      WEBHOOK_TOLERANCE_SECONDS
    ) {
      return 'window';
    }
    const check = checkWebhookSignature(
      secret,
      id,
      timestamp,
      signature,
      rawBody,
    );
    if (check !== 'valid') {
      return check === 'malformed' ? 'format' : 'hmac';
    }
    // Only a delivery that is authentic is remembered: nobody can burn ids without the secret.
    return this.seenIds.remember(id.toLowerCase()) ? null : 'replay';
  }

  private refused(problem: SignatureProblem): never {
    this.throttled(`refused:${problem}`, () =>
      this.logger.warn(`Logout webhook refused (signature: ${problem})`),
    );
    throw new UnauthorizedException();
  }

  /** Runs `log` at most once per 5 minutes per key: a busy day must not flood the logs. */
  private throttled(key: string, log: () => void): void {
    const last = this.lastLogs.get(key);
    const at = this.now();
    if (last !== undefined && at - last < LOG_INTERVAL_MS) {
      return;
    }
    this.lastLogs.set(key, at);
    log();
  }

  private legacySecretMatches(request: Request): boolean {
    const provided: unknown = request.query.secret;
    return (
      typeof provided === 'string' &&
      safeEqual(provided, this.config.getOrThrow<string>('AUTH_WEBHOOK_SECRET'))
    );
  }

  /** Never blocks nor fails the delivery: any problem reading the flag means the code default. */
  private async signatureRequired(): Promise<boolean> {
    try {
      return await this.flags.isEnabled(REQUIRE_SIGNATURE_FLAG, false);
    } catch {
      return false;
    }
  }

  private warnIfNoSigningSecret(): void {
    if (
      !this.warnedMissingSecret &&
      !this.config.get<string>('AUTH_WEBHOOK_SIGNING_SECRET')
    ) {
      this.warnedMissingSecret = true;
      this.logger.error(
        `${REQUIRE_SIGNATURE_FLAG} is on but AUTH_WEBHOOK_SIGNING_SECRET is not set: every logout webhook is refused`,
      );
    }
  }
}

/** Constant-time comparison of two strings of any length (both are hashed to 32 bytes first). */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
