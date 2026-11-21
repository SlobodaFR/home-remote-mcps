import { HttpException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { assertSameOrigin } from './guards/same-origin.guard';

/**
 * Requests that carry no session cookie and are not sent by a browser of the admin UI:
 * - MCP endpoints (API key in the URL path, called by Claude's servers);
 * - the home-auth logout webhook (shared secret in the query string).
 * Everything else under /api is cookie-authenticated or must be assumed to be.
 */
const EXEMPT_PATHS = [/^\/api\/mcp\//, /^\/api\/auth\/disconnect\/?$/];

/**
 * CSRF protection for the whole /api surface, fail-closed: every mutating request under /api must
 * be same-origin unless its path is in the exempt list above, so a route added tomorrow is covered
 * without anyone remembering to guard it. It runs before every Nest guard (session, rate limit...),
 * so a cross-site request triggers no session work at all.
 *
 * It decides on the raw path, like Express routing does (case-insensitive, no decoding): a path
 * that only looks like an exempt one does not match any other route.
 */
export function createSameOriginMiddleware(
  trustedOrigins: ReadonlySet<string>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.originalUrl.split('?')[0].toLowerCase();
    const underApi = path === '/api' || path.startsWith('/api/');
    if (!underApi || EXEMPT_PATHS.some((pattern) => pattern.test(path))) {
      next();
      return;
    }
    try {
      assertSameOrigin(req, trustedOrigins);
    } catch (error) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json(error.getResponse());
        return;
      }
      throw error;
    }
    next();
  };
}
