import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  HomeAssistantDataGateway,
  HomeAssistantNotConnectedError,
} from '../../application/mcp/home-assistant-data-gateway';
import {
  HomeAssistantConnector,
  HomeAssistantCredentials,
} from '../../domain/home-assistant/home-assistant-connector';

function asJsonContent(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Generic-first Home Assistant toolset: unlike Garmin (~130 bespoke methods
 * behind an unofficial library), Home Assistant's REST API is small and
 * uniform, so a handful of tools plus one raw passthrough (`ha_request`,
 * mirroring `garmin_connectapi`) cover the whole surface. Domain-specific
 * tools (e.g. `ha_set_light`) can be layered on top later if useful.
 */
export function registerHomeAssistantTools(
  server: McpServer,
  gateway: HomeAssistantDataGateway,
  userId: string,
): void {
  async function run(
    call: (
      connector: HomeAssistantConnector,
      credentials: HomeAssistantCredentials,
    ) => Promise<unknown>,
  ): Promise<{
    content: { type: 'text'; text: string }[];
    isError?: boolean;
  }> {
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
  }

  server.registerTool(
    'ha_get_states',
    {
      description:
        'Get the current state of one entity, or all entities if entityId is omitted (Home Assistant: GET /api/states)',
      inputSchema: z.object({ entityId: z.string().optional() }),
    },
    ({ entityId }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          'GET',
          entityId
            ? `/api/states/${encodeURIComponent(entityId)}`
            : '/api/states',
        ),
      ),
  );

  server.registerTool(
    'ha_call_service',
    {
      description:
        'Call a Home Assistant service, e.g. domain="light" service="turn_on" serviceData={"entity_id": "light.living_room", "brightness": 200} (Home Assistant: POST /api/services/<domain>/<service>)',
      inputSchema: z.object({
        domain: z.string(),
        service: z.string(),
        serviceData: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    ({ domain, service, serviceData }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          'POST',
          `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
          { jsonBody: serviceData ?? {} },
        ),
      ),
  );

  server.registerTool(
    'ha_get_services',
    {
      description:
        'List every domain and the services it exposes, with their expected fields (Home Assistant: GET /api/services)',
      inputSchema: z.object({}),
    },
    () =>
      run((connector, credentials) =>
        connector.request(credentials, 'GET', '/api/services'),
      ),
  );

  server.registerTool(
    'ha_get_config',
    {
      description:
        "Get the Home Assistant instance's configuration (location, unit system, components loaded...) (Home Assistant: GET /api/config)",
      inputSchema: z.object({}),
    },
    () =>
      run((connector, credentials) =>
        connector.request(credentials, 'GET', '/api/config'),
      ),
  );

  server.registerTool(
    'ha_get_history',
    {
      description:
        'Get state-change history for entities over a period (Home Assistant: GET /api/history/period). startTime defaults to 1 day before now if omitted.',
      inputSchema: z.object({
        entityId: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        minimalResponse: z.boolean().optional(),
      }),
    },
    ({ entityId, startTime, endTime, minimalResponse }) =>
      run((connector, credentials) => {
        const queryParams: Record<string, string> = {};
        if (entityId) queryParams.filter_entity_id = entityId;
        if (endTime) queryParams.end_time = endTime;
        if (minimalResponse) queryParams.minimal_response = 'true';
        return connector.request(
          credentials,
          'GET',
          startTime
            ? `/api/history/period/${encodeURIComponent(startTime)}`
            : '/api/history/period',
          { queryParams },
        );
      }),
  );

  server.registerTool(
    'ha_get_logbook',
    {
      description:
        'Get logbook entries (human-readable event log) over a period (Home Assistant: GET /api/logbook)',
      inputSchema: z.object({
        entityId: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      }),
    },
    ({ entityId, startTime, endTime }) =>
      run((connector, credentials) => {
        const queryParams: Record<string, string> = {};
        if (entityId) queryParams.entity = entityId;
        if (endTime) queryParams.end_time = endTime;
        return connector.request(
          credentials,
          'GET',
          startTime
            ? `/api/logbook/${encodeURIComponent(startTime)}`
            : '/api/logbook',
          { queryParams },
        );
      }),
  );

  server.registerTool(
    'ha_set_state',
    {
      description:
        'Directly set/override an entity state (mainly for virtual/template entities - does not call a service or affect the physical device) (Home Assistant: POST /api/states/<entity_id>)',
      inputSchema: z.object({
        entityId: z.string(),
        state: z.string(),
        attributes: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    ({ entityId, state, attributes }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          'POST',
          `/api/states/${encodeURIComponent(entityId)}`,
          { jsonBody: { state, attributes } },
        ),
      ),
  );

  server.registerTool(
    'ha_fire_event',
    {
      description:
        'Fire an event on the Home Assistant event bus (Home Assistant: POST /api/events/<event_type>)',
      inputSchema: z.object({
        eventType: z.string(),
        eventData: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    ({ eventType, eventData }) =>
      run((connector, credentials) =>
        connector.request(
          credentials,
          'POST',
          `/api/events/${encodeURIComponent(eventType)}`,
          { jsonBody: eventData ?? {} },
        ),
      ),
  );

  server.registerTool(
    'ha_render_template',
    {
      description:
        'Render a Home Assistant Jinja2 template server-side, e.g. "{{ states(\'sensor.temperature\') }}" (Home Assistant: POST /api/template)',
      inputSchema: z.object({ template: z.string() }),
    },
    ({ template }) =>
      run((connector, credentials) =>
        connector.request(credentials, 'POST', '/api/template', {
          jsonBody: { template },
        }),
      ),
  );

  server.registerTool(
    'ha_request',
    {
      description:
        'Raw Home Assistant REST call (GET/POST/PUT/DELETE) for endpoints with no dedicated tool. Path is relative, e.g. "/api/camera_proxy/camera.front_door".',
      inputSchema: z.object({
        httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        path: z.string(),
        jsonBody: z.unknown().optional(),
        queryParams: z.record(z.string(), z.string()).optional(),
      }),
    },
    ({ httpMethod, path, jsonBody, queryParams }) =>
      run((connector, credentials) =>
        connector.request(credentials, httpMethod, path, {
          jsonBody,
          queryParams,
        }),
      ),
  );
}
