import { Global, Module } from '@nestjs/common';
import { CookidooConnector } from '../domain/cookidoo/cookidoo-connector';
import { GarminConnector } from '../domain/garmin/garmin-connector';
import { HomeAssistantConnector } from '../domain/home-assistant/home-assistant-connector';
import { InstagramConnector } from '../domain/instagram/instagram-connector';
import { LogsConnector } from '../domain/logs/log-connector';
import { MarkitdownConnector } from '../domain/markitdown/markitdown-connector';
import { OpenAiConnector } from '../domain/openai/openai-connector';
import { PersonalHealthConnector } from '../domain/personal-health/personal-health-connector';
import { SecretHasher } from '../domain/shared/secret-hasher';
import { CredentialCrypto } from '../domain/shared/credential-crypto';
import { FeatureFlags } from '../domain/shared/feature-flags';
import { YoutubeConnector } from '../domain/youtube/youtube-connector';
import { ScryptSecretHasher } from './crypto/scrypt-secret-hasher';
import { createFeatureFlags } from './feature-flags/openfeature-feature-flags';
import { HttpCookidooConnector } from './cookidoo/http-cookidoo-connector';
import { AesGcmCredentialCrypto } from './crypto/aes-gcm-credential-crypto';
import { HttpGarminConnector } from './garmin/http-garmin-connector';
import { HttpHomeAssistantConnector } from './home-assistant/http-home-assistant-connector';
import { HttpInstagramConnector } from './instagram/http-instagram-connector';
import { MinioLogsConnector } from './logs/minio-logs-connector';
import { HttpMarkitdownConnector } from './markitdown/http-markitdown-connector';
import { HttpOpenAiConnector } from './openai/http-openai-connector';
import { HttpPersonalHealthConnector } from './personal-health/http-personal-health-connector';
import { HttpYoutubeConnector } from './youtube/http-youtube-connector';

/** Providers shared across feature modules (credentials vault + MCP tools). */
@Global()
@Module({
  providers: [
    { provide: CredentialCrypto, useClass: AesGcmCredentialCrypto },
    { provide: SecretHasher, useClass: ScryptSecretHasher },
    {
      provide: FeatureFlags,
      useFactory: () => createFeatureFlags(process.env),
    },
    { provide: CookidooConnector, useClass: HttpCookidooConnector },
    { provide: GarminConnector, useClass: HttpGarminConnector },
    { provide: HomeAssistantConnector, useClass: HttpHomeAssistantConnector },
    { provide: InstagramConnector, useClass: HttpInstagramConnector },
    { provide: LogsConnector, useClass: MinioLogsConnector },
    { provide: MarkitdownConnector, useClass: HttpMarkitdownConnector },
    { provide: OpenAiConnector, useClass: HttpOpenAiConnector },
    {
      provide: PersonalHealthConnector,
      useClass: HttpPersonalHealthConnector,
    },
    { provide: YoutubeConnector, useClass: HttpYoutubeConnector },
  ],
  exports: [
    CredentialCrypto,
    SecretHasher,
    FeatureFlags,
    CookidooConnector,
    GarminConnector,
    HomeAssistantConnector,
    InstagramConnector,
    LogsConnector,
    MarkitdownConnector,
    OpenAiConnector,
    PersonalHealthConnector,
    YoutubeConnector,
  ],
})
export class SharedInfrastructureModule {}
