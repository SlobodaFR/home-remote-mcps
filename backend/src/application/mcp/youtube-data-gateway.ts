import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  YoutubeConnector,
  YoutubeDataResult,
} from '../../domain/youtube/youtube-connector';
import { YOUTUBE_SERVICE } from '../credentials/start-youtube-connection.use-case';

export class YoutubeNotConnectedError extends Error {
  constructor() {
    super(
      'No validated YouTube connection for this user. Connect YouTube in the web UI first.',
    );
  }
}

/**
 * Loads the user's stored YouTube OAuth credentials, runs a connector call
 * against them, and persists any rotated access token the connector hands
 * back - mirrors GarminDataGateway.
 */
@Injectable()
export class YoutubeDataGateway {
  constructor(
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly youtubeConnector: YoutubeConnector,
  ) {}

  async run<T>(
    userId: string,
    call: (
      connector: YoutubeConnector,
      credentialsJson: string,
    ) => Promise<YoutubeDataResult<T>>,
  ): Promise<T> {
    const credential = await this.credentialRepository.findByUserAndService(
      userId,
      YOUTUBE_SERVICE,
    );
    if (credential?.status !== 'ok' || !credential.encryptedTokens?.length) {
      throw new YoutubeNotConnectedError();
    }

    const credentialsJson = this.credentialCrypto.decrypt(
      credential.encryptedTokens,
    );
    const result = await call(this.youtubeConnector, credentialsJson);

    if (result.refreshedCredentialsJson) {
      credential.markValidated(
        this.credentialCrypto.encrypt(result.refreshedCredentialsJson),
        new Date(),
      );
      await this.credentialRepository.save(credential);
    }

    return result.data;
  }
}
