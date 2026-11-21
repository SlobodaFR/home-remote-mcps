import {
  CanActivate,
  Controller,
  Delete,
  Get,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './configure-app';

const calls = { handlers: 0, sessionGuard: 0 };

@Controller()
class StubController {
  @Get('credentials')
  list(): string[] {
    return [];
  }

  @Post('credentials')
  create(): { ok: true } {
    calls.handlers += 1;
    return { ok: true };
  }

  @Delete('credentials')
  remove(): void {
    calls.handlers += 1;
  }

  // A route nobody thought of guarding: it must be protected anyway.
  @Post('brand-new-admin-route')
  brandNew(): { ok: true } {
    calls.handlers += 1;
    return { ok: true };
  }

  @Post('auth/logout')
  logout(): { ok: true } {
    calls.handlers += 1;
    return { ok: true };
  }

  @Post('auth/disconnect')
  disconnect(): { ok: true } {
    calls.handlers += 1;
    return { ok: true };
  }

  @Post('mcp/garmin/:apiKey')
  mcp(): { ok: true } {
    calls.handlers += 1;
    return { ok: true };
  }
}

/** Stands for the global JwtAuthGuard: JWKS, revocation lookup, outbound refresh... */
class SessionGuardStandIn implements CanActivate {
  canActivate(): boolean {
    calls.sessionGuard += 1;
    return true;
  }
}

@Module({ providers: [{ provide: APP_GUARD, useClass: SessionGuardStandIn }] })
class SessionModule {}

describe('same-origin middleware (over HTTP, through configureApp)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SessionModule],
      controllers: [StubController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, {
      FRONTEND_URL: 'https://mcps.example.test',
      PUBLIC_BASE_URL: 'https://mcps.example.test',
    });
    await app.init();
  });

  beforeEach(() => {
    calls.handlers = 0;
    calls.sessionGuard = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a cross-site mutation with 403 before any guard or handler runs', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/credentials')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      message: 'Cross-origin request refused',
    });
    // The session guard would hit the JWKS cache, the revocation table and home-auth.
    expect(calls).toEqual({ handlers: 0, sessionGuard: 0 });
  });

  it('refuses a same-site (sibling subdomain) deletion', async () => {
    await request(app.getHttpServer())
      .delete('/api/credentials')
      .set('Sec-Fetch-Site', 'same-site')
      .expect(403);
    expect(calls).toEqual({ handlers: 0, sessionGuard: 0 });
  });

  it('falls back to the Origin header for browsers without Sec-Fetch-Site', async () => {
    await request(app.getHttpServer())
      .post('/api/credentials')
      .set('Origin', 'https://evil.example.test')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/credentials')
      .set('Origin', 'https://mcps.example.test')
      .expect(201);
  });

  it('refuses an HTML form post with 415 even from the same origin', async () => {
    await request(app.getHttpServer())
      .post('/api/credentials')
      .set('Sec-Fetch-Site', 'same-origin')
      .type('form')
      .send({ a: 'b' })
      .expect(415);
    expect(calls).toEqual({ handlers: 0, sessionGuard: 0 });
  });

  it('lets the SPA through (same-origin JSON), and safe methods from anywhere', async () => {
    await request(app.getHttpServer())
      .post('/api/credentials')
      .set('Sec-Fetch-Site', 'same-origin')
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/credentials')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(200);
    expect(calls).toEqual({ handlers: 1, sessionGuard: 2 });
  });

  // Fail closed: nobody has to remember to guard tomorrow's route.
  it.each([
    '/api/brand-new-admin-route',
    '/api/auth/logout',
    '/API/Credentials',
    '/api/credentials/',
  ])('protects every mutation under /api by default: POST %s', async (path) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(calls.handlers).toBe(0);
  });

  describe('exempt routes (no session cookie involved)', () => {
    // Claude's servers and home-auth never send Sec-Fetch-Site: same-origin.
    it('lets MCP endpoints through, whatever the case of the prefix', async () => {
      await request(app.getHttpServer())
        .post('/api/mcp/garmin/key')
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(201);
      await request(app.getHttpServer())
        .post('/API/MCP/garmin/key')
        .expect(201);
    });

    it('lets the home-auth logout webhook through', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/disconnect?secret=x')
        .send({ userId: 'u' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/auth/disconnect/')
        .expect(201);
    });

    // The exemption is decided on the raw path; paths that merely start like an exempt one reach
    // no protected handler.
    it.each([
      '/api/mcp/../credentials',
      '/api/mcp/%2e%2e/credentials',
      '/api/mcp%2f..%2fcredentials',
      '/api/auth/disconnectx',
      '/api/auth/disconnect/../logout',
    ])('does not let %s reach a protected handler', async (path) => {
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Sec-Fetch-Site', 'cross-site');

      expect(calls.handlers).toBe(0);
      expect([403, 404]).toContain(response.status);
    });
  });

  it('ignores everything outside /api (the SPA and its static files)', async () => {
    await request(app.getHttpServer())
      .post('/healthz')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(404);
  });
});
