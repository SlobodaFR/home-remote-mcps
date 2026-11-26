import { Injectable } from '@nestjs/common';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { YoutubeOAuthStateStore } from '../../domain/credential/youtube-oauth-state-store';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import {
  YoutubeCredentials,
  YoutubeConnector,
} from '../../domain/youtube/youtube-connector';
import { YOUTUBE_SERVICE } from './start-youtube-connection.use-case';

export type CompleteYoutubeConnectionResult =
  | { status: 'ok' }
  | { status: 'error'; message: string };

/**
 * Second step of the YouTube OAuth dance: Google redirects the browser here
 * with an authorization code and the `state` we handed it in
 * StartYoutubeConnectionUseCase: a random, single-use, 10-minute secret that
 * maps (server side) to the initiating user and pending credential. The
 * controller has already checked it against the browser-bound cookie.
 */
@Injectable()
export class CompleteYoutubeConnectionUseCase {
  constructor(
    private readonly youtubeConnector: YoutubeConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly stateStore: YoutubeOAuthStateStore,
  ) {}

  /** Google reported an error: the attempt is over, burn its state. */
  async abort(state: string): Promise<void> {
    await this.stateStore.consume(state);
  }

  async execute(
    state: string,
    code: string,
    redirectUri: string,
  ): Promise<CompleteYoutubeConnectionResult> {
    // Consumed first: whatever happens next, this state can never be replayed.
    const flow = await this.stateStore.consume(state);
    const credential = flow
      ? await this.credentialRepository.findById(flow.credentialId)
      : null;
    if (
      !flow ||
      !credential?.encryptedTokens?.length ||
      credential.userId !== flow.userId ||
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
