/**
 * Routes the SPA fallback (ServeStaticModule) must never answer: everything server-side lives under
 * the /api global prefix, so an unknown /api/... URL has to be a JSON 404, not the SPA shell.
 *
 * serve-static compiles these with path-to-regexp 0.x, where a bare `'/api*'` only matches the
 * literal path "/api*": hence the explicit `(.*)` form (covered by spa.spec.ts).
 */
export const SPA_EXCLUDED_ROUTES = ['/api', '/api/(.*)'];
