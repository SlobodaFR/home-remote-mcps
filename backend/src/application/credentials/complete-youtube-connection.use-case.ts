import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  YoutubeCredentials,
  YoutubeConnector,
} from '../../domain/youtube/youtube-connector';
import { YOUTUBE_SERVICE } from './start-youtube-connection.use-case';

export type CompleteYoutubeConnectionResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Second step of the YouTube OAuth dance: Google redirects the browser here
 * with an authorization code and the `state` we handed it in
 * StartYoutubeConnectionUseCase (the pending credential's id - this route is
 * public and unauthenticated, so `state` is how we find our way back to the
 * right user without a session cookie).
 */
@Injectable()
export class CompleteYoutubeConnectionUseCase {
  constructor(
    private readonly youtubeConnector: YoutubeConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
  ) {}

  async execute(
    pendingId: string,
    code: string,
    redirectUri: string,
  ): Promise<CompleteYoutubeConnectionResult> {
    const credential = await this.credentialRepository.findById(pendingId);
    if (
      !credential?.encryptedTokens?.length ||
      credential.service !== YOUTUBE_SERVICE
    ) {
      return {
        status: 'error',
        message: 'Unknown or expired YouTube connection attempt',
      };
    }

    const { clientId, clientSecret } = JSON.parse(
      this.credentialCrypto.decrypt(credential.encryptedTokens),
    ) as { clientId: string; clientSecret: string };

    const exchanged = await this.youtubeConnector.exchangeCode(
      clientId,
      clientSecret,
      code,
      redirectUri,
    );
    if (exchanged.status === 'error') {
      const now = new Date();
      credential.markFailed(exchanged.message, now);
      await this.credentialRepository.save(credential);
      return { status: 'error', message: exchanged.message };
    }

    const now = new Date();
    const credentials: YoutubeCredentials = {
      clientId,
      clientSecret,
      refreshToken: exchanged.refreshToken,
      accessToken: exchanged.accessToken,
      accessTokenExpiresAt: new Date(
        now.getTime() + exchanged.expiresIn * 1000,
      ).toISOString(),
    };
    credential.markValidated(
      this.credentialCrypto.encrypt(JSON.stringify(credentials)),
      now,
    );
    await this.credentialRepository.save(credential);
    return { status: 'ok' };
  }
}
