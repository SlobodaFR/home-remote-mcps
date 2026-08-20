import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { HomeAssistantDataGateway } from '../../application/mcp/home-assistant-data-gateway';
import { makeHomeAssistantRunner } from './home-assistant-tool-runtime';

interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes?: { friendly_name?: string };
}

/**
 * Generic-first Home Assistant toolset: unlike Garmin (~130 bespoke methods
 * behind an unofficial library), Home Assistant's REST API is small and
 * uniform, so a handful of tools plus one raw passthrough (`ha_request`,
 * mirroring `garmin_connectapi`) cover the whole surface. Domain-specific
 * tools (lights, switches, climate, covers, media players - see
 * home-assistant-domain-tools.ts) are layered on top for the common cases.
 */
export function registerHomeAssistantTools(
  server: McpServer,
  gateway: HomeAssistantDataGateway,
  userId: string,
): void {
  const run = makeHomeAssistantRunner(gateway, userId);

  server.registerTool(
    'ha_list_entities',
    {
      description:
        'List entities as {entityId, friendlyName, state} - lighter than ha_get_states\' full attribute dump. Filter by domain (e.g. "light", "switch", "climate", "cover", "media_player", "sensor") to browse what\'s available before calling a domain-specific tool.',
      inputSchema: z.object({ domain: z.string().optional() }),
    },
    ({ domain }) =>
      run(async (connector, credentials) => {
        const states = await connector.request<HomeAssistantState[]>(
          credentials,
          'GET',
          '/api/states',
        );
        return states
          .filter((s) => !domain || s.entity_id.startsWith(`${domain}.`))
          .map((s) => ({
            entityId: s.entity_id,
            friendlyName: s.attributes?.friendly_name ?? s.entity_id,
            state: s.state,
          }));
      }),
  );

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
