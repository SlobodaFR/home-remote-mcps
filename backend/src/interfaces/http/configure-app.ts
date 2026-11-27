import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { LoggerErrorInterceptor } from 'nestjs-pino';
import { HEALTH_ROUTE } from './health-route';
import { trustedOriginsFrom } from './guards/same-origin.guard';
import { applySecurityHeaders } from './security-headers';
import { createSameOriginMiddleware } from './same-origin.middleware';
import { isSwaggerEnabled, setupSwagger } from './swagger';

/**
 * Options of NestFactory.create, shared by main.ts and the tests. `rawBody` keeps the exact bytes
 * of JSON requests (`req.rawBody`): the logout webhook signature is computed over them.
 */
export const NEST_APPLICATION_OPTIONS = {
  bufferLogs: true,
  rawBody: true,
} as const;

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
  // /healthz is outside the /api prefix so that Caddy can block it with `respond /healthz* 404`.
  // /version (public release identity) is outside /api too, and not blocked by Caddy.
  app.setGlobalPrefix('api', { exclude: [HEALTH_ROUTE, 'version'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  // Puts the real exception on the request completion log line (through the whitelist serializer).
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  setupSwagger(app, env.NODE_ENV);
}
