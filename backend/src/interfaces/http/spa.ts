import { HEALTH_ROUTE } from './health-route';

/**
 * Routes the SPA fallback (ServeStaticModule) must never answer: everything server-side lives under
 * the /api global prefix, so an unknown /api/... URL has to be a JSON 404, not the SPA shell.
 *
 * serve-static 5 (Express 5) compiles these with path-to-regexp 8: wildcards must be named
 * (`*path`, which needs at least one segment, hence the bare route listed too). The old `(.*)`
 * regex form is a syntax error (covered by security-headers.spec.ts).
 */
export const SPA_EXCLUDED_ROUTES = [
  '/api',
  '/api/*path',
  // Internal health check, served outside the /api prefix.
  `/${HEALTH_ROUTE}`,
  `/${HEALTH_ROUTE}/*path`,
];
