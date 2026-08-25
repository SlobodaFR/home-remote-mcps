import { CallToolResult } from '@modelcontextprotocol/server';
import {
  LogsDataGateway,
  LogsNotConnectedError,
} from '../../application/mcp/logs-data-gateway';
import {
  LogsConnector,
  LogsCredentials,
} from '../../domain/logs/log-connector';

function asJsonContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export type LogsRunner = (
  call: (
    connector: LogsConnector,
    credentials: LogsCredentials,
  ) => Promise<unknown>,
) => Promise<CallToolResult>;

/**
 * Loads the user's stored MinIO base path, runs a connector call, and turns
 * LogsNotConnectedError into an MCP tool error result instead of a thrown
 * exception - mirrors makePersonalHealthRunner.
 */
export function makeLogsRunner(
  gateway: LogsDataGateway,
  userId: string,
): LogsRunner {
  return async (call) => {
    try {
      const data = await gateway.run(userId, call);
      return asJsonContent(data);
    } catch (error) {
      if (error instanceof LogsNotConnectedError) {
        return {
          content: [{ type: 'text' as const, text: error.message }],
          isError: true,
        };
      }
      throw error;
    }
  };
}
