import { Controller, Get, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './configure-app';

@Controller('ping')
class PingController {
  @Get()
  get(): string {
    return 'pong';
  }

  @Post()
  post(): string {
    return 'pong';
  }
}

async function createApp(
  env: NodeJS.ProcessEnv = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  return app;
}

describe('configureApp', () => {
  describe('CORS', () => {
    // The SPA is served by this same origin and MCP clients call us server to server:
    // no browser origin ever needs CORS, and with cookies it must never be open.
    it.each([
      ['unset', {}],
      ['an explicit frontend origin', { FRONTEND_URL: 'https://app.test' }],
    ])('sends no CORS header when FRONTEND_URL is %s', async (_name, env) => {
      const app = await createApp(env);

      const response = await request(app.getHttpServer())
        .get('/api/ping')
        .set('Origin', 'https://evil.test')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(
        response.headers['access-control-allow-credentials'],
      ).toBeUndefined();
      await app.close();
    });

    it('does not answer cross-origin preflights', async () => {
      const app = await createApp({ FRONTEND_URL: 'https://app.test' });

      const response = await request(app.getHttpServer())
        .options('/api/ping')
        .set('Origin', 'https://evil.test')
        .set('Access-Control-Request-Method', 'POST')
        .expect(200);

      // Reached the router (Express answers OPTIONS itself) but no CORS negotiation happened.
      expect(response.headers['allow']).toContain('POST');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-methods']).toBeUndefined();
      await app.close();
    });
  });

  it('serves routes under the /api prefix', async () => {
    const app = await createApp();

    await request(app.getHttpServer()).get('/api/ping').expect(200);
    await request(app.getHttpServer()).get('/ping').expect(404);
    await app.close();
  });
});
