import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { PersonalHealthDataGateway } from '../../application/mcp/personal-health-data-gateway';
import { makePersonalHealthRunner } from './personal-health-tool-runtime';

const rangeSchema = {
  from: z
    .string()
    .optional()
    .describe(
      'Inclusive lower bound, compared against the stored date string.',
    ),
  to: z
    .string()
    .optional()
    .describe(
      'Inclusive upper bound, compared against the stored date string.',
    ),
  limit: z
    .number()
    .optional()
    .describe('Max rows returned (default 100, max 1000).'),
};

function rangeQueryParams({
  from,
  to,
  limit,
}: {
  from?: string;
  to?: string;
  limit?: number;
}): Record<string, string | undefined> {
  return { from, to, limit: limit === undefined ? undefined : String(limit) };
}

/**
 * Read-only toolset over health.sloboda.fr's Apple Health data (ingested
 * there via the Health Auto Export iOS app). Every endpoint is GET-only and
 * scoped to the user's own API key - see PersonalHealthConnector.
 */
export function registerPersonalHealthTools(
  server: McpServer,
  gateway: PersonalHealthDataGateway,
  userId: string,
): void {
  const run = makePersonalHealthRunner(gateway, userId);

  server.registerTool(
    'personal_health_get_metrics',
    {
      description:
        'List health metrics (step_count, heart_rate, active_energy, ...), most recent first. Filter to a single metric with `name`. (GET /api/health/<key>/metrics)',
      inputSchema: z.object({ ...rangeSchema, name: z.string().optional() }),
    },
    ({ from, to, limit, name }) =>
      run((connector, credentials) =>
        connector.request(credentials, '/metrics', {
          ...rangeQueryParams({ from, to, limit }),
          name,
        }),
      ),
  );

  server.registerTool(
    'personal_health_get_metric',
    {
      description:
        'List data points for a single metric name (e.g. step_count), most recent first. (GET /api/health/<key>/metrics/<name>)',
      inputSchema: z.object({ name: z.string(), ...rangeSchema }),
    },
    ({ name, from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          `/metrics/${encodeURIComponent(name)}`,
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_workouts',
    {
      description:
        'List workouts, most recent first. (GET /api/health/<key>/workouts)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/workouts',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_workout',
    {
      description:
        'Get a single workout by id. (GET /api/health/<key>/workouts/<id>)',
      inputSchema: z.object({ id: z.string() }),
    },
    ({ id }) =>
      run((connector, credentials) =>
        connector.request(credentials, `/workouts/${encodeURIComponent(id)}`),
      ),
  );

  server.registerTool(
    'personal_health_get_symptoms',
    {
      description:
        'List logged symptoms, most recent first. (GET /api/health/<key>/symptoms)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/symptoms',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_ecg',
    {
      description:
        'List ECG readings, most recent first. (GET /api/health/<key>/ecg)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/ecg',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_heart_rate_notifications',
    {
      description:
        'List heart rate notifications (high/low/irregular alerts), most recent first. (GET /api/health/<key>/heart-rate-notifications)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/heart-rate-notifications',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_state_of_mind',
    {
      description:
        'List state of mind entries, most recent first. (GET /api/health/<key>/state-of-mind)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/state-of-mind',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_cycle_tracking',
    {
      description:
        'List cycle tracking entries, most recent first. (GET /api/health/<key>/cycle-tracking)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/cycle-tracking',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );

  server.registerTool(
    'personal_health_get_medications',
    {
      description:
        'List logged medications, most recent first. (GET /api/health/<key>/medications)',
      inputSchema: z.object(rangeSchema),
    },
    ({ from, to, limit }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          '/medications',
          rangeQueryParams({ from, to, limit }),
        ),
      ),
  );
}
