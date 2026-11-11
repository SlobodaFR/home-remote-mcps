import { McpServer } from '@modelcontextprotocol/server';
import { HomeAssistantDataGateway } from '../../application/mcp/home-assistant-data-gateway';
import { CredentialRepository } from '../../domain/credential/credential.repository';
import {
  HomeAssistantConnector,
  HomeAssistantCredentials,
  HomeAssistantHttpMethod,
} from '../../domain/home-assistant/home-assistant-connector';
import { CredentialCrypto } from '../../domain/shared/credential-crypto';
import { registerHomeAssistantDomainTools } from './home-assistant-domain-tools';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

class RecordingHomeAssistantConnector extends HomeAssistantConnector {
  readonly sentBodies: unknown[] = [];

  testConnection(): Promise<{ status: 'ok' }> {
    return Promise.resolve({ status: 'ok' });
  }

  request<T>(
    _credentials: HomeAssistantCredentials,
    _httpMethod: HomeAssistantHttpMethod,
    _path: string,
    options?: { jsonBody?: unknown },
  ): Promise<T> {
    this.sentBodies.push(options?.jsonBody);
    return Promise.resolve([] as T);
  }
}

function registerTools(
  connector: HomeAssistantConnector,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: ToolHandler) =>
      handlers.set(name, handler),
  } as unknown as McpServer;
  const credentialRepository = {
    findByUserAndService: () =>
      Promise.resolve({ status: 'ok', encryptedTokens: 'stored' }),
  } as unknown as CredentialRepository;
  const credentialCrypto = {
    decrypt: () => JSON.stringify({ baseUrl: 'http://ha', token: 't' }),
  } as unknown as CredentialCrypto;
  const gateway = new HomeAssistantDataGateway(
    credentialRepository,
    credentialCrypto,
    connector,
  );
  registerHomeAssistantDomainTools(server, gateway, 'user-1');
  return handlers;
}

describe('registerHomeAssistantDomainTools', () => {
  it('should send own input arguments as Home Assistant service data', async () => {
    const connector = new RecordingHomeAssistantConnector();
    const turnOn = registerTools(connector).get('ha_light_turn_on')!;

    await turnOn({ entityId: 'light.kitchen', brightness: 120 });

    expect(connector.sentBodies).toEqual([
      { entity_id: 'light.kitchen', brightness: 120 },
    ]);
  });

  it('should ignore arguments only reachable through the input prototype', async () => {
    const connector = new RecordingHomeAssistantConnector();
    const turnOn = registerTools(connector).get('ha_light_turn_on')!;
    const input = Object.create({ brightness: 255 }) as Record<string, unknown>;
    input.entityId = 'light.kitchen';

    await turnOn(input);

    expect(connector.sentBodies).toEqual([{ entity_id: 'light.kitchen' }]);
  });
});
