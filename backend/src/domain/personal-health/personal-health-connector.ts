export interface PersonalHealthCredentials {
  /** API key issued by health.sloboda.fr's own "POST /api-keys" (its user account, not ours). */
  apiKey: string;
}

export type PersonalHealthTestResult =
  { status: 'ok' } | { status: 'error'; message: string };

/**
 * Port (driven side) for the health.sloboda.fr companion service (Apple
 * Health data ingested there via the Health Auto Export iOS app). Like Home
 * Assistant, it's a single-token REST API with no login/MFA dance and no
 * client library, so there is no sidecar - the backend talks to it directly.
 * `request` takes the path *below* `/api/health/<apiKey>` (e.g. "/metrics",
 * "/workouts/<id>"), since every read endpoint on that service is scoped
 * under the caller's own API key.
 */
export abstract class PersonalHealthConnector {
  abstract testConnection(
    credentials: PersonalHealthCredentials,
  ): Promise<PersonalHealthTestResult>;

  abstract request<T>(
    credentials: PersonalHealthCredentials,
    path: string,
    queryParams?: Record<string, string | undefined>,
  ): Promise<T>;
}
