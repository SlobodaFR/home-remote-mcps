import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './infrastructure/config/validate-env';
import { loggerParams } from './infrastructure/logging/logger.config';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { SharedInfrastructureModule } from './infrastructure/shared.module';
import { ApiKeysModule } from './interfaces/http/modules/api-keys.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { HealthModule } from './interfaces/http/modules/health.module';
import { TelemetryModule } from './interfaces/http/modules/telemetry.module';
import { CredentialsModule } from './interfaces/http/modules/credentials.module';
import { CookidooMcpModule } from './interfaces/mcp/cookidoo-mcp.module';
import { GarminMcpModule } from './interfaces/mcp/garmin-mcp.module';
import { HomeAssistantMcpModule } from './interfaces/mcp/home-assistant-mcp.module';
import { InstagramMcpModule } from './interfaces/mcp/instagram-mcp.module';
import { LogsMcpModule } from './interfaces/mcp/logs-mcp.module';
import { MarkitdownMcpModule } from './interfaces/mcp/markitdown-mcp.module';
import { OpenAiMcpModule } from './interfaces/mcp/openai-mcp.module';
import { PersonalHealthMcpModule } from './interfaces/mcp/personal-health-mcp.module';
import { SPA_EXCLUDED_ROUTES } from './interfaces/http/spa';
import { throttlerOptions } from './interfaces/http/throttling';
import { YoutubeMcpModule } from './interfaces/mcp/youtube-mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        loggerParams(
          config.get<string>('NODE_ENV'),
          config.getOrThrow<string>('PSEUDONYM_SECRET'),
        ),
    }),
    ThrottlerModule.forRoot(throttlerOptions),
    DatabaseModule,
    SharedInfrastructureModule,
    TelemetryModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      // Everything server-side lives under the /api global prefix (set in
      // configureApp) except /healthz: the SPA fallback must exclude both.
      exclude: SPA_EXCLUDED_ROUTES,
    }),
    AuthModule,
    CredentialsModule,
    ApiKeysModule,
    HealthModule,
    CookidooMcpModule,
    GarminMcpModule,
    HomeAssistantMcpModule,
    InstagramMcpModule,
    LogsMcpModule,
    MarkitdownMcpModule,
    OpenAiMcpModule,
    PersonalHealthMcpModule,
    YoutubeMcpModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
