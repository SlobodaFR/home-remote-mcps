import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { applySecurityHeaders } from './security-headers';
import { setupSwagger } from './swagger';

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
  applySecurityHeaders(app);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  setupSwagger(app, env.NODE_ENV);
}
