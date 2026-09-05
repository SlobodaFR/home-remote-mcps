import { CallToolResult } from '@modelcontextprotocol/server';
import {
  InstagramDataGateway,
  InstagramNotConnectedError,
} from '../../application/mcp/instagram-data-gateway';
import {
  InstagramConnector,
  InstagramCredentials,
} from '../../domain/instagram/instagram-connector';

function asJsonContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export type InstagramRunner = (
  call: (
    connector: InstagramConnector,
    credentials: InstagramCredentials,
  ) => Promise<unknown>,
) => Promise<CallToolResult>;

/**
 * Loads the named account's stored Instagram credentials, runs a connector
 * call, and turns InstagramNotConnectedError into an MCP tool error result
 * instead of a thrown exception. Mirrors makeHomeAssistantRunner.
 */
export function makeInstagramRunner(
  gateway: InstagramDataGateway,
  userId: string,
  accountName: string,
): InstagramRunner {
  return async (call) => {
    try {
      const data = await gateway.run(userId, accountName, call);
      return asJsonContent(data);
    } catch (error) {
      if (error instanceof InstagramNotConnectedError) {
        return {
          content: [{ type: 'text' as const, text: error.message }],
          isError: true,
        };
      }
      throw error;
    }
  };
}
