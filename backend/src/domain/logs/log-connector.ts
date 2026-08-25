export interface LogsCredentials {
  /**
   * Prefix under the shared MinIO bucket where Vector (see the
   * home-monitoring repo) writes Docker container logs, e.g. "logs/".
   * Everything below it (host, then date) is auto-discovered - this is the
   * only thing the user configures.
   */
  basePath: string;
}

export type LogsTestResult =
  { status: 'ok' } | { status: 'error'; message: string };

export interface LogObjectSummary {
  key: string;
  size: number;
  lastModified: string;
}

/**
 * Port for the shared home-lab MinIO bucket that Vector ships Docker
 * container logs into, as gzip-compressed JSON-lines objects under
 * `<basePath>/<host>/<YYYY-MM-DD>/<uuid>.log.gz`. Unlike other connectors,
 * the bucket's own endpoint/credentials are shared infra config (the
 * `MINIO_*` env vars this backend already uses for its own Litestream
 * replication) rather than something the user supplies - `basePath` is the
 * only per-user setting, kept configurable in case the prefix ever changes.
 * `listPrefixes`/`listObjects`/`readObjectLines` are the three object-storage
 * primitives; interfaces/mcp/logs-tools.ts builds host/date discovery and
 * search on top of them.
 */
export abstract class LogsConnector {
  abstract testConnection(
    credentials: LogsCredentials,
  ): Promise<LogsTestResult>;

  /** Common prefixes ("subdirectories") one level below `prefix`. */
  abstract listPrefixes(
    credentials: LogsCredentials,
    prefix: string,
  ): Promise<string[]>;

  /** All objects (recursively) below `prefix`. */
  abstract listObjects(
    credentials: LogsCredentials,
    prefix: string,
  ): Promise<LogObjectSummary[]>;

  /** Downloads, gunzips, and JSON-parses one object into its log lines. */
  abstract readObjectLines(
    credentials: LogsCredentials,
    key: string,
  ): Promise<unknown[]>;
}
