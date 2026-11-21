import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import request from 'supertest';
import { configureApp } from './configure-app';
import { SPA_EXCLUDED_ROUTES } from './spa';

@Controller()
class StubController {
  @Get('credentials')
  credentials(): string {
    return 'json';
  }

  @Post('mcp/garmin/:apiKey')
  mcp(): string {
    return 'mcp';
  }
}

/**
 * Production-shaped app: real ServeStaticModule (same exclude as AppModule) and its SPA fallback.
 * Test.createTestingModule would not register serve-static's routes, so NestFactory is used.
 */
async function createApp(nodeEnv: string): Promise<NestExpressApplication> {
  const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
  writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');

  @Module({
    imports: [
      ServeStaticModule.forRoot({
        rootPath: publicDir,
        exclude: SPA_EXCLUDED_ROUTES,
      }),
    ],
    controllers: [StubController],
  })
  class TestAppModule {}

  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    logger: false,
  });
  configureApp(app, { NODE_ENV: nodeEnv });
  await app.init();
  return app;
}

const expectCommonHeaders = (headers: Record<string, string>) => {
  expect(headers['strict-transport-security']).toBe(
    'max-age=31536000; includeSubDomains',
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  // OAuth callbacks and MCP URLs carry secrets in the URL: never leak them through Referer.
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-powered-by']).toBeUndefined();
};

describe('security headers in production', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp('production');
  });

  afterAll(async () => {
    await app.close();
  });

  it('puts a strict CSP on the admin SPA', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    const csp = response.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)|\*/);
    expectCommonHeaders(response.headers);
  });

  // Client-side routes (/api-keys) are answered by the SPA fallback.
  it('covers the SPA fallback for deep links', async () => {
    const response = await request(app.getHttpServer())
      .get('/api-keys')
      .expect(200);

    expect(response.text).toContain('spa');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  // Swagger is not mounted in production: /docs* is the SPA fallback and must keep the CSP.
  it.each(['/docs', '/docs/', '/docs/anything', '/docs-json', '/DOCS'])(
    'keeps the CSP on %s, which is only the SPA fallback in production',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(200);

      expect(response.text).toContain('spa');
      expect(response.headers['content-security-policy']).toBeDefined();
    },
  );

  // Inert for JSON/MCP clients, and it removes any path-based way to get an unprotected document.
  it.each([
    ['get', '/api/credentials', 200],
    ['post', '/api/mcp/garmin/some-key', 201],
    ['get', '/API/credentials', 200], // Express routes case-insensitively
  ] as const)(
    'sends the CSP and the other headers on %s %s too',
    async (method, path, status) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .expect(status);

      expect(response.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      expectCommonHeaders(response.headers);
    },
  );

  // express.static decodes and normalizes the path on its own: these reach the real index.html.
  it.each([
    '/api/..%2findex.html',
    '/api/..%2Findex.html',
    '/api/%2e%2e/index.html',
    '/api/x/..%2f..%2findex.html',
    '/docs/..%2findex.html',
    '//api/x',
    '/%61pi/x',
    '/api%2Fx',
  ])('never serves an HTML document without CSP: GET %s', async (path) => {
    const response = await request(app.getHttpServer()).get(path);

    const isHtml = Boolean(
      response.headers['content-type']?.includes('text/html'),
    );

    expect(
      !isHtml || response.headers['content-security-policy'] !== undefined,
    ).toBe(true);
  });

  it('actually reaches the SPA shell through the encoded traversal (the test above is not vacuous)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/..%2findex.html')
      .expect(200);

    expect(response.text).toContain('spa');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  // Unknown API URLs must be a JSON error, not the SPA shell.
  it.each(['/api/unknown', '/api/unknown/deeper', '/API/unknown', '/api'])(
    'never answers the SPA shell for an unknown GET %s',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(404);

      expect(response.text).not.toContain('spa');
      expect(response.headers['content-type']).not.toContain('text/html');
    },
  );
});

describe('security headers in development', () => {
  it('does not apply the strict CSP to Swagger UI, which needs inline scripts', async () => {
    const app = await createApp('development');

    const response = await request(app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.text).toContain('swagger');
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBe('DENY');
    await app.close();
  });
});
