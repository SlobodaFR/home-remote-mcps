import { ConfigService } from '@nestjs/config';
import { HttpCookidooConnector } from './cookidoo/http-cookidoo-connector';
import { HttpGarminConnector } from './garmin/http-garmin-connector';
import { HttpHomeAssistantConnector } from './home-assistant/http-home-assistant-connector';
import { HttpInstagramConnector } from './instagram/http-instagram-connector';
import { HttpMarkitdownConnector } from './markitdown/http-markitdown-connector';
import { HttpOpenAiConnector } from './openai/http-openai-connector';
import { HttpYoutubeConnector } from './youtube/http-youtube-connector';

const SECRET_KEY = 'sk-proj-ABCDEFGH12345678';
const EMAIL = 'alice.smith@example.com';
const LEAKY = `Incorrect API key provided: ${SECRET_KEY} for ${EMAIL}. ${'padding '.repeat(60)}`;

const config = new ConfigService({
  GARMIN_CONNECTOR_URL: 'http://garmin.test',
  GARMIN_CONNECTOR_SECRET: 'internal',
  COOKIDOO_CONNECTOR_URL: 'http://cookidoo.test',
  COOKIDOO_CONNECTOR_SECRET: 'internal',
  MARKITDOWN_CONNECTOR_URL: 'http://markitdown.test',
  MARKITDOWN_CONNECTOR_SECRET: 'internal',
});

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Upstream error texts echo what we sent (a masked key, an email) and end up in tool results, in
// the credentials page (`lastError`) and, if unhandled, in logs.
const cases: [string, unknown, () => Promise<unknown>][] = [
  [
    'OpenAI',
    { error: { message: LEAKY } },
    () =>
      new HttpOpenAiConnector(config).request(
        { apiKey: 'k' },
        'GET',
        '/models',
      ),
  ],
  [
    'Instagram',
    { error: { message: LEAKY } },
    () =>
      new HttpInstagramConnector(config).request('token', 'GET', 'me/accounts'),
  ],
  [
    'Home Assistant',
    { message: LEAKY },
    () =>
      new HttpHomeAssistantConnector().request(
        { baseUrl: 'http://ha.test', token: 't' },
        'GET',
        '/api/states',
      ),
  ],
  [
    'YouTube data API',
    { error: { message: LEAKY } },
    () =>
      new HttpYoutubeConnector().call(
        JSON.stringify({
          clientId: 'c',
          clientSecret: 's',
          refreshToken: 'r',
          accessToken: 'a',
          accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        }),
        'get_channel',
        {},
      ),
  ],
  [
    'YouTube token refresh',
    { error: 'invalid_grant', error_description: LEAKY },
    () =>
      new HttpYoutubeConnector().call(
        JSON.stringify({
          clientId: 'c',
          clientSecret: 's',
          refreshToken: 'r',
        }),
        'get_channel',
        {},
      ),
  ],
  [
    'garmin-connector',
    { detail: LEAKY },
    () => new HttpGarminConnector(config).call('{}', 'get_stats', {}),
  ],
  [
    'cookidoo-connector',
    { detail: LEAKY },
    () =>
      new HttpCookidooConnector(config).call(
        {},
        { countryCode: 'ch', language: 'fr-CH', url: 'x' },
        'get_user_info',
        {},
      ),
  ],
  [
    'markitdown-connector',
    { detail: LEAKY },
    () => new HttpMarkitdownConnector(config).convertUrl('https://x.test'),
  ],
];

describe('errors from external APIs', () => {
  it.each(cases)(
    '%s: never forwards a key or email, and caps the length',
    async (_name, body, run) => {
      stubFetch(400, body);

      const error = await run().then(
        () => new Error('should have failed'),
        (caught: unknown) => caught as Error,
      );

      expect(error.message).not.toContain(SECRET_KEY);
      expect(error.message).not.toContain(EMAIL);
      expect(error.message).toContain('Incorrect API key provided');
      expect(error.message.length).toBeLessThan(260);
    },
  );

  it.each([
    [
      'garmin-connector',
      () => new HttpGarminConnector(config).call('{}', 'x', {}),
    ],
    [
      'markitdown-connector',
      () => new HttpMarkitdownConnector(config).convertUrl('https://x.test'),
    ],
  ])(
    '%s: a structured detail (validation errors) falls back to the status only',
    async (_name, run) => {
      stubFetch(422, { detail: [{ loc: ['body', 'email'], input: EMAIL }] });

      const error = await run().then(
        () => new Error('should have failed'),
        (caught: unknown) => caught as Error,
      );

      expect(error.message).toMatch(/request failed: 422$/);
      expect(error.message).not.toContain(EMAIL);
    },
  );
});
