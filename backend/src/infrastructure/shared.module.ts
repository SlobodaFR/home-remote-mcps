import { Global, Module } from '@nestjs/common';
import { CookidooConnector } from '../domain/cookidoo/cookidoo-connector';
import { GarminConnector } from '../domain/garmin/garmin-connector';
import { HomeAssistantConnector } from '../domain/home-assistant/home-assistant-connector';
import { LogsConnector } from '../domain/logs/log-connector';
import { PersonalHealthConnector } from '../domain/personal-health/personal-health-connector';
import { CredentialCrypto } from '../domain/shared/credential-crypto';
import { YoutubeConnector } from '../domain/youtube/youtube-connector';
import { HttpCookidooConnector } from './cookidoo/http-cookidoo-connector';
import { AesGcmCredentialCrypto } from './crypto/aes-gcm-credential-crypto';
import { HttpGarminConnector } from './garmin/http-garmin-connector';
import { HttpHomeAssistantConnector } from './home-assistant/http-home-assistant-connector';
import { MinioLogsConnector } from './logs/minio-logs-connector';
import { HttpPersonalHealthConnector } from './personal-health/http-personal-health-connector';
import { HttpYoutubeConnector } from './youtube/http-youtube-connector';

/** Providers shared across feature modules (credentials vault + MCP tools). */
@Global()
@Module({
  providers: [
    { provide: CredentialCrypto, useClass: AesGcmCredentialCrypto },
    { provide: CookidooConnector, useClass: HttpCookidooConnector },
    { provide: GarminConnector, useClass: HttpGarminConnector },
    { provide: HomeAssistantConnector, useClass: HttpHomeAssistantConnector },
    { provide: LogsConnector, useClass: MinioLogsConnector },
    {
      provide: PersonalHealthConnector,
      useClass: HttpPersonalHealthConnector,
    },
    { provide: YoutubeConnector, useClass: HttpYoutubeConnector },
  ],
  exports: [
    CredentialCrypto,
    CookidooConnector,
    GarminConnector,
    HomeAssistantConnector,
    LogsConnector,
    PersonalHealthConnector,
    YoutubeConnector,
  ],
})
export class SharedInfrastructureModule {}
