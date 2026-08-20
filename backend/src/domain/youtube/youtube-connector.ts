export interface YoutubeCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  /** ISO timestamp; access token is refreshed ahead of any call once past this. */
  accessTokenExpiresAt?: string;
}

export type YoutubeTokenExchangeResult =
  | {
      status: 'ok';
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { status: 'error'; message: string };

/**
 * A YouTube Data/Analytics API call may rotate the access token (refreshed
 * ahead of expiry using the stored refresh token - Google access tokens are
 * short-lived and don't auto-refresh server-side like Garmin's). The caller
 * must re-encrypt and persist `refreshedCredentialsJson` when present.
 */
export interface YoutubeDataResult<T> {
  data: T;
  refreshedCredentialsJson?: string;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Talks directly
 * to Google's OAuth2 token endpoint, the YouTube Data API v3 and the YouTube
 * Analytics API v2 - no client library, since each user brings their own
 * Google Cloud OAuth client (Client ID/Secret registered by them, see
 * CredentialsPage) rather than sharing one owned by this app.
 *
 * `call` dispatches by action name to one of the 22 supported operations
 * (see youtube-tools.ts for the allowlisted catalogue) - mirrors
 * GarminConnector.call's one-method-per-action shape.
 */
export abstract class YoutubeConnector {
  abstract authorizeUrl(
    clientId: string,
    redirectUri: string,
    state: string,
  ): string;

  abstract exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<YoutubeTokenExchangeResult>;

  abstract call<T>(
    credentialsJson: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<YoutubeDataResult<T>>;
}
