export interface InstagramCredentials {
  /** Long-lived Facebook Page access token (Graph API), scoped to one Page. */
  accessToken: string;
  /** Facebook Page id the token is scoped to - needed for the DM endpoints. */
  pageId: string;
  /** Instagram professional (business/creator) account id linked to that Page. */
  igUserId: string;
  igUsername: string;
}

export interface InstagramAccountInfo {
  pageId: string;
  igUserId: string;
  igUsername: string;
}

export type InstagramTestResult =
  | ({ status: 'ok' } & InstagramAccountInfo)
  | { status: 'error'; message: string };

export type InstagramHttpMethod = 'GET' | 'POST';

/**
 * Port (driven side) for Instagram's Graph API. Like Home Assistant and
 * personal-health, this is an official, uniformly-shaped REST API secured by
 * a bearer credential (here a long-lived Page access token passed as an
 * `access_token` query param, per Graph API convention) - no login/MFA dance
 * and no unofficial client library, so there is no sidecar. `request` is the
 * one primitive; interfaces/mcp/instagram-tools.ts translates it into
 * specific Graph API endpoints. Unlike the other single-account
 * integrations, one user can hold several Instagram credentials at once
 * (one per Instagram professional account) - see
 * save-instagram-connection.use-case.ts for how they're namespaced.
 */
export abstract class InstagramConnector {
  /**
   * Resolves the Facebook Page and linked Instagram professional account for
   * a token via `GET /me/accounts`, and doubles as the connectivity test run
   * before a new credential is stored.
   */
  abstract resolveAccount(accessToken: string): Promise<InstagramTestResult>;

  abstract request<T>(
    accessToken: string,
    httpMethod: InstagramHttpMethod,
    path: string,
    options?: {
      jsonBody?: Record<string, unknown>;
      queryParams?: Record<string, string>;
    },
  ): Promise<T>;
}
