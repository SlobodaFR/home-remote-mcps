/**
 * Internal health check route, served outside the /api prefix so that Caddy can block it with
 * `respond /healthz* 404` (deploy/Caddyfile, checked by caddyfile.spec.ts). Used by the controller,
 * the global prefix exclusion and the SPA fallback exclusion; the logger's quiet path
 * (infrastructure/logging/logger.config.ts) repeats the literal, as infrastructure does not import
 * from interfaces.
 */
export const HEALTH_ROUTE = 'healthz';
