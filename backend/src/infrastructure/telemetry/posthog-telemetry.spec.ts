import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  createPostHogTelemetry,
  PostHogClient,
  PostHogTelemetry,
} from './posthog-telemetry';

type CaptureMessage = Parameters<PostHogClient['capture']>[0];

class FakeClient implements PostHogClient {
  readonly captured: CaptureMessage[] = [];
  shutdownTimeouts: (number | undefined)[] = [];
  failing = false;

  capture(message: CaptureMessage): void {
    if (this.failing) {
      throw new Error('network');
    }
    this.captured.push(message);
  }

  async shutdown(timeoutMs?: number): Promise<void> {
    this.shutdownTimeouts.push(timeoutMs);
    return Promise.resolve();
  }
}

const runtimeHealth = {
  name: 'runtime_health',
  properties: {
    lag_p50_ms: 1,
    lag_p99_ms: 2,
    lag_max_ms: 3,
    elu: 0.1,
    heap_used_mb: 40,
    rss_mb: 90,
  },
} as const;

const httpRequest = {
  name: 'http_request',
  properties: {
    route: '/api/items/:id',
    method: 'GET',
    status: 200,
    duration_ms: 12,
  },
} as const;

describe('PostHogTelemetry', () => {
  it('is a NOOP without POSTHOG_API_KEY: no client is created and capture does nothing', () => {
    const factory =
      vi.fn<(apiKey: string, options: unknown) => PostHogClient>();

    const telemetry = createPostHogTelemetry(new ConfigService({}), factory);

    expect(() => {
      telemetry.capture(runtimeHealth);
      telemetry.capture(httpRequest);
    }).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it('needs nothing else than the key: no other secret is required to start', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    expect(() =>
      createPostHogTelemetry(
        new ConfigService({ POSTHOG_API_KEY: 'phc_test' }),
        factory,
      ),
    ).not.toThrow();
  });

  it('creates an EU, geoip-free client with the shared batching when a key is set', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    createPostHogTelemetry(
      new ConfigService({ POSTHOG_API_KEY: 'phc_test' }),
      factory,
    );

    expect(factory).toHaveBeenCalledWith('phc_test', {
      host: 'https://eu.i.posthog.com',
      disableGeoip: true,
      flushAt: 20,
      flushInterval: 10_000,
    });
  });

  it('uses POSTHOG_HOST when set', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    createPostHogTelemetry(
      new ConfigService({
        POSTHOG_API_KEY: 'phc_test',
        POSTHOG_HOST: 'https://ph.example.test',
      }),
      factory,
    );

    expect(factory).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://ph.example.test' }),
    );
  });

  it('sends anonymous events: random id per event, no person profile, no IP, service name', () => {
    const client = new FakeClient();
    const telemetry = new PostHogTelemetry(client);

    telemetry.capture(httpRequest);
    telemetry.capture(httpRequest);

    const [first, second] = client.captured;
    expect(first.distinctId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.distinctId).not.toBe(second.distinctId);
    expect(first).toEqual({
      distinctId: first.distinctId,
      event: 'http_request',
      properties: {
        ...httpRequest.properties,
        service: 'home-remote-mcps',
        version: 'dev',
        $ip: null,
        $process_person_profile: false,
      },
      disableGeoip: true,
    });
  });

  it('adds the release version (APP_VERSION) to every ops event', () => {
    vi.stubEnv('APP_VERSION', '2.5.1');
    const client = new FakeClient();
    const telemetry = new PostHogTelemetry(client);

    telemetry.capture(httpRequest);
    telemetry.capture(httpRequest);

    expect(client.captured.map((c) => c.properties['version'])).toEqual([
      '2.5.1',
      '2.5.1',
    ]);
    vi.unstubAllEnvs();
  });

  it('drops properties that look like personal data', () => {
    const client = new FakeClient();

    new PostHogTelemetry(client).capture({
      name: 'http_request',
      properties: { ...httpRequest.properties, route: 'alice@example.com' },
    });

    expect(client.captured[0].properties).not.toHaveProperty('route');
    expect(JSON.stringify(client.captured)).not.toContain('alice');
  });

  it('never throws into the caller', () => {
    const client = new FakeClient();
    client.failing = true;

    expect(() => {
      new PostHogTelemetry(client).capture(runtimeHealth);
    }).not.toThrow();
  });

  it('flushes on application shutdown, bounded to 5 s (under the 10 s Docker stop timeout)', async () => {
    const client = new FakeClient();

    await new PostHogTelemetry(client).onApplicationShutdown();

    expect(client.shutdownTimeouts).toEqual([5000]);
  });

  it('is flushed through the Nest shutdown hooks when the app closes', async () => {
    const client = new FakeClient();
    const telemetry = new PostHogTelemetry(client);
    @Controller()
    class NoopController {
      @Get()
      ok(): string {
        return 'ok';
      }
    }
    @Module({
      controllers: [NoopController],
      providers: [{ provide: PostHogTelemetry, useValue: telemetry }],
    })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false });
    app.enableShutdownHooks();
    await app.init();

    await app.close();

    expect(client.shutdownTimeouts).toEqual([5000]);
  });
});
