import { CallToolResult } from '@modelcontextprotocol/server';
import {
  HomeAssistantDataGateway,
  HomeAssistantNotConnectedError,
} from '../../application/mcp/home-assistant-data-gateway';
import {
  HomeAssistantConnector,
  HomeAssistantCredentials,
} from '../../domain/home-assistant/home-assistant-connector';

function asJsonContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export type HomeAssistantRunner = (
  call: (
    connector: HomeAssistantConnector,
    credentials: HomeAssistantCredentials,
  ) => Promise<unknown>,
) => Promise<CallToolResult>;

/**
 * Shared between home-assistant-tools.ts (generic) and
 * home-assistant-domain-tools.ts (per-domain) - loads the user's stored HA
 * credentials, runs a connector call, and turns
 * HomeAssistantNotConnectedError into an MCP tool error result instead of a
 * thrown exception.
 */
export function makeHomeAssistantRunner(
  gateway: HomeAssistantDataGateway,
  userId: string,
): HomeAssistantRunner {
  return async (call) => {
    try {
      const data = await gateway.run(userId, call);
      return asJsonContent(data);
    } catch (error) {
      if (error instanceof HomeAssistantNotConnectedError) {
        return {
          content: [{ type: 'text' as const, text: error.message }],
          isError: true,
        };
      }
      throw error;
    }
  };
}
