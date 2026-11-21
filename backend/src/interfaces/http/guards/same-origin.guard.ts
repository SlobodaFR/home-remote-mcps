import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Bodies an HTML form can send cross-site without a CORS preflight.
const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'text/plain'];

export interface SameOriginRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Origins of the public URLs of this service (the admin SPA is served from them). */
export function trustedOriginsFrom(
  urls: readonly (string | undefined)[],
): Set<string> {
  return new Set(
    urls
      .filter((url): url is string => Boolean(url))
      .map((url) => new URL(url).origin),
  );
}

/**
 * CSRF rule for the admin SPA's cookie-authenticated mutations. SameSite=Lax does not stop
 * requests from other *.sloboda.fr subdomains (same-site), so a mutation must come from this very
 * origin: Sec-Fetch-Site: same-origin, or, for browsers without it, a trusted Origin. Form bodies
 * (what a cross-site HTML form can send without preflight) are refused even from the same origin.
 * Fails closed: with no trusted origin configured only Sec-Fetch-Site: same-origin passes.
 */
export function assertSameOrigin(
  request: SameOriginRequest,
  trustedOrigins: ReadonlySet<string>,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return;
  }
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const fetchSite = header('sec-fetch-site');
  const origin = header('origin');
  const sameOrigin = fetchSite
    ? fetchSite === 'same-origin'
    : origin !== undefined && trustedOrigins.has(origin);
  if (!sameOrigin) {
    throw new ForbiddenException('Cross-origin request refused');
  }

  const contentType = header('content-type')?.toLowerCase() ?? '';
  if (FORM_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
    throw new UnsupportedMediaTypeException('Send JSON');
  }
}

/**
 * Route-level form of the rule (second layer): the primary enforcement is the middleware mounted
 * first by configureApp, because a guard runs after the global JwtAuthGuard, i.e. after session
 * work (JWKS, revocation lookup, an outbound token refresh to home-auth) that a cross-site request
 * must never trigger.
 *
 * Not for routes that carry no session cookie: the MCP endpoints (API key in the URL, called by
 * Claude's servers), and the home-auth logout webhook (/auth/disconnect, shared secret).
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly trustedOrigins: Set<string>;

  constructor(config: ConfigService) {
    this.trustedOrigins = trustedOriginsFrom([
      config.get<string>('FRONTEND_URL'),
      config.get<string>('PUBLIC_BASE_URL'),
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    assertSameOrigin(
      context.switchToHttp().getRequest<SameOriginRequest>(),
      this.trustedOrigins,
    );
    return true;
  }
}
