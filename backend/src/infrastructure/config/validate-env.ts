/** Required by the code at startup (`config.getOrThrow` in constructors): a missing one crashes Nest anyway, just later and less clearly. */
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
] as const;

/** Parsed with `new URL()` at startup. Sidecars and MinIO are internal (plain http is fine). */
const URL_VARIABLES = [
  'AUTH_SERVICE_URL',
  'FRONTEND_URL',
  'PUBLIC_BASE_URL',
  'GARMIN_CONNECTOR_URL',
  'COOKIDOO_CONNECTOR_URL',
  'MARKITDOWN_CONNECTOR_URL',
  'MINIO_ENDPOINT',
] as const;

/** Browser-facing or internet-facing URLs: https only in production (cookies are `secure`, OAuth redirects). */
const PUBLIC_URL_VARIABLES = [
  'AUTH_SERVICE_URL',
  'FRONTEND_URL',
  'PUBLIC_BASE_URL',
] as const;

/** Matches the check in AesGcmCredentialCrypto. */
const MIN_ENCRYPTION_KEY_LENGTH = 32;

/**
 * Environment validation, run once at startup by ConfigModule. Throwing here stops the service
 * before it serves anything with an unusable configuration. All problems are reported together;
 * values are never echoed (they are secrets).
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];

  const present = (variable: string): string | null => {
    const value = env[variable];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  };

  for (const variable of REQUIRED) {
    if (present(variable) === null) {
      problems.push(`${variable} is required`);
    }
  }

  const encryptionKey = present('CREDENTIALS_ENCRYPTION_KEY');
  if (
    encryptionKey !== null &&
    encryptionKey.length < MIN_ENCRYPTION_KEY_LENGTH
  ) {
    problems.push(
      `CREDENTIALS_ENCRYPTION_KEY must be at least ${MIN_ENCRYPTION_KEY_LENGTH.toString()} characters long`,
    );
  }

  for (const variable of URL_VARIABLES) {
    const value = present(variable);
    if (value === null) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      problems.push(`${variable} must be a valid URL`);
      continue;
    }
    if (
      production &&
      (PUBLIC_URL_VARIABLES as readonly string[]).includes(variable) &&
      url.protocol !== 'https:'
    ) {
      problems.push(`${variable} must be an https:// URL in production`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${problems.join('\n- ')}`,
    );
  }
  return env;
}
