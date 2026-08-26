import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { SharedInfrastructureModule } from './infrastructure/shared.module';
import { ApiKeysModule } from './interfaces/http/modules/api-keys.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { CredentialsModule } from './interfaces/http/modules/credentials.module';
import { CookidooMcpModule } from './interfaces/mcp/cookidoo-mcp.module';
import { GarminMcpModule } from './interfaces/mcp/garmin-mcp.module';
import { HomeAssistantMcpModule } from './interfaces/mcp/home-assistant-mcp.module';
import { LogsMcpModule } from './interfaces/mcp/logs-mcp.module';
import { PersonalHealthMcpModule } from './interfaces/mcp/personal-health-mcp.module';
import { YoutubeMcpModule } from './interfaces/mcp/youtube-mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SharedInfrastructureModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      // Everything server-side lives under the /api global prefix (set in
      // main.ts), so the SPA fallback only needs to exclude that.
      exclude: ['/api*'],
    }),
    AuthModule,
    CredentialsModule,
    ApiKeysModule,
    CookidooMcpModule,
    GarminMcpModule,
    HomeAssistantMcpModule,
    LogsMcpModule,
    PersonalHealthMcpModule,
    YoutubeMcpModule,
  ],
})
export class AppModule {}
