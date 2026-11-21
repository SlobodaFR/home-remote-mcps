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
// Swagger UI (/docs, only when enabled) needs inline scripts and gets the same treatment.
const withoutCsp = helmet({ ...COMMON, contentSecurityPolicy: false });

/**
 * Security headers for every response. Must be the first middleware. The CSP applies to every
 * document the service can serve, i.e. the admin SPA and its fallback. It is skipped only where the
 * service does not produce documents:
 * - `/api/*`: JSON and MCP. This relies on the SPA fallback excluding /api (SPA_EXCLUDED_ROUTES),
 *   otherwise an unknown /api URL would return the SPA shell without CSP.
 * - `/docs*`, only when Swagger is actually mounted (`docsEnabled`): in production those URLs fall
 *   through to the SPA fallback and must carry the CSP like any other SPA URL.
 */
export function applySecurityHeaders(
  app: NestExpressApplication,
  options: { docsEnabled: boolean },
): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive: match the same way.
    const path = req.path.toLowerCase();
    const isApi = path === '/api' || path.startsWith('/api/');
    const isDocs =
      options.docsEnabled &&
      (path === '/docs' ||
        path.startsWith('/docs/') ||
        path.startsWith('/docs-'));
    (isApi || isDocs ? withoutCsp : forAdminUi)(req, res, next);
  });
}
