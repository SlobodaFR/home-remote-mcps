import { Global, Module } from '@nestjs/common';
import { GarminConnector } from '../domain/garmin/garmin-connector';
import { HomeAssistantConnector } from '../domain/home-assistant/home-assistant-connector';
import { CredentialCrypto } from '../domain/shared/credential-crypto';
import { YoutubeConnector } from '../domain/youtube/youtube-connector';
import { AesGcmCredentialCrypto } from './crypto/aes-gcm-credential-crypto';
import { HttpGarminConnector } from './garmin/http-garmin-connector';
import { HttpHomeAssistantConnector } from './home-assistant/http-home-assistant-connector';
import { HttpYoutubeConnector } from './youtube/http-youtube-connector';

/** Providers shared across feature modules (credentials vault + MCP tools). */
@Global()
@Module({
  providers: [
    { provide: CredentialCrypto, useClass: AesGcmCredentialCrypto },
    { provide: GarminConnector, useClass: HttpGarminConnector },
    { provide: HomeAssistantConnector, useClass: HttpHomeAssistantConnector },
    { provide: YoutubeConnector, useClass: HttpYoutubeConnector },
  ],
  exports: [
    CredentialCrypto,
    GarminConnector,
    HomeAssistantConnector,
    YoutubeConnector,
  ],
})
export class SharedInfrastructureModule {}
