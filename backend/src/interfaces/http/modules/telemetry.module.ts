import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Telemetry } from '../../../domain/shared/telemetry';
import { createPostHogTelemetry } from '../../../infrastructure/telemetry/posthog-telemetry';
import { TelemetryInterceptor } from '../telemetry.interceptor';

/** Operational telemetry (runtime_health, http_request): global port + global interceptor. */
@Global()
@Module({
  providers: [
    {
      provide: Telemetry,
      inject: [ConfigService],
      useFactory: createPostHogTelemetry,
    },
    { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
  ],
  exports: [Telemetry],
})
export class TelemetryModule {}
