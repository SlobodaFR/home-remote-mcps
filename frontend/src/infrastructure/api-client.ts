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
