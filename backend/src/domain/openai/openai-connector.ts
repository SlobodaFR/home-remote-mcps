export interface OpenAiCredentials {
  apiKey: string;
  /** Optional org id (OpenAI-Organization header) - only needed for accounts with several orgs. */
  organization?: string;
}

export type OpenAiTestResult =
  { status: 'ok' } | { status: 'error'; message: string };

export type OpenAiHttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * Port (driven side) for the OpenAI REST API. Like Home Assistant and
 * personal-health, this is an official, uniformly-shaped REST API secured by
 * a bearer credential (an API key, per OpenAI convention) - no login/MFA
 * dance and no client library needed, so there is no sidecar. `request` is
 * the one primitive; interfaces/mcp/openai-tools.ts translates it into
 * specific endpoints (chat completions, responses, embeddings, images,
 * moderations) plus a raw passthrough. Like Instagram, one user can hold
 * several OpenAI API keys at once (e.g. one per project) - see
 * save-openai-connection.use-case.ts for how they're namespaced.
 */
export abstract class OpenAiConnector {
  /** Connectivity test run before a new credential is stored (GET /models). */
  abstract testConnection(
    credentials: OpenAiCredentials,
  ): Promise<OpenAiTestResult>;

  abstract request<T>(
    credentials: OpenAiCredentials,
    httpMethod: OpenAiHttpMethod,
    path: string,
    options?: {
      jsonBody?: Record<string, unknown>;
      queryParams?: Record<string, string>;
    },
  ): Promise<T>;
}
