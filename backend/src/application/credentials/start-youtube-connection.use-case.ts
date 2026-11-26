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
 * First step of the YouTube OAuth dance: keeps the user's own Google Cloud
 * OAuth Client ID/Secret (each user brings their own, see CredentialsPage)
 * with the single-use state (in memory), reusing the user's credential row
 * (created empty if none) without modifying it, and hands back the Google consent URL
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
    // An existing credential (possibly a valid `ok` one) is left untouched:
    // abandoning or failing this flow must never cost the user a working
    // connection. Only a brand-new, empty pending row is created.
    let credential = existing;
    if (!credential) {
      credential = Credential.create({
        id: randomUUID(),
        userId,
        service: YOUTUBE_SERVICE,
        createdAt: now,
        updatedAt: now,
      });
      try {
        await this.credentialRepository.save(credential);
      } catch (error) {
        // Two first-time starts of the same user can race on the unique (user_id, service)
        // index: the loser adopts the row the winner just created.
        const winner = await this.credentialRepository.findByUserAndService(
          userId,
          YOUTUBE_SERVICE,
        );
        if (!winner) {
          throw error;
        }
        credential = winner;
      }
    }

    const state = await this.stateStore.issue({
      userId,
      credentialId: credential.id,
      // The callback (a separate, unauthenticated request from Google) needs
      // the client ID/secret to complete the exchange without a session.
      encryptedClient: this.credentialCrypto.encrypt(
        JSON.stringify({ clientId, clientSecret }),
      ),
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
