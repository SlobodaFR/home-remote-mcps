import { CallToolResult } from '@modelcontextprotocol/server';
import {
  OpenAiDataGateway,
  OpenAiNotConnectedError,
} from '../../application/mcp/openai-data-gateway';
import {
  OpenAiConnector,
  OpenAiCredentials,
} from '../../domain/openai/openai-connector';

function asJsonContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export type OpenAiRunner = (
  call: (
    connector: OpenAiConnector,
    credentials: OpenAiCredentials,
  ) => Promise<unknown>,
) => Promise<CallToolResult>;

/**
 * Loads the named connection's stored OpenAI credentials, runs a connector
 * call, and turns OpenAiNotConnectedError into an MCP tool error result
 * instead of a thrown exception. Mirrors makeInstagramRunner.
 */
export function makeOpenAiRunner(
  gateway: OpenAiDataGateway,
  userId: string,
  connectionName: string,
): OpenAiRunner {
  return async (call) => {
    try {
      const data = await gateway.run(userId, connectionName, call);
      return asJsonContent(data);
    } catch (error) {
      if (error instanceof OpenAiNotConnectedError) {
        return {
          content: [{ type: 'text' as const, text: error.message }],
          isError: true,
        };
      }
      throw error;
    }
  };
}
