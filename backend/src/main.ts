import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildInfo } from './infrastructure/observability/build-info';
import {
  configureApp,
  NEST_APPLICATION_OPTIONS,
} from './interfaces/http/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    NEST_APPLICATION_OPTIONS,
  );
  app.useLogger(app.get(Logger));
  configureApp(app, process.env);
  // SIGTERM (each deploy) flushes the telemetry queue (PostHogTelemetry.onApplicationShutdown) and lets providers
  // clean up (OpenFeature.close() of the feature flags adapter).
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  const { version, commit } = buildInfo();
  app
    .get(Logger)
    .log(`home-remote-mcps started version=${version} commit=${commit}`);
}

void bootstrap();
