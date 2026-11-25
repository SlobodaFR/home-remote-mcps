import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

describe('apiClient.logout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /auth/logout and returns the redirect_to of the service-initiated flow', async () => {
    const fetchMock = vi.fn<() => Promise<unknown>>().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ redirect_to: 'https://auth.example/l?x=1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.logout()).resolves.toEqual({
      redirectTo: 'https://auth.example/l?x=1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('returns null for a local-only logout (null, absent or non-string redirect_to)', async () => {
    for (const body of [{ redirect_to: null }, {}, { redirect_to: 3 }]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
        }),
      );
      await expect(apiClient.logout()).resolves.toEqual({ redirectTo: null });
    }
  });

  it('keeps working on an empty 204 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    await expect(apiClient.logout()).resolves.toEqual({ redirectTo: null });
  });
});
