export interface HomeAssistantCredentials {
  /** e.g. https://my-home.duckdns.org:8123 or the Nabu Casa remote URL - no trailing slash. */
  baseUrl: string;
  /** Long-lived access token (Home Assistant profile > Security > Long-Lived Access Tokens). */
  token: string;
}

export type HomeAssistantTestResult =
  { status: 'ok' } | { status: 'error'; message: string };

export type HomeAssistantHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Port (driven side) implemented by the infrastructure layer. Unlike Garmin,
 * Home Assistant exposes an official, uniformly-shaped REST API secured by a
 * single long-lived bearer token - no login/MFA dance and no unofficial
 * client library needed, so there is no sidecar here: the backend talks
 * directly to the user's HAOS instance. `request` is the one primitive
 * (bearer-authed REST call); everything above it (interfaces/mcp/
 * home-assistant-tools.ts) is a thin translation to specific HA REST
 * endpoints.
 */
export abstract class HomeAssistantConnector {
  abstract testConnection(
    credentials: HomeAssistantCredentials,
  ): Promise<HomeAssistantTestResult>;

  abstract request<T>(
    credentials: HomeAssistantCredentials,
    httpMethod: HomeAssistantHttpMethod,
    path: string,
    options?: { jsonBody?: unknown; queryParams?: Record<string, string> },
  ): Promise<T>;
}
