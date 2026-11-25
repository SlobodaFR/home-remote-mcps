// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

const api = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn<() => Promise<unknown>>(),
  logout: vi.fn<() => Promise<{ redirectTo: string | null }>>(),
}));

vi.mock('../../infrastructure/api-client', () => ({ apiClient: api }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const user = { id: 'u1', email: 'a@b.c', name: 'Alice' };

function Probe(): ReactElement {
  const { user: current, loading, logout } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <>
      <p>{current ? `in:${current.name}` : 'out'}</p>
      <button onClick={() => void logout()}>logout</button>
    </>
  );
}

let root: Root | undefined;
let container: HTMLElement | undefined;

async function renderProvider(navigate: (url: string) => void) {
  api.fetchCurrentUser.mockResolvedValue(user);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AuthProvider navigate={navigate}>
        <Probe />
      </AuthProvider>,
    );
  });
  expect(container.textContent).toContain('in:Alice');
  return container;
}

async function clickLogout(host: HTMLElement) {
  await act(async () => {
    host.querySelector('button')?.click();
  });
}

describe('AuthProvider.logout', () => {
  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    vi.clearAllMocks();
  });

  it('navigates (top-level) to home-auth when the server returns redirect_to, without clearing the user first', async () => {
    api.logout.mockResolvedValue({
      redirectTo: 'https://auth.example/logout?state=s',
    });
    const navigate = vi.fn<(url: string) => void>();
    const host = await renderProvider(navigate);

    await clickLogout(host);

    expect(navigate).toHaveBeenCalledWith(
      'https://auth.example/logout?state=s',
    );
    expect(host.textContent).toContain('in:Alice');
  });

  it('local-only logout (redirectTo null): clears the user and does not navigate', async () => {
    api.logout.mockResolvedValue({ redirectTo: null });
    const navigate = vi.fn<(url: string) => void>();
    const host = await renderProvider(navigate);

    await clickLogout(host);

    expect(host.textContent).toContain('out');
    expect(host.textContent).not.toContain('in:Alice');
    expect(navigate).not.toHaveBeenCalled();
  });
});
