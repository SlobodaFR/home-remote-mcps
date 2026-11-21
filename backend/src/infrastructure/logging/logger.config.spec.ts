import { Writable } from 'stream';
import {
  Controller,
  Get,
  Module,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { Logger, LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { pseudonymize } from '../../domain/shared/pseudonymize';
import { configureApp } from '../../interfaces/http/configure-app';
import {
  loggerParams,
  REDACT_PATHS,
  safePath,
  serializeError,
} from './logger.config';

const SECRET = 's'.repeat(48);
type Serializer = (value: unknown) => unknown;

function pinoHttpOptions(): {
  serializers: { req: Serializer; res: Serializer; err: Serializer };
} & Record<string, unknown> {
  return loggerParams('production', SECRET).pinoHttp as never;
}

function collector(): { lines: () => string[]; stream: Writable } {
  const chunks: string[] = [];
  return {
    lines: () => chunks.join('').split('\n').filter(Boolean),
    stream: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    }),
  };
}

const EMAIL = 'alice.smith@example.com';
const NAME = 'Alice Smith';

function leakyQueryError(): QueryFailedError {
  const driverError = Object.assign(
    new Error('SQLITE_BUSY: database is locked'),
    {
      code: 'SQLITE_BUSY',
    },
  );
  return new QueryFailedError(
    'INSERT INTO "users"("email","name") VALUES (?, ?)',
    [EMAIL, NAME, 'ciphertext-of-a-stored-credential'],
    driverError,
  );
}

describe('logger configuration', () => {
  describe('request and response serializers', () => {
    it('logs requests as method and path only: no query string, headers or IP', () => {
      const serialized = pinoHttpOptions().serializers.req({
        method: 'GET',
        url: '/api/auth/callback?code=abc',
        headers: { cookie: 'access_token=x', authorization: 'Bearer y' },
        remoteAddress: '203.0.113.7',
      });

      expect(serialized).toEqual({ method: 'GET', url: '/api/auth/callback' });
    });

    // The MCP API key is a credential that lives in the URL path.
    it.each([
      ['/api/mcp/garmin/KEY123', '/api/mcp/garmin/[redacted]'],
      [
        '/api/mcp/instagram/KEY123/my-account',
        '/api/mcp/instagram/[redacted]/my-account',
      ],
      ['/API/MCP/openai/KEY123/work?x=1', '/API/MCP/openai/[redacted]/work'],
      ['/api/credentials', '/api/credentials'],
      ['/api/auth/disconnect?secret=hook', '/api/auth/disconnect'],
    ])('keeps the API key out of the logged path: %s', (url, expected) => {
      expect(safePath(url)).toBe(expected);
    });

    it('logs responses as status code only: no Location or Set-Cookie header', () => {
      const serialized = pinoHttpOptions().serializers.res({
        statusCode: 302,
        headers: {
          location: 'https://app.example.com/cb?code=secret',
          'set-cookie': 'access_token=jwt',
        },
      });

      expect(serialized).toEqual({ statusCode: 302 });
    });
  });

  describe('error serializer', () => {
    it('keeps only type, message, stack and code', () => {
      const serialized = serializeError(leakyQueryError());

      expect(new Set(Object.keys(serialized))).toEqual(
        new Set(['code', 'message', 'stack', 'type']),
      );
      expect(serialized.type).toBe('QueryFailedError');
      expect(serialized.stack).toContain('QueryFailedError');
      const output = JSON.stringify(serialized);
      expect(output).not.toContain(EMAIL);
      expect(output).not.toContain(NAME);
      expect(output).not.toContain('ciphertext');
      expect(output).not.toContain('INSERT INTO');
    });

    it('drops the cause and any extra property of other errors', () => {
      const error = Object.assign(
        new Error('Request failed', { cause: new Error(EMAIL) }),
        {
          code: 'ECONNRESET',
          config: { headers: { Authorization: 'Bearer sk-secret' } },
          response: { data: { email: EMAIL } },
        },
      );

      const output = JSON.stringify(serializeError(error));

      expect(output).toContain('ECONNRESET');
      expect(output).not.toContain(EMAIL);
      expect(output).not.toContain('sk-secret');
    });

    it('unwraps the error already serialized by pino-http (original under .raw)', () => {
      const serialized = serializeError({
        type: 'Error',
        message: 'wrapped',
        raw: leakyQueryError(),
      });

      expect(serialized.type).toBe('QueryFailedError');
      expect(serialized.stack).toBeDefined();
      // QueryFailedError copies the driver's code onto itself: it stays readable.
      expect(serialized.code).toBe('SQLITE_BUSY');
    });

    it('never logs a non-error value as is', () => {
      expect(JSON.stringify(serializeError({ email: EMAIL }))).not.toContain(
        EMAIL,
      );
      expect(serializeError('boom')).toEqual({ message: 'boom' });
      expect(JSON.stringify(serializeError(null))).toBe('{}');
    });
  });

  it('redacts personal and secret fields in structured log objects', () => {
    const { lines, stream } = collector();
    const logger = pino({ redact: REDACT_PATHS }, stream);

    logger.info(
      {
        user: { email: EMAIL, name: NAME, token: 't0k3n', apiKey: 'k3y' },
        db: { parameters: [EMAIL], query: 'SELECT 1' },
        err: { code: 'SQLITE_BUSY' },
      },
      'event',
    );

    const output = lines().join('');
    for (const secret of [EMAIL, NAME, 't0k3n', 'k3y', 'SELECT 1']) {
      expect(output).not.toContain(secret);
    }
    // Error codes stay readable for diagnostics.
    expect(output).toContain('SQLITE_BUSY');
  });

  it('logs client errors as warn and server errors as error', () => {
    const level = pinoHttpOptions().customLogLevel as (
      req: unknown,
      res: { statusCode: number },
      err?: Error,
    ) => string;

    expect(level({}, { statusCode: 200 })).toBe('info');
    expect(level({}, { statusCode: 404 })).toBe('warn');
    expect(level({}, { statusCode: 500 })).toBe('error');
    expect(level({}, { statusCode: 200 }, new Error('boom'))).toBe('error');
  });

  it('skips automatic request logs for static assets only', () => {
    const { ignore } = pinoHttpOptions().autoLogging as {
      ignore: (req: { url?: string }) => boolean;
    };

    expect(ignore({ url: '/assets/index-abc.js' })).toBe(true);
    expect(ignore({ url: '/api/auth/me' })).toBe(false);
  });

  it('pretty-prints only in development', () => {
    expect(
      (loggerParams('development', SECRET).pinoHttp as Record<string, unknown>)
        .transport,
    ).toEqual({ target: 'pino-pretty' });
    expect(pinoHttpOptions().transport).toBeUndefined();
  });
});

@Controller()
class FailingController {
  @Get('db-failure')
  dbFailure(): never {
    throw leakyQueryError();
  }

  @Get('me')
  me(@Req() req: Request): string {
    (req as Request & { user: { id: string } }).user = { id: 'user-42' };
    return 'ok';
  }

  @Post('mcp/garmin/:apiKey')
  mcp(): string {
    throw new UnauthorizedException();
  }
}

describe('logging end to end (Nest + pino-http)', () => {
  let app: NestExpressApplication;
  let logs: () => string[];

  beforeAll(async () => {
    const sink = collector();
    logs = sink.lines;
    const params = loggerParams('production', SECRET);
    @Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [params.pinoHttp as never, sink.stream],
        }),
      ],
      controllers: [FailingController],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    // Same setup as production (global prefix, LoggerErrorInterceptor...).
    configureApp(app, { NODE_ENV: 'production' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Nest's BaseExceptionFilter logs every non-HTTP exception; pino-http logs it again on the
  // request completion line: both must keep the diagnosis and drop the data.
  it('keeps type and stack but never the SQL parameters of a failed query', async () => {
    await request(app.getHttpServer()).get('/api/db-failure').expect(500);

    const output = logs().join('\n');
    expect(output).toContain('QueryFailedError');
    expect(output).toContain('SQLITE_BUSY');
    expect(output).toContain('"stack"');
    for (const leaked of [
      EMAIL,
      NAME,
      'ciphertext-of-a-stored-credential',
      'INSERT INTO',
      'parameters',
      'driverError',
    ]) {
      expect(output).not.toContain(leaked);
    }
    // The completion line (pino-http) carries the unwrapped error too.
    const completion = logs()
      .map((line) => JSON.parse(line) as Record<string, any>)
      .find((entry) => entry.res?.statusCode === 500);
    expect(completion?.err.type).toBe('QueryFailedError');
    expect(completion?.err.stack).toContain('QueryFailedError');
  });

  it('never writes the MCP API key of a request to the logs', async () => {
    await request(app.getHttpServer())
      .post('/api/mcp/garmin/API-KEY-IN-THE-PATH?secret=q')
      .set('Authorization', 'Bearer bearer-secret')
      .set('Cookie', 'access_token=cookie-secret')
      .expect(401);

    const output = logs().join('\n');
    expect(output).toContain('/api/mcp/garmin/[redacted]');
    for (const leaked of [
      'API-KEY-IN-THE-PATH',
      'bearer-secret',
      'cookie-secret',
      'secret=q',
    ]) {
      expect(output).not.toContain(leaked);
    }
  });

  it('identifies the user by pseudonym only', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(200);

    const output = logs().join('\n');
    expect(output).toContain(pseudonymize('user-42', SECRET));
    expect(output).not.toContain('user-42');
  });
});
