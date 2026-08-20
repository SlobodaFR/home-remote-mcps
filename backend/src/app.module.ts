import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { SharedInfrastructureModule } from './infrastructure/shared.module';
import { ApiKeysModule } from './interfaces/http/modules/api-keys.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { CredentialsModule } from './interfaces/http/modules/credentials.module';
import { GarminMcpModule } from './interfaces/mcp/garmin-mcp.module';

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
    GarminMcpModule,
  ],
})
export class AppModule {}
