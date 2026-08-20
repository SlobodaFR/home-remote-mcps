import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  GarminDataGateway,
  GarminNotConnectedError,
} from '../../application/mcp/garmin-data-gateway';
import {
  GarminConnector,
  GarminDataResult,
} from '../../domain/garmin/garmin-connector';

const DATE_DESCRIPTION = 'Date in YYYY-MM-DD format (defaults to today)';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function asJsonContent(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function callGarmin<T>(
  gateway: GarminDataGateway,
  userId: string,
  call: (
    connector: GarminConnector,
    tokensJson: string,
  ) => Promise<GarminDataResult<T>>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const data = await gateway.run<T>(userId, call);
    return asJsonContent(data);
  } catch (error) {
    if (error instanceof GarminNotConnectedError) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }
    throw error;
  }
}

/** Registers the Garmin toolset on a fresh McpServer, scoped to one authenticated user. */
export function registerGarminTools(
  server: McpServer,
  gateway: GarminDataGateway,
  userId: string,
): void {
  server.registerTool(
    'garmin_get_daily_steps',
    {
      description: "Get a day's step count and step goal from Garmin Connect",
      inputSchema: z.object({
        date: z.string().optional().describe(DATE_DESCRIPTION),
      }),
    },
    async ({ date }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getDailySteps(tokens, date ?? today()),
      ),
  );

  server.registerTool(
    'garmin_get_sleep',
    {
      description:
        "Get a night's sleep data (duration, stages, score) from Garmin Connect",
      inputSchema: z.object({
        date: z.string().optional().describe(DATE_DESCRIPTION),
      }),
    },
    async ({ date }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getSleep(tokens, date ?? today()),
      ),
  );

  server.registerTool(
    'garmin_get_heart_rate',
    {
      description:
        "Get a day's heart rate data (resting HR, HR zones) from Garmin Connect",
      inputSchema: z.object({
        date: z.string().optional().describe(DATE_DESCRIPTION),
      }),
    },
    async ({ date }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getHeartRate(tokens, date ?? today()),
      ),
  );

  server.registerTool(
    'garmin_get_body_battery',
    {
      description:
        "Get a day's Body Battery (energy level) data from Garmin Connect",
      inputSchema: z.object({
        date: z.string().optional().describe(DATE_DESCRIPTION),
      }),
    },
    async ({ date }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getBodyBattery(tokens, date ?? today()),
      ),
  );

  server.registerTool(
    'garmin_get_stress',
    {
      description: "Get a day's stress level data from Garmin Connect",
      inputSchema: z.object({
        date: z.string().optional().describe(DATE_DESCRIPTION),
      }),
    },
    async ({ date }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getStress(tokens, date ?? today()),
      ),
  );

  server.registerTool(
    'garmin_get_activities',
    {
      description:
        'List recent activities (runs, rides, workouts...) from Garmin Connect',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max activities to return (default 10)'),
      }),
    },
    async ({ limit }) =>
      callGarmin(gateway, userId, (connector, tokens) =>
        connector.getActivities(tokens, limit ?? 10),
      ),
  );
}
