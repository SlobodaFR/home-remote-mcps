import { Controller, Get } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupSwagger } from './swagger';

@Controller('ping')
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

async function createApp(
  nodeEnv: string | undefined,
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  setupSwagger(app, nodeEnv);
  await app.init();
  return app;
}

describe('setupSwagger', () => {
  it('does not expose the API documentation in production', async () => {
    const app = await createApp('production');

    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs-json').expect(404);
    await app.close();
  });

  it('serves it outside production', async () => {
    const app = await createApp('development');

    await request(app.getHttpServer()).get('/docs').expect(200);
    await request(app.getHttpServer()).get('/docs-json').expect(200);
    await app.close();
  });

  // An unset NODE_ENV is the default of a bare `node dist/main.js`: not production.
  it('serves it when NODE_ENV is unset', async () => {
    const app = await createApp(undefined);

    await request(app.getHttpServer()).get('/docs').expect(200);
    await app.close();
  });
});
