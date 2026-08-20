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

export type ConnectApiHttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE';

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * garmin-connector Python sidecar, which owns the actual Garmin Connect
 * login/session logic (garminconnect lib - handles MFA, token refresh).
 * `tokensJson` is an opaque blob: the backend never inspects it, only
 * encrypts/stores it and hands it back on each data call.
 *
 * `call` dispatches by name to one of the ~130 methods on the underlying
 * `garminconnect.Garmin` client (see garmin-tools.ts for the allowlisted
 * catalogue) - one generic method instead of one bespoke method per Garmin
 * API endpoint. `connectApi` is a raw REST passthrough (mirrors what the
 * garminconnect lib itself does internally) for the handful of Garmin
 * Connect endpoints - mostly nutrition/food-logging - that have no
 * high-level method in the library.
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

  abstract call<T>(
    tokensJson: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<GarminDataResult<T>>;

  abstract connectApi<T>(
    tokensJson: string,
    httpMethod: ConnectApiHttpMethod,
    path: string,
    options?: { jsonBody?: unknown; queryParams?: Record<string, string> },
  ): Promise<GarminDataResult<T>>;
}
