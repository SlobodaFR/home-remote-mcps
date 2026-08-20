import { Global, Module } from '@nestjs/common';
import { GarminConnector } from '../domain/garmin/garmin-connector';
import { HomeAssistantConnector } from '../domain/home-assistant/home-assistant-connector';
import { CredentialCrypto } from '../domain/shared/credential-crypto';
import { AesGcmCredentialCrypto } from './crypto/aes-gcm-credential-crypto';
import { HttpGarminConnector } from './garmin/http-garmin-connector';
import { HttpHomeAssistantConnector } from './home-assistant/http-home-assistant-connector';

/** Providers shared across feature modules (credentials vault + MCP tools). */
@Global()
@Module({
  providers: [
    { provide: CredentialCrypto, useClass: AesGcmCredentialCrypto },
    { provide: GarminConnector, useClass: HttpGarminConnector },
    { provide: HomeAssistantConnector, useClass: HttpHomeAssistantConnector },
  ],
  exports: [CredentialCrypto, GarminConnector, HomeAssistantConnector],
})
export class SharedInfrastructureModule {}
