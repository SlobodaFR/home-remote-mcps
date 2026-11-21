import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

const COMMON = {
  strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true }, // no preload: hard to undo
  frameguard: { action: 'deny' as const },
  // OAuth callbacks (?code=) and MCP URLs (API key in the path) must never leak through Referer.
  referrerPolicy: { policy: 'no-referrer' as const },
};

// Admin SPA (React, built by Vite): own scripts and styles, Google Fonts (index.html), fetch to /api.
const forAdminUi = helmet({
  ...COMMON,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
});

// JSON API and MCP endpoints (called by Claude servers, not browsers): no document, so no CSP.
// Swagger UI (/docs, outside production only) needs inline scripts and gets the same treatment.
const withoutCsp = helmet({ ...COMMON, contentSecurityPolicy: false });

/**
 * Security headers for every response. Must be the first middleware. The CSP only applies to the
 * admin UI (everything outside the /api prefix, i.e. the SPA static files and its fallback).
 */
export function applySecurityHeaders(app: NestExpressApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive: match the same way.
    const path = req.path.toLowerCase();
    const withoutDocument =
      path === '/api' ||
      path.startsWith('/api/') ||
      path === '/docs' ||
      path.startsWith('/docs/') ||
      path.startsWith('/docs-');
    (withoutDocument ? withoutCsp : forAdminUi)(req, res, next);
  });
}
