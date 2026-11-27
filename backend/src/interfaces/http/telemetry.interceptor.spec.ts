import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import { lastValueFrom, of } from 'rxjs';
import request from 'supertest';
import { Telemetry } from '../../domain/shared/telemetry';
import { FakeTelemetry } from '../../testing/fake-telemetry';
import { HEALTH_ROUTE } from './health-route';
import { SPA_EXCLUDED_ROUTES } from './spa';
import { TelemetryInterceptor } from './telemetry.interceptor';

@Controller('items')
class ItemsController {
  @Get('missing')
  missing(): never {
    throw new NotFoundException('nope');
  }

  @Get('boom')
  boom(): never {
    throw new TypeError('secret detail about alice@example.com');
  }

  @Get(':id')
  find(@Param('id') id: string): { id: string } {
    return { id };
  }
}

// Same shape as the MCP controllers: a stateless POST carrying the API key in the path.
@Controller('mcp/garmin')
class McpController {
  @Post(':apiKey')
  handle(@Body() body: unknown): { ok: true } {
    void body;
    return { ok: true };
  }
}

@Controller('version')
class VersionController {
  @Get()
  version(): string {
    return 'ok';
  }
}

@Controller(HEALTH_ROUTE)
class HealthController {
  @Get()
  health(): string {
    return 'ok';
  }
}

describe('HTTP telemetry', () => {
  let app: NestExpressApplication;
  let telemetry: FakeTelemetry;

  beforeEach(async () => {
    telemetry = new FakeTelemetry();
    const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
    writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');
    writeFileSync(join(publicDir, 'app.js'), 'console.log(1)');
    // NestFactory, not Test.createTestingModule: only it registers serve-static's routes.
    @Module({
      imports: [
        ServeStaticModule.forRoot({
          rootPath: publicDir,
          exclude: SPA_EXCLUDED_ROUTES,
        }),
      ],
      controllers: [
        ItemsController,
        McpController,
        HealthController,
        VersionController,
      ],
      providers: [
        { provide: Telemetry, useValue: telemetry },
        { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
      ],
    })
    class TestAppModule {}
    app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
      logger: false,
    });
    // Production shape (configureApp): everything under /api except the health check.
    app.setGlobalPrefix('api', { exclude: [HEALTH_ROUTE, 'version'] });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports each request with its parameterized route, never the raw URL or query', async () => {
    await request(app.getHttpServer())
      .get('/api/items/42?token=secret')
      .expect(200);

    expect(telemetry.names()).toEqual(['http_request']);
    expect(telemetry.captured[0].event).toEqual({
      name: 'http_request',
      properties: {
        route: '/api/items/:id',
        method: 'GET',
        status: 200,
        duration_ms: expect.any(Number),
      },
    });
    expect(JSON.stringify(telemetry.captured)).not.toMatch(/42|secret/);
  });

  it('reports client errors with their status', async () => {
    await request(app.getHttpServer()).get('/api/items/missing').expect(404);

    expect(telemetry.captured.map(({ event }) => event)).toEqual([
      {
        name: 'http_request',
        properties: expect.objectContaining({
          route: '/api/items/missing',
          status: 404,
        }),
      },
    ]);
  });

  it('reports server errors with status 500 and never the error message', async () => {
    await request(app.getHttpServer()).get('/api/items/boom').expect(500);

    expect(telemetry.captured.map(({ event }) => event)).toEqual([
      {
        name: 'http_request',
        properties: expect.objectContaining({
          route: '/api/items/boom',
          status: 500,
        }),
      },
    ]);
    expect(JSON.stringify(telemetry.captured)).not.toContain('alice');
  });

  it('does not report /version (public release identity, cost amplifier)', async () => {
    await request(app.getHttpServer()).get('/version').expect(200);

    expect(telemetry.captured).toEqual([]);
  });

  it('does not report /healthz (polled by the Docker healthcheck every 30 s)', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200);

    expect(telemetry.captured).toEqual([]);
  });

  it('reports an MCP call by route template: the API key and the JSON-RPC body are never read', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp/garmin/rmcp_live_key_12345')
      .send({ method: 'tools/call', params: { arguments: { q: 'private' } } })
      .expect(201);

    expect(telemetry.captured.map(({ event }) => event)).toEqual([
      {
        name: 'http_request',
        properties: expect.objectContaining({
          route: '/api/mcp/garmin/:apiKey',
          method: 'POST',
          status: 201,
        }),
      },
    ]);
    expect(JSON.stringify(telemetry.captured)).not.toMatch(
      /rmcp_live_key|private|tools\/call/,
    );
  });

  it('reports nothing for a request that matches no Nest route', async () => {
    await request(app.getHttpServer())
      .get('/api/nope/alice@example.com')
      .expect(404);

    expect(telemetry.captured).toEqual([]);
  });

  it('reports nothing for static assets and the SPA fallback (served outside Nest routes)', async () => {
    await request(app.getHttpServer()).get('/app.js').expect(200);
    await request(app.getHttpServer()).get('/some/client/route').expect(200);

    expect(telemetry.captured).toEqual([]);
  });

  it('ignores non-HTTP contexts: a WebSocket handler sharing the global interceptor emits nothing', async () => {
    const interceptor = new TelemetryInterceptor(telemetry);
    const next = { handle: () => of('pong') };
    const wsContext = {
      getType: () => 'ws',
      switchToHttp: () => {
        throw new Error('must not read an HTTP request on a ws context');
      },
    } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(wsContext, next));

    expect(telemetry.captured).toEqual([]);
  });

  it('never reports an email carried by a query string or a path parameter', async () => {
    await request(app.getHttpServer())
      .get('/api/items/alice@example.com?email=bob@example.com')
      .expect(200);

    expect(telemetry.names()).toEqual(['http_request']);
    expect(JSON.stringify(telemetry.captured)).not.toMatch(/alice|bob|@/);
    expect(telemetry.captured[0].event).toMatchObject({
      properties: { route: '/api/items/:id' },
    });
  });
});
