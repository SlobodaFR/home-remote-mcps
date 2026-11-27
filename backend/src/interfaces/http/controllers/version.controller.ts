import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  BuildInfo,
  buildInfo,
} from '../../../infrastructure/observability/build-info';
import { Public } from '../decorators/public.decorator';

/**
 * Public release identity (convention harnais release-versioning): GET /version, outside the /api
 * prefix, not blocked by Caddy. Read after a deploy to check which release runs, without SSH.
 * Never reported as http_request (see TelemetryInterceptor): public and unauthenticated.
 */
@ApiExcludeController()
@Public()
@Controller('version')
export class VersionController {
  @Get()
  @Header('Cache-Control', 'no-store')
  version(): BuildInfo {
    return buildInfo();
  }
}
