import { CallToolResult } from '@modelcontextprotocol/server';
import {
  PersonalHealthDataGateway,
  PersonalHealthNotConnectedError,
} from '../../application/mcp/personal-health-data-gateway';
import {
  PersonalHealthConnector,
  PersonalHealthCredentials,
} from '../../domain/personal-health/personal-health-connector';

function asJsonContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export type PersonalHealthRunner = (
  call: (
    connector: PersonalHealthConnector,
    credentials: PersonalHealthCredentials,
  ) => Promise<unknown>,
) => Promise<CallToolResult>;

/**
 * Loads the user's stored personal-health API key, runs a connector call,
 * and turns PersonalHealthNotConnectedError into an MCP tool error result
 * instead of a thrown exception - mirrors makeHomeAssistantRunner.
 */
export function makePersonalHealthRunner(
  gateway: PersonalHealthDataGateway,
  userId: string,
): PersonalHealthRunner {
  return async (call) => {
    try {
      const data = await gateway.run(userId, call);
      return asJsonContent(data);
    } catch (error) {
      if (error instanceof PersonalHealthNotConnectedError) {
        return {
          content: [{ type: 'text' as const, text: error.message }],
          isError: true,
        };
      }
      throw error;
    }
  };
}
