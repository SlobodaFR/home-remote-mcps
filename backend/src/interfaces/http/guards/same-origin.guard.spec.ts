import {
  ExecutionContext,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SameOriginGuard } from './same-origin.guard';

function guard(
  env: Record<string, string> = {
    FRONTEND_URL: 'https://remote-mcps.sloboda.fr',
    PUBLIC_BASE_URL: 'https://remote-mcps.sloboda.fr',
  },
) {
  return new SameOriginGuard(new ConfigService(env));
}

function context(
  method: string,
  headers: Record<string, string>,
): ExecutionContext {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers: lower }) }),
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through whatever the headers',
    (method) => {
      expect(
        guard().canActivate(
          context(method, { 'Sec-Fetch-Site': 'cross-site' }),
        ),
      ).toBe(true);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'accepts a same-origin %s',
    (method) => {
      expect(
        guard().canActivate(
          context(method, { 'Sec-Fetch-Site': 'same-origin' }),
        ),
      ).toBe(true);
    },
  );

  // same-site is exactly the attack: another *.sloboda.fr subdomain.
  it.each(['same-site', 'cross-site', 'none'])(
    'refuses Sec-Fetch-Site %s even with a trusted Origin',
    (site) => {
      expect(() =>
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': site,
            Origin: 'https://remote-mcps.sloboda.fr',
          }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('falls back to a trusted Origin when Sec-Fetch-Site is absent', () => {
    expect(
      guard().canActivate(
        context('POST', { Origin: 'https://remote-mcps.sloboda.fr' }),
      ),
    ).toBe(true);
  });

  it('refuses an untrusted Origin, or no Origin at all', () => {
    expect(() =>
      guard().canActivate(
        context('DELETE', { Origin: 'https://budget.sloboda.fr' }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard().canActivate(context('POST', {}))).toThrow(
      ForbiddenException,
    );
  });

  it('trusts both configured public URLs', () => {
    const split = guard({
      FRONTEND_URL: 'http://localhost:5173',
      PUBLIC_BASE_URL: 'http://localhost:3000',
    });
    for (const origin of ['http://localhost:5173', 'http://localhost:3000']) {
      expect(split.canActivate(context('POST', { Origin: origin }))).toBe(true);
    }
  });

  it('trusts nothing without configuration (fails closed)', () => {
    expect(() =>
      guard({}).canActivate(
        context('POST', { Origin: 'http://localhost:3000' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain; charset=utf-8'])(
    'refuses %s bodies (form posts) even from the same origin',
    (contentType) => {
      expect(() =>
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': contentType,
          }),
        ),
      ).toThrow(UnsupportedMediaTypeException);
    },
  );

  it('accepts JSON bodies and bodyless requests', () => {
    for (const headers of [
      { 'Content-Type': 'application/json' },
      {} as Record<string, string>,
    ]) {
      expect(
        guard().canActivate(
          context('POST', { 'Sec-Fetch-Site': 'same-origin', ...headers }),
        ),
      ).toBe(true);
    }
  });
});
