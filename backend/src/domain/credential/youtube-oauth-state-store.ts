export interface YoutubeOAuthFlow {
  userId: string;
  credentialId: string;
  /**
   * The user's own Google OAuth client ID/secret (JSON, encrypted), carried
   * with the flow instead of on the credential row so that an existing valid
   * credential is never touched before Google's exchange succeeds.
   */
  encryptedClient: string;
}

/**
 * Port: short-lived, single-use `state` values of the YouTube OAuth dance.
 * The state is an opaque random secret; the flow it stands for (user and
 * pending credential) is only ever read back through `consume`.
 */
export abstract class YoutubeOAuthStateStore {
  /** Mints a new random state; supersedes the user's previous outstanding one. */
  abstract issue(flow: YoutubeOAuthFlow): Promise<string>;
  /**
   * Atomic and single-use: returns the flow and forgets it, or null when the
   * state is unknown, already consumed or expired.
   */
  abstract consume(state: string): Promise<YoutubeOAuthFlow | null>;
}
