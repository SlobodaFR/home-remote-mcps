import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Credential } from '../../domain/credential/credential';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { YoutubeOAuthStateStore } from '../../domain/credential/youtube-oauth-state-store';
import { YoutubeConnector } from '../../domain/youtube/youtube-connector';

export const YOUTUBE_SERVICE = 'youtube';

export interface StartYoutubeConnectionResult {
  pendingId: string;
  authorizeUrl: string;
  /** Same value as the `state` inside authorizeUrl; the controller binds it to the browser by cookie. */
  state: string;
}

/**
 * First step of the YouTube OAuth dance: stashes the user's own Google Cloud
 * OAuth Client ID/Secret (each user brings their own, see CredentialsPage)
 * against a pending credential row, and hands back the Google consent URL
 * to redirect the browser to. Nothing is validated yet - that happens in
 * CompleteYoutubeConnectionUseCase once Google redirects back with a code.
 */
@Injectable()
export class StartYoutubeConnectionUseCase {
  constructor(
    private readonly youtubeConnector: YoutubeConnector,
    private readonly credentialRepository: CredentialRepository,
    private readonly credentialCrypto: CredentialCrypto,
    private readonly stateStore: YoutubeOAuthStateStore,
  ) {}

  async execute(
    userId: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<StartYoutubeConnectionResult> {
    const now = new Date();
    const existing = await this.credentialRepository.findByUserAndService(
      userId,
      YOUTUBE_SERVICE,
    );
    const credential =
      existing ??
      Credential.create({
        id: randomUUID(),
        userId,
        service: YOUTUBE_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
    // Stash clientId/clientSecret so the callback (a separate, unauthenticated
    // request from Google) can complete the token exchange without needing
    // the user's session cookie.
    credential.markPending(
      this.credentialCrypto.encrypt(JSON.stringify({ clientId, clientSecret })),
      now,
    );
    await this.credentialRepository.save(credential);

    const state = await this.stateStore.issue({
      userId,
      credentialId: credential.id,
    });
    return {
      pendingId: credential.id,
      authorizeUrl: this.youtubeConnector.authorizeUrl(
        clientId,
        redirectUri,
        state,
      ),
      state,
    };
  }
}
