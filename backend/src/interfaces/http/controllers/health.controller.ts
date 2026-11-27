import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  RuntimeHealthMonitor,
  RuntimeHealthSample,
} from '../../../infrastructure/observability/runtime-health.monitor';
import { buildInfo } from '../../../infrastructure/observability/build-info';
import { HEALTH_ROUTE } from '../health-route';
import { Public } from '../decorators/public.decorator';

/**
 * Internal health check, mounted outside the /api prefix (see HEALTH_ROUTE):
 * blocked by Caddy in production (`respond /healthz* 404`), reachable only from the VPS/container.
 * Public for the session guard because nothing sensitive is exposed and no cookie exists there.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller(HEALTH_ROUTE)
export class HealthController {
  constructor(private readonly monitor: RuntimeHealthMonitor) {}

  @Get()
  health(): {
    status: 'ok';
    version: string;
    commit: string;
    runtime: RuntimeHealthSample | null;
  } {
    return { status: 'ok', ...buildInfo(), runtime: this.monitor.lastSample };
  }
}
