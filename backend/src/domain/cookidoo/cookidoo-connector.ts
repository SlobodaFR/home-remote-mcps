export interface CookidooLocalization {
  countryCode: string;
  language: string;
  url: string;
}

export type CookidooLoginResult =
  | {
      status: 'success';
      /** Opaque cookie jar (list of {key,value,domain,path}) - the sidecar's own JSON, not a serialized string. */
      cookiesJson: unknown;
      localization: CookidooLocalization;
    }
  | { status: 'error'; message: string };

/**
 * Every data call may come back with rotated session cookies (the Cookidoo
 * OAuth2 proxy can refresh them mid-session). The caller must re-encrypt
 * and persist `refreshedCookiesJson` when present, or the stored credential
 * slowly goes stale and forces a full re-login later.
 */
export interface CookidooDataResult<T> {
  data: T;
  refreshedCookiesJson?: unknown;
}

/**
 * Port (driven side) implemented by the infrastructure layer. Talks to the
 * cookidoo-connector Python sidecar, which owns the actual Cookidoo login
 * (username/password OAuth2 dance) and session-cookie handling via the
 * `cookidoo-api` library - no maintained Node client exists for Cookidoo.
 * `cookiesJson` is an opaque value (the session's cookie jar, as the
 * sidecar's own JSON - not a pre-serialized string): the backend never
 * inspects it, only encrypts/stores it and hands it back on each data call.
 *
 * `call` dispatches by name to one of the ~35 allowlisted async methods on
 * the underlying `cookidoo_api.Cookidoo` client (see cookidoo-tools.ts for
 * the catalogue) - one generic method instead of one bespoke method per
 * Cookidoo endpoint.
 */
export abstract class CookidooConnector {
  abstract login(
    email: string,
    password: string,
    countryCode: string,
    language: string,
  ): Promise<CookidooLoginResult>;

  /** Available country/language combinations, for the credentials form. */
  abstract listLocalizations(
    country?: string,
    language?: string,
  ): Promise<CookidooLocalization[]>;

  /** Cheap call (user info) used to confirm stored cookies are still valid. */
  abstract checkSession(
    cookiesJson: unknown,
    localization: CookidooLocalization,
  ): Promise<CookidooDataResult<{ valid: boolean }>>;

  abstract call<T>(
    cookiesJson: unknown,
    localization: CookidooLocalization,
    method: string,
    params: Record<string, unknown>,
  ): Promise<CookidooDataResult<T>>;
}
