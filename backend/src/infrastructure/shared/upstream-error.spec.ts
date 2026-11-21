import { upstreamErrorMessage } from './upstream-error';

const FALLBACK = 'Upstream request failed: 400';

describe('upstreamErrorMessage', () => {
  it('keeps a harmless message as is', () => {
    expect(upstreamErrorMessage('Entity not found.', FALLBACK)).toBe(
      'Entity not found.',
    );
  });

  it.each([undefined, null, '', '   ', 42, {}, ['detail']])(
    'falls back to the status-based message for %j',
    (raw) => {
      expect(upstreamErrorMessage(raw, FALLBACK)).toBe(FALLBACK);
    },
  );

  it.each([
    [
      'an OpenAI key echoed by the API',
      'Incorrect API key provided: sk-proj-AbC123_xyz-9876. You can find your API key at https://platform.openai.com.',
      'sk-proj-AbC123_xyz-9876',
    ],
    [
      'a masked OpenAI key',
      'Incorrect API key provided: sk-abc***XYZ.',
      'sk-abc***XYZ',
    ],
    [
      'a bearer token',
      'Invalid header Authorization: Bearer abc.DEF-123_456',
      'abc.DEF-123_456',
    ],
    [
      'a JWT',
      'bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl',
      'eyJhbGciOiJIUzI1NiJ9',
    ],
    [
      'a Google access token',
      'Invalid token ya29.a0AfH6SMBx-secret_part',
      'secret_part',
    ],
    [
      'an access_token query/body value',
      'Error validating access token: access_token=EAAGm0PX4ZCpsBA123 expired',
      'EAAGm0PX4ZCpsBA123',
    ],
    [
      'a JSON client_secret',
      'invalid_client {"client_secret": "GOCSPX-supersecretvalue"}',
      'GOCSPX-supersecretvalue',
    ],
    [
      'an email',
      'No account for alice.smith@example.com',
      'alice.smith@example.com',
    ],
    [
      'a long opaque identifier',
      'Session 4f9d8a7b6c5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c expired',
      '4f9d8a7b6c5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c',
    ],
  ])('redacts %s', (_name, raw, secret) => {
    const message = upstreamErrorMessage(raw, FALLBACK);

    expect(message).not.toContain(secret);
    expect(message).toContain('[redacted]');
  });

  it('keeps the useful words around a redacted value', () => {
    expect(
      upstreamErrorMessage('Incorrect API key provided: sk-abc123.', FALLBACK),
    ).toBe('Incorrect API key provided: [redacted].');
  });

  it('truncates long messages and flattens whitespace', () => {
    const message = upstreamErrorMessage(
      `${'word '.repeat(100)}\n\nend`,
      FALLBACK,
    );

    expect(message.length).toBeLessThanOrEqual(203);
    expect(message.endsWith('...')).toBe(true);
    expect(message).not.toContain('\n');
  });

  it('redacts a secret even when the truncation would have cut it in two', () => {
    const raw = `${'x '.repeat(99)}sk-abcdefghijklmnop`;

    expect(upstreamErrorMessage(raw, FALLBACK)).not.toContain('sk-abc');
  });
});
