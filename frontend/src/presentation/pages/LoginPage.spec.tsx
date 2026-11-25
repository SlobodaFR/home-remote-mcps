// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginPage } from './LoginPage';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hosts: HTMLElement[] = [];

async function renderAt(url: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  await act(async () => {
    createRoot(host).render(
      <MemoryRouter initialEntries={[url]}>
        <LoginPage />
      </MemoryRouter>,
    );
  });
  return host;
}

describe('LoginPage', () => {
  afterEach(() => {
    hosts.splice(0).forEach((host) => {
      host.remove();
    });
  });

  it('shows the logged-out state after a service-initiated logout, with a manual login link only', async () => {
    const host = await renderAt('/login?logged_out=1');
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Vous avez été déconnecté.',
    );
    expect(host.querySelector('a')?.getAttribute('href')).toBe(
      '/api/auth/login',
    );
  });

  it('shows no banner otherwise', async () => {
    const host = await renderAt('/login');
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
});
