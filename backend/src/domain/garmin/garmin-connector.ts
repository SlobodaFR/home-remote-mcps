export type GarminLoginResult =
  | { status: 'success'; tokensJson: string }
  | { status: 'mfa_required'; pendingId: string }
  | { status: 'error'; message: string };

/**
 * Every data call may come back with a rotated token pair (the underlying
 * garminconnect lib auto-refreshes short-lived tokens before a request). The
 * caller must re-encrypt and persist `refreshedTokensJson` when present, or
 * the stored credential slowly goes stale and forces a full re-login later.
 */
export interface GarminDataResult<T> {
  data: T;
  refreshedTokensJson?: string;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * garmin-connector Python sidecar, which owns the actual Garmin Connect
 * login/session logic (garminconnect lib - handles MFA, token refresh).
 * `tokensJson` is an opaque blob: the backend never inspects it, only
 * encrypts/stores it and hands it back on each data call.
 */
export abstract class GarminConnector {
  abstract startLogin(
    email: string,
    password: string,
  ): Promise<GarminLoginResult>;
  abstract submitMfaCode(
    pendingId: string,
    code: string,
  ): Promise<GarminLoginResult>;

  /** Cheap call (user profile) used to confirm stored tokens are still valid. */
  abstract checkTokens(
    tokensJson: string,
  ): Promise<GarminDataResult<{ valid: boolean }>>;

  abstract getDailySteps(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>>;
  abstract getSleep(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>>;
  abstract getHeartRate(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>>;
  abstract getBodyBattery(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>>;
  abstract getStress(
    tokensJson: string,
    date: string,
  ): Promise<GarminDataResult<Record<string, unknown>>>;
  abstract getActivities(
    tokensJson: string,
    limit: number,
  ): Promise<GarminDataResult<Record<string, unknown>[]>>;
}
