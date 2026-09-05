const BASE_URL = '/api';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(
      `Request to ${path} failed with status ${response.status.toString()}`,
    );
  }
  return response.json() as Promise<T>;
}

async function sendJson<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      errorBody?.message ??
        `La requete a echoue (${response.status.toString()})`,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export interface Credential {
  id: string;
  service: string;
  status: 'pending_mfa' | 'ok' | 'failed';
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
}

export type GarminLoginResponse =
  | { status: 'ok' }
  | { status: 'mfa_required'; pendingId: string }
  | { status: 'error'; message: string };

export type HomeAssistantConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export type CookidooConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export interface CookidooLocalization {
  countryCode: string;
  language: string;
  url: string;
}

export type LogsConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export type PersonalHealthConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export type InstagramConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export type OpenAiConnectionResponse =
  { status: 'ok' } | { status: 'error'; message: string };

export interface StartYoutubeConnectionResponse {
  pendingId: string;
  authorizeUrl: string;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedApiKey {
  id: string;
  label: string;
  rawKey: string;
  mcpUrl: string;
  homeAssistantMcpUrl: string;
  cookidooMcpUrl: string;
  logsMcpUrl: string;
  personalHealthMcpUrl: string;
  youtubeMcpUrl: string;
  instagramMcpUrlTemplate: string;
  openaiMcpUrlTemplate: string;
  createdAt: string;
}

export const apiClient = {
  async fetchCurrentUser(): Promise<CurrentUser | null> {
    const response = await fetch(`${BASE_URL}/auth/me`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { user: CurrentUser };
    return body.user;
  },
  async logout(): Promise<void> {
    await sendJson('/auth/logout', 'POST');
  },

  fetchCredentials(): Promise<Credential[]> {
    return getJson<Credential[]>('/credentials');
  },
  startGarminLogin(
    email: string,
    password: string,
  ): Promise<GarminLoginResponse> {
    return sendJson<GarminLoginResponse>('/credentials/garmin/login', 'POST', {
      email,
      password,
    });
  },
  submitGarminMfa(
    pendingId: string,
    code: string,
  ): Promise<GarminLoginResponse> {
    return sendJson<GarminLoginResponse>('/credentials/garmin/mfa', 'POST', {
      pendingId,
      code,
    });
  },
  fetchCookidooLocalizations(
    country?: string,
  ): Promise<CookidooLocalization[]> {
    const query = country ? `?country=${encodeURIComponent(country)}` : '';
    return getJson<CookidooLocalization[]>(
      `/credentials/cookidoo/localizations${query}`,
    );
  },
  saveCookidooConnection(
    email: string,
    password: string,
    countryCode: string,
    language: string,
  ): Promise<CookidooConnectionResponse> {
    return sendJson<CookidooConnectionResponse>(
      '/credentials/cookidoo',
      'POST',
      {
        email,
        password,
        countryCode,
        language,
      },
    );
  },
  saveHomeAssistantConnection(
    baseUrl: string,
    token: string,
  ): Promise<HomeAssistantConnectionResponse> {
    return sendJson<HomeAssistantConnectionResponse>(
      '/credentials/home-assistant',
      'POST',
      { baseUrl, token },
    );
  },
  saveLogsConnection(basePath: string): Promise<LogsConnectionResponse> {
    return sendJson<LogsConnectionResponse>('/credentials/logs', 'POST', {
      basePath,
    });
  },
  savePersonalHealthConnection(
    apiKey: string,
  ): Promise<PersonalHealthConnectionResponse> {
    return sendJson<PersonalHealthConnectionResponse>(
      '/credentials/personal-health',
      'POST',
      { apiKey },
    );
  },
  saveInstagramConnection(
    accountName: string,
    accessToken: string,
  ): Promise<InstagramConnectionResponse> {
    return sendJson<InstagramConnectionResponse>(
      '/credentials/instagram',
      'POST',
      { accountName, accessToken },
    );
  },
  saveOpenAiConnection(
    name: string,
    apiKey: string,
    organization?: string,
  ): Promise<OpenAiConnectionResponse> {
    return sendJson<OpenAiConnectionResponse>('/credentials/openai', 'POST', {
      name,
      apiKey,
      organization: organization === '' ? undefined : organization,
    });
  },
  startYoutubeConnection(
    clientId: string,
    clientSecret: string,
  ): Promise<StartYoutubeConnectionResponse> {
    return sendJson<StartYoutubeConnectionResponse>(
      '/credentials/youtube/start',
      'POST',
      { clientId, clientSecret },
    );
  },
  deleteCredential(id: string): Promise<void> {
    return sendJson(`/credentials/${id}`, 'DELETE');
  },

  fetchApiKeys(): Promise<ApiKeySummary[]> {
    return getJson<ApiKeySummary[]>('/api-keys');
  },
  createApiKey(label: string): Promise<CreatedApiKey> {
    return sendJson<CreatedApiKey>('/api-keys', 'POST', { label });
  },
  revokeApiKey(id: string): Promise<void> {
    return sendJson(`/api-keys/${id}`, 'DELETE');
  },
};
