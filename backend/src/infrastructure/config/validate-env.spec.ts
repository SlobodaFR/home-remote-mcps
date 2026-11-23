import { DEV_PSEUDONYM_SECRET, validateEnv } from './validate-env';

const validEnv = (): Record<string, unknown> => ({
  NODE_ENV: 'production',
  AUTH_SERVICE_URL: 'https://auth.example.test',
  AUTH_CLIENT_ID: 'home-remote-mcps',
  AUTH_CLIENT_SECRET: 'client-secret',
  AUTH_WEBHOOK_SECRET: 'webhook-secret',
  FRONTEND_URL: 'https://mcps.example.test',
  PUBLIC_BASE_URL: 'https://mcps.example.test',
  CREDENTIALS_ENCRYPTION_KEY: 'k'.repeat(32),
  GARMIN_CONNECTOR_URL: 'http://garmin-connector:8000',
  GARMIN_CONNECTOR_SECRET: 'garmin-secret',
  COOKIDOO_CONNECTOR_URL: 'http://cookidoo-connector:8000',
  COOKIDOO_CONNECTOR_SECRET: 'cookidoo-secret',
  MARKITDOWN_CONNECTOR_URL: 'http://markitdown-connector:8000',
  MARKITDOWN_CONNECTOR_SECRET: 'markitdown-secret',
  MINIO_ENDPOINT: 'http://minio.internal:9000',
  MINIO_BUCKET: 'bucket',
  MINIO_ACCESS_KEY_ID: 'key-id',
  MINIO_SECRET_ACCESS_KEY: 'secret-key',
  PSEUDONYM_SECRET: 'p'.repeat(48),
});

const REQUIRED = [
  'AUTH_SERVICE_URL',
  'AUTH_CLIENT_ID',
  'AUTH_CLIENT_SECRET',
  'AUTH_WEBHOOK_SECRET',
  'FRONTEND_URL',
  'PUBLIC_BASE_URL',
  'CREDENTIALS_ENCRYPTION_KEY',
  'GARMIN_CONNECTOR_URL',
  'GARMIN_CONNECTOR_SECRET',
  'COOKIDOO_CONNECTOR_URL',
  'COOKIDOO_CONNECTOR_SECRET',
  'MARKITDOWN_CONNECTOR_URL',
  'MARKITDOWN_CONNECTOR_SECRET',
  'MINIO_ENDPOINT',
  'MINIO_BUCKET',
  'MINIO_ACCESS_KEY_ID',
  'MINIO_SECRET_ACCESS_KEY',
];

function messageOf(env: Record<string, unknown>): string {
  try {
    validateEnv(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('validateEnv should have thrown');
}

describe('validateEnv', () => {
  it('accepts a complete production environment and returns it unchanged', () => {
    const env = validEnv();

    expect(validateEnv(env)).toEqual(env);
  });

  it('accepts a development environment pointing at http://localhost', () => {
    const env = {
      ...validEnv(),
      PSEUDONYM_SECRET: undefined,
      NODE_ENV: 'development',
      AUTH_SERVICE_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:3000',
      PUBLIC_BASE_URL: 'http://localhost:3000',
    };

    expect(validateEnv(env)).toEqual({
      ...env,
      PSEUDONYM_SECRET: DEV_PSEUDONYM_SECRET,
    });
  });

  it('keeps a configured PSEUDONYM_SECRET outside production', () => {
    const env = { ...validEnv(), NODE_ENV: 'development' };

    expect(validateEnv(env).PSEUDONYM_SECRET).toBe('p'.repeat(48));
  });

  describe('PSEUDONYM_SECRET in production', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['too short', 'p'.repeat(31)],
      ['the development default', DEV_PSEUDONYM_SECRET],
    ])('refuses it when %s', (_name, value) => {
      const env = { ...validEnv(), PSEUDONYM_SECRET: value };

      expect(messageOf(env)).toContain(
        'PSEUDONYM_SECRET must be set in production',
      );
    });

    it('never echoes the weak value', () => {
      expect(
        messageOf({ ...validEnv(), PSEUDONYM_SECRET: 'short-secret' }),
      ).not.toContain('short-secret');
    });
  });

  it.each(REQUIRED)('refuses to start without %s', (variable) => {
    const env = validEnv();
    delete env[variable];

    expect(messageOf(env)).toContain(`${variable} is required`);
  });

  it.each(REQUIRED)('treats a blank %s as missing', (variable) => {
    expect(messageOf({ ...validEnv(), [variable]: '  ' })).toContain(
      `${variable} is required`,
    );
  });

  it('reports every problem at once', () => {
    const env = validEnv();
    delete env.AUTH_CLIENT_ID;
    delete env.MINIO_BUCKET;

    expect(messageOf(env)).toMatch(/AUTH_CLIENT_ID[\s\S]*MINIO_BUCKET/);
  });

  it('refuses an encryption key shorter than 32 characters, without echoing it', () => {
    const short = 'short-but-secret';
    const message = messageOf({
      ...validEnv(),
      CREDENTIALS_ENCRYPTION_KEY: short,
    });

    expect(message).toContain(
      'CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters long',
    );
    expect(message).not.toContain(short);
  });

  it.each([
    'AUTH_SERVICE_URL',
    'GARMIN_CONNECTOR_URL',
    'COOKIDOO_CONNECTOR_URL',
    'MARKITDOWN_CONNECTOR_URL',
    'MINIO_ENDPOINT',
    'FRONTEND_URL',
    'PUBLIC_BASE_URL',
  ])('refuses %s when it is not a URL', (variable) => {
    expect(messageOf({ ...validEnv(), [variable]: 'not a url' })).toContain(
      `${variable} must be a valid URL`,
    );
  });

  it.each(['AUTH_SERVICE_URL', 'FRONTEND_URL', 'PUBLIC_BASE_URL'])(
    'requires %s to be https in production',
    (variable) => {
      expect(
        messageOf({ ...validEnv(), [variable]: 'http://public.example.test' }),
      ).toContain(`${variable} must be an https:// URL in production`);
    },
  );

  // Sidecars and MinIO live on the internal docker network, in plain http.
  it('does not require https for internal services in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv(),
        MINIO_ENDPOINT: 'http://minio:9000',
        GARMIN_CONNECTOR_URL: 'http://garmin-connector:8000',
      }),
    ).not.toThrow();
  });

  // `new URL('minio:9000')` parses fine but the MinIO client cannot use it.
  it.each(['minio:9000', 'ftp://minio.internal', 'localhost:3000'])(
    'refuses a scheme-less or non-http URL: %s',
    (value) => {
      expect(messageOf({ ...validEnv(), MINIO_ENDPOINT: value })).toContain(
        'MINIO_ENDPOINT must be an http(s) URL',
      );
    },
  );

  it('does not require NODE_ENV', () => {
    const env = validEnv();
    delete env.NODE_ENV;

    expect(() =>
      validateEnv({ ...env, FRONTEND_URL: 'http://localhost:3000' }),
    ).not.toThrow();
  });

  it('never leaks a secret value in the error message', () => {
    const message = messageOf({ ...validEnv(), AUTH_CLIENT_SECRET: '' });

    for (const secret of ['webhook-secret', 'garmin-secret', 'secret-key']) {
      expect(message).not.toContain(secret);
    }
  });

  it.each(['0', '1', '2', ''])('accepts TRUST_PROXY_HOPS=%j', (value) => {
    expect(() =>
      validateEnv({ ...validEnv(), TRUST_PROXY_HOPS: value }),
    ).not.toThrow();
  });

  it.each(['-1', 'one', '1.5', '10', 'true'])(
    'refuses TRUST_PROXY_HOPS=%j',
    (value) => {
      expect(messageOf({ ...validEnv(), TRUST_PROXY_HOPS: value })).toContain(
        'TRUST_PROXY_HOPS must be a single digit',
      );
    },
  );

  it('keeps PORT, DATABASE_PATH and MINIO_REGION optional', () => {
    expect(() => validateEnv(validEnv())).not.toThrow();
  });

  describe('AUTH_WEBHOOK_SIGNING_SECRET (optional, 64 lowercase hex)', () => {
    it.each([undefined, ''])('is optional: %j', (value) => {
      expect(() =>
        validateEnv({ ...validEnv(), AUTH_WEBHOOK_SIGNING_SECRET: value }),
      ).not.toThrow();
    });

    it('accepts 64 lowercase hexadecimal characters', () => {
      expect(() =>
        validateEnv({
          ...validEnv(),
          AUTH_WEBHOOK_SIGNING_SECRET: 'ab12'.repeat(16),
        }),
      ).not.toThrow();
    });

    it.each([
      ['too short', 'ab'.repeat(31)],
      ['too long', 'ab'.repeat(33)],
      ['not hex', 'zz'.repeat(32)],
      ['upper-case (the key is the string as displayed)', 'AB'.repeat(32)],
      ['the legacy placeholder', 'change-me'],
      ['padded with a trailing newline', `${'ab'.repeat(32)}\n`],
      ['padded with a leading space', ` ${'ab'.repeat(32)}`],
    ])('refuses a value that is %s, without echoing it', (_name, value) => {
      const message = messageOf({
        ...validEnv(),
        AUTH_WEBHOOK_SIGNING_SECRET: value,
      });

      expect(message).toContain(
        'AUTH_WEBHOOK_SIGNING_SECRET must be 64 lowercase hexadecimal characters',
      );
      expect(message).not.toContain(value);
    });
  });
});
