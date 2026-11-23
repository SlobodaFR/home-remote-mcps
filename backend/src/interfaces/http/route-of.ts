import type { Request } from 'express';

/**
 * Parameterized route of a request ('/api/credentials/:id'), never the raw URL: no ids, API keys,
 * query string or tokens. Returns null for a request that matched no Nest route.
 */
export function routeOf(req: Request): string | null {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : null;
}
