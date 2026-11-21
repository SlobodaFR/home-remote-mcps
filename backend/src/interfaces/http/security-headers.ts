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
// Applied to all responses (see applySecurityHeaders).
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

// Swagger UI (/docs, outside production only) needs inline scripts.
const forSwagger = helmet({ ...COMMON, contentSecurityPolicy: false });

/**
 * Security headers for every response. Must be the first middleware.
 *
 * The strict CSP is sent on EVERY response, including `/api/*` where it is inert for non-browser
 * clients (MCP, JSON): deciding by request path which responses are "not documents" always
 * disagrees with some handler's own path normalization (express.static decodes `/api/..%2findex.html`
 * to the SPA shell), which would serve the admin SPA without CSP. The only exemption is Swagger,
 * and only when it is actually mounted (`docsEnabled`): in production `/docs*` is just the SPA
 * fallback and keeps the CSP.
 */
export function applySecurityHeaders(
  app: NestExpressApplication,
  options: { docsEnabled: boolean },
): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive: match the same way.
    const path = req.path.toLowerCase();
    const isSwagger =
      options.docsEnabled &&
      (path === '/docs' ||
        path.startsWith('/docs/') ||
        path.startsWith('/docs-'));
    (isSwagger ? forSwagger : forAdminUi)(req, res, next);
  });
}
