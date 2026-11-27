import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { RuntimeHealthMonitor } from '../../../infrastructure/observability/runtime-health.monitor';
import { configureApp } from '../configure-app';
import { SPA_EXCLUDED_ROUTES } from '../spa';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { HealthModule } from '../modules/health.module';
import { TelemetryModule } from '../modules/telemetry.module';
import { HealthController } from './health.controller';

/** Production-shaped: real prefix handling, SPA fallback and its exclude list. */
async function createApp(): Promise<NestExpressApplication> {
  const publicDir = mkdtempSync(join(tmpdir(), 'spa-'));
  writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');

  @Module({
    imports: [
      // No POSTHOG_API_KEY: the real TelemetryModule wires its NOOP adapter.
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TelemetryModule,
      ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 1 }] }),
      ServeStaticModule.forRoot({
        rootPath: publicDir,
        exclude: SPA_EXCLUDED_ROUTES,
      }),
      HealthModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class TestAppModule {}

  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    logger: false,
  });
  configureApp(app, { NODE_ENV: 'production' });
  await app.init();
  return app;
}

describe('GET /healthz', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers ok at /healthz, outside the /api prefix, with no runtime data before the first sample', async () => {
    const response = await request(app.getHttpServer())
      .get('/healthz')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      version: 'dev',
      commit: 'dev',
      runtime: null,
    });
  });

  it('answers GET /version without a session, never cached, outside /api and never the SPA shell', async () => {
    const response = await request(app.getHttpServer())
      .get('/version')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ version: 'dev', commit: 'dev' });
  });

  it('is not served under /api (Caddy only blocks /healthz*)', async () => {
    await request(app.getHttpServer()).get('/api/healthz').expect(404);
  });

  it('is never the SPA shell, also for sub-paths (Nest 12: plain 404 HTML page)', async () => {
    const response = await request(app.getHttpServer())
      .get('/healthz/unknown')
      .expect(404);

    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).not.toContain('spa');
  });

  // The global JwtAuthGuard would answer 401 otherwise; the global throttle (1/min here) must not apply.
  it('is marked public for the session guard (decorator only) and exempt from the rate limit (behaviour)', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).get('/healthz').expect(200);
    }
  });

  it('exposes the last runtime sample', async () => {
    const sample = {
      lag_p50_ms: 1,
      lag_p99_ms: 3,
      lag_max_ms: 5,
      elu: 0.1,
      heap_used_mb: 40,
      rss_mb: 90,
    };
    app.get(RuntimeHealthMonitor).lastSample = sample;

    const response = await request(app.getHttpServer())
      .get('/healthz')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      version: 'dev',
      commit: 'dev',
      runtime: sample,
    });
  });
});
