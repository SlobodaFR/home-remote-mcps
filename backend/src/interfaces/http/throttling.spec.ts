import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import request from 'supertest';
import { configureApp } from './configure-app';
import {
  API_LIMIT_PER_MINUTE,
  buildThrottlerOptions,
  MCP_LIMIT_PER_MINUTE,
  throttlerOptions,
} from './throttling';

@Controller()
class StubController {
  @Get('credentials')
  credentials(): string {
    return 'json';
  }

  @Post('mcp/garmin/:apiKey')
  mcp(): string {
    return 'mcp';
  }

  // A streamable-HTTP style response: headers first, body over time.
  @Post('mcp/stream/:apiKey')
  async stream(@Res() res: Response): Promise<void> {
    res.status(200).type('text/event-stream');
    for (const chunk of ['a', 'b', 'c']) {
      res.write(`data: ${chunk}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    res.end();
  }

  @Get('ip')
  ip(@Req() req: Request): { ip?: string } {
    return { ip: req.ip };
  }
}

async function createApp(
  options: { api: number; mcp: number },
  env: NodeJS.ProcessEnv = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(buildThrottlerOptions(options))],
    controllers: [StubController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  return app;
}

describe('rate limit', () => {
  it('answers 429 once the API budget of a route is spent', async () => {
    const app = await createApp({ api: 3, mcp: 50 });
    const server = app.getHttpServer();

    for (let i = 0; i < 3; i += 1) {
      await request(server).get('/api/credentials').expect(200);
    }
    const blocked = await request(server).get('/api/credentials').expect(429);
    expect(blocked.body).toMatchObject({
      message: 'Trop de tentatives, réessayez plus tard.',
    });
    await app.close();
  });

  it('keeps a separate budget per route', async () => {
    const app = await createApp({ api: 1, mcp: 50 });
    const server = app.getHttpServer();

    await request(server).get('/api/credentials').expect(200);
    await request(server).get('/api/ip').expect(200);
    await app.close();
  });

  // Claude's servers share a few egress IPs and chain many tool calls.
  it('gives the MCP endpoints a much larger budget than the admin API', async () => {
    const app = await createApp({ api: 3, mcp: 40 });
    const server = app.getHttpServer();

    for (let i = 0; i < 40; i += 1) {
      await request(server).post('/api/mcp/garmin/key').expect(201);
    }
    await request(server).post('/api/mcp/garmin/key').expect(429);
    // The match is case-insensitive, like Express routing.
    await request(server).post('/API/MCP/stream/key').expect(200);
    await app.close();
  });

  it('does not cut a streaming MCP response, even at the edge of the budget', async () => {
    const app = await createApp({ api: 1, mcp: 5 });
    const server = app.getHttpServer();

    for (let i = 0; i < 4; i += 1) {
      await request(server).post('/api/mcp/garmin/key').expect(201);
    }
    const response = await request(server)
      .post('/api/mcp/stream/key')
      .buffer(true)
      .parse((res, callback) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => callback(null, body));
      })
      .expect(200);

    expect(response.body).toBe('data: a\n\ndata: b\n\ndata: c\n\n');
    await app.close();
  });

  it('has a production MCP budget that no legitimate client reaches, above the API one', () => {
    expect(MCP_LIMIT_PER_MINUTE).toBeGreaterThan(API_LIMIT_PER_MINUTE * 5);
    expect(throttlerOptions).toMatchObject({ ipv6SubnetPrefix: 64 });
  });

  describe('client IP behind the reverse proxy', () => {
    const ipOf = async (
      app: NestExpressApplication,
      forwardedFor: string,
    ): Promise<string> => {
      const response = await request(app.getHttpServer())
        .get('/api/ip')
        .set('X-Forwarded-For', forwardedFor);
      return (response.body as { ip: string }).ip;
    };

    it('trusts one proxy hop when TRUST_PROXY_HOPS=1', async () => {
      const app = await createApp(
        { api: 100, mcp: 100 },
        { TRUST_PROXY_HOPS: '1' },
      );

      expect(await ipOf(app, '203.0.113.7')).toBe('203.0.113.7');
      // Only the last hop (added by Caddy) is trusted: a spoofed leftmost value is ignored.
      expect(await ipOf(app, '198.51.100.9, 203.0.113.7')).toBe('203.0.113.7');
      await app.close();
    });

    it('ignores X-Forwarded-For when TRUST_PROXY_HOPS is unset (local dev)', async () => {
      const app = await createApp({ api: 100, mcp: 100 });

      expect(await ipOf(app, '203.0.113.7')).not.toBe('203.0.113.7');
      await app.close();
    });
  });
});
