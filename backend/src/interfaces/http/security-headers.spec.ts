import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Controller, Get, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import request from 'supertest';
import { configureApp } from './configure-app';

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

describe('security headers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(publicDir, 'index.html'), '<html></html>');
    const moduleRef = await Test.createTestingModule({
      controllers: [StubController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, { NODE_ENV: 'production' });
    // Static files go through the same middleware chain as the SPA served in production.
    app.useStaticAssets(publicDir);
    // Swagger is mounted outside the /api global prefix.
    app.use('/docs', (_req: Request, res: Response) => {
      res.send('swagger');
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

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

  it('puts a strict CSP on the admin SPA', async () => {
    const response = await request(app.getHttpServer())
      .get('/index.html')
      .expect(200);

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

  // Swagger UI relies on inline scripts; /docs is not served in production anyway.
  it('does not apply the strict CSP to /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  // The CSP is for the admin UI only: JSON API and MCP responses are not documents.
  it.each([
    ['get', '/api/credentials'],
    ['post', '/api/mcp/garmin/some-key'],
    ['get', '/API/credentials'], // Express routes case-insensitively
  ] as const)(
    'keeps the other headers but no CSP on %s %s',
    async (method, path) => {
      const response = await request(app.getHttpServer())[method](path);

      expect(response.headers['content-security-policy']).toBeUndefined();
      expectCommonHeaders(response.headers);
    },
  );
});
