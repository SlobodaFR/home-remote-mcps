import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';
import { pseudonymize } from '../../domain/shared/pseudonymize';

/**
 * Defense in depth only: pino redaction matches object keys (one level per `*`) and never looks
 * inside message strings. The real controls are that log messages never interpolate personal data
 * (use pseudonymize()), that request/response serializers keep no headers, query or secret path
 * segment, and that errors are logged through the whitelist serializer below.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'res.headers.location',
  '*.email',
  '*.name',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.client_secret',
  '*.clientSecret',
  '*.refresh_token',
  '*.access_token',
  '*.password',
  '*.parameters',
  '*.query',
];

const QUIET_PATHS = [/^\/assets\//];

/** `/api/mcp/<service>/<apiKey>/...`: the API key travels in the path (see ApiKeyGuard). */
const MCP_KEY_SEGMENT = /^(\/api\/mcp\/[^/]+\/)[^/]+/i;

/** Path without query string (OAuth `code`, webhook `secret`) and without the MCP API key. */
export function safePath(url: string | undefined): string {
  const path = (url ?? '').split('?')[0];
  return path.replace(MCP_KEY_SEGMENT, '$1[redacted]');
}

interface SerializedError {
  type?: string;
  message?: string;
  stack?: string;
  code?: string | number;
}

/**
 * Whitelist serializer for `err`. The default pino serializer copies every enumerable property of
 * an error, and the errors this service meets carry data: TypeORM's QueryFailedError holds `query`,
 * `parameters` (emails, names, encrypted credentials) and `driverError`; HTTP client errors carry
 * `response`/`config` (Authorization headers, API keys). Only these four fields are ever logged,
 * and `cause` is dropped.
 *
 * pino-http hands custom serializers an error that pino-std-serializers already serialized, with
 * the original under `.raw`: unwrap it first, otherwise type/stack/code are lost on the request
 * completion line.
 */
export function serializeError(input: unknown): SerializedError {
  const error = (
    input !== null && typeof input === 'object' && 'raw' in input && input.raw
      ? input.raw
      : input
  ) as Record<string, unknown> | null;
  if (error === null || typeof error !== 'object') {
    return { message: typeof error === 'string' ? error : undefined };
  }
  const type =
    typeof error.type === 'string'
      ? error.type
      : (error.constructor as { name?: string } | undefined)?.name;
  const { code } = error;
  return {
    type,
    message: typeof error.message === 'string' ? error.message : undefined,
    stack: typeof error.stack === 'string' ? error.stack : undefined,
    code:
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
  };
}

interface AuthenticatedLogRequest extends IncomingMessage {
  user?: { id?: string };
  mcpUserId?: string;
}

export function loggerParams(
  nodeEnv: string | undefined,
  pseudonymSecret: string,
): Params {
  return {
    pinoHttp: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      redact: REDACT_PATHS,
      serializers: {
        // No headers (cookies, tokens), no query string, no IP, no API key in the path.
        req: (req: IncomingMessage) => ({
          method: req.method,
          url: safePath(req.url),
        }),
        // No headers: Location carries authorization codes, Set-Cookie the session tokens.
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        err: serializeError,
      },
      // Evaluated when the response is logged, after the guards resolved the user.
      customProps: (req: IncomingMessage) => {
        const { user, mcpUserId } = req as AuthenticatedLogRequest;
        const userId = user?.id ?? mcpUserId;
        return userId ? { user: pseudonymize(userId, pseudonymSecret) } : {};
      },
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          QUIET_PATHS.some((pattern) => pattern.test(safePath(req.url))),
      },
      customLogLevel: (
        _req: IncomingMessage,
        res: ServerResponse,
        err?: Error,
      ) => {
        if (err || res.statusCode >= 500) {
          return 'error';
        }
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
      transport:
        nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  };
}
