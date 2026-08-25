import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { LogsDataGateway } from '../../application/mcp/logs-data-gateway';
import { makeLogsRunner } from './logs-tool-runtime';

/** One Vector docker_logs record, decompressed from a MinIO log object. */
interface VectorLogLine {
  timestamp?: string;
  host?: string;
  container_name?: string;
  container_id?: string;
  image?: string;
  stream?: string;
  message?: string;
}

function asVectorLogLine(line: unknown): VectorLogLine {
  return typeof line === 'object' && line !== null ? line : {};
}

function matchesContainer(line: unknown, container: string): boolean {
  const containerName = asVectorLogLine(line).container_name;
  return (
    typeof containerName === 'string' &&
    containerName.toLowerCase().includes(container.toLowerCase())
  );
}

/** Falls back to a literal substring match if `pattern` isn't a valid regex. */
function buildMessageMatcher(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

/** Inclusive list of YYYY-MM-DD strings between `from` and `to`. */
function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Strips a known parent prefix off a MinIO "common prefix" to get the bare folder name. */
function folderName(parentPrefix: string, prefix: string): string {
  return prefix.slice(parentPrefix.length).replace(/\/$/, '');
}

const MAX_SEARCH_DATES = 62;

/**
 * Read-only toolset over the shared home-lab MinIO bucket that Vector ships
 * Docker container logs into (see the home-monitoring repo's vector.toml).
 * Host and date are auto-discovered by listing prefixes under the user's
 * configured base path - see LogsConnector for the object key layout.
 */
export function registerLogsTools(
  server: McpServer,
  gateway: LogsDataGateway,
  userId: string,
): void {
  const run = makeLogsRunner(gateway, userId);

  server.registerTool(
    'logs_list_hosts',
    {
      description:
        'List container hosts that have shipped logs (top-level folders under the configured MinIO base path).',
      inputSchema: z.object({}),
    },
    () =>
      run(async (connector, credentials) => {
        const prefixes = await connector.listPrefixes(
          credentials,
          credentials.basePath,
        );
        return prefixes
          .map((prefix) => folderName(credentials.basePath, prefix))
          .sort();
      }),
  );

  server.registerTool(
    'logs_list_dates',
    {
      description:
        'List dates (YYYY-MM-DD) that have log objects for a given host.',
      inputSchema: z.object({ host: z.string() }),
    },
    ({ host }) =>
      run(async (connector, credentials) => {
        const hostPrefix = `${credentials.basePath}${host}/`;
        const prefixes = await connector.listPrefixes(credentials, hostPrefix);
        return prefixes.map((prefix) => folderName(hostPrefix, prefix)).sort();
      }),
  );

  server.registerTool(
    'logs_tail',
    {
      description:
        'Return the most recent log lines for a host (and optionally a single date), newest batches read first. Useful for "what just happened" debugging.',
      inputSchema: z.object({
        host: z.string(),
        date: z
          .string()
          .optional()
          .describe('YYYY-MM-DD, defaults to today (UTC) if omitted.'),
        container: z
          .string()
          .optional()
          .describe('Filter to container names containing this substring.'),
        lines: z
          .number()
          .optional()
          .describe('Max lines returned (default 200, max 2000).'),
      }),
    },
    ({ host, date, container, lines }) =>
      run(async (connector, credentials) => {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        const datePrefix = `${credentials.basePath}${host}/${targetDate}/`;
        const objects = await connector.listObjects(credentials, datePrefix);
        const newestFirst = [...objects].sort((a, b) =>
          b.lastModified.localeCompare(a.lastModified),
        );

        const maxLines = Math.min(lines ?? 200, 2000);
        const collected: unknown[] = [];
        for (const object of newestFirst) {
          if (collected.length >= maxLines) break;
          const objectLines = await connector.readObjectLines(
            credentials,
            object.key,
          );
          const filtered = container
            ? objectLines.filter((line) => matchesContainer(line, container))
            : objectLines;
          collected.push(...filtered);
        }
        return collected.slice(-maxLines);
      }),
  );

  server.registerTool(
    'logs_search',
    {
      description:
        'Grep log messages for a host across a date range. Scans compressed log objects date by date, capped at maxObjects - narrow the date range or add a container filter if results come back truncated.',
      inputSchema: z.object({
        host: z.string(),
        dateFrom: z.string().describe('YYYY-MM-DD, inclusive.'),
        dateTo: z.string().describe('YYYY-MM-DD, inclusive.'),
        pattern: z
          .string()
          .describe(
            'Case-insensitive regex (or plain substring) matched against the log message.',
          ),
        container: z
          .string()
          .optional()
          .describe('Filter to container names containing this substring.'),
        maxObjects: z
          .number()
          .optional()
          .describe(
            'Max compressed log objects scanned (default 20, max 100).',
          ),
      }),
    },
    ({ host, dateFrom, dateTo, pattern, container, maxObjects }) =>
      run(async (connector, credentials) => {
        const dates = enumerateDates(dateFrom, dateTo);
        if (dates.length > MAX_SEARCH_DATES) {
          throw new Error(
            `Date range too wide (${dates.length.toString()} days, max ${MAX_SEARCH_DATES.toString()}). Narrow dateFrom/dateTo.`,
          );
        }

        const cap = Math.min(maxObjects ?? 20, 100);
        const messageMatcher = buildMessageMatcher(pattern);
        const matches: unknown[] = [];
        let scannedObjects = 0;
        let truncated = false;

        outer: for (const date of dates) {
          const datePrefix = `${credentials.basePath}${host}/${date}/`;
          const objects = await connector.listObjects(credentials, datePrefix);
          for (const object of objects) {
            if (scannedObjects >= cap) {
              truncated = true;
              break outer;
            }
            scannedObjects += 1;
            const objectLines = await connector.readObjectLines(
              credentials,
              object.key,
            );
            for (const line of objectLines) {
              const parsed = asVectorLogLine(line);
              if (container && !matchesContainer(line, container)) continue;
              if (
                typeof parsed.message === 'string' &&
                messageMatcher.test(parsed.message)
              ) {
                matches.push(line);
              }
            }
          }
        }

        return { matches, scannedObjects, truncated };
      }),
  );

  server.registerTool(
    'logs_get_object',
    {
      description:
        'Fetch and decompress one specific log object by its full MinIO key (from logs_tail/logs_search results), for reading a batch in full.',
      inputSchema: z.object({
        key: z.string(),
        offset: z
          .number()
          .optional()
          .describe('Skip this many lines (default 0).'),
        limit: z
          .number()
          .optional()
          .describe('Max lines returned (default 500, max 2000).'),
      }),
    },
    ({ key, offset, limit }) =>
      run(async (connector, credentials) => {
        if (!key.startsWith(credentials.basePath)) {
          throw new Error('Key must be under the configured log base path.');
        }
        const lines = await connector.readObjectLines(credentials, key);
        const start = offset ?? 0;
        const cappedLimit = Math.min(limit ?? 500, 2000);
        return lines.slice(start, start + cappedLimit);
      }),
  );
}
