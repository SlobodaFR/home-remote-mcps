import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { trustedOriginsFrom } from './guards/same-origin.guard';
import { applySecurityHeaders } from './security-headers';
import { createSameOriginMiddleware } from './same-origin.middleware';
import { isSwaggerEnabled, setupSwagger } from './swagger';

/**
 * HTTP setup shared by main.ts and the tests, so what the tests check is what runs.
 *
 * No CORS middleware: the SPA is served by this service (same origin, `/api` relative calls, Vite
 * proxies `/api` in dev) and MCP clients are not browsers. Never add a fallback to "any origin"
 * here: responses carry the session cookie.
 */
export function configureApp(
  app: NestExpressApplication,
  env: NodeJS.ProcessEnv,
): void {
  // First middleware: every response (API, MCP, SPA files) gets the security headers.
  applySecurityHeaders(app, { docsEnabled: isSwaggerEnabled(env.NODE_ENV) });
  // Number of reverse-proxy hops to trust for X-Forwarded-For (req.ip feeds the rate limit).
  // Production: 1 (Caddy, which replaces any client-sent X-Forwarded-For since no trusted_proxies
  // is configured). Unset in local dev, otherwise any client could spoof its IP.
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }
  // CSRF check for cookie-authenticated mutations: before any guard (session, throttle).
  app.use(
    createSameOriginMiddleware(
      trustedOriginsFrom([env.FRONTEND_URL, env.PUBLIC_BASE_URL]),
    ),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  setupSwagger(app, env.NODE_ENV);
}
