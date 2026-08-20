import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { HomeAssistantDataGateway } from '../../application/mcp/home-assistant-data-gateway';
import { makeHomeAssistantRunner } from './home-assistant-tool-runtime';

interface ServiceParam {
  /** Argument name exposed on the MCP tool's input schema. */
  argName: string;
  /** Field name in the Home Assistant service-data payload, if different from argName. */
  key?: string;
  zod: z.ZodType;
}

interface ServiceToolDef {
  toolName: string;
  description: string;
  domain: string;
  service: string;
  params: ServiceParam[];
}

/**
 * Typed, ergonomic tools for the domains used every day (lights, switches,
 * climate, covers, media players) - each is a thin, self-documenting wrapper
 * around POST /api/services/<domain>/<service>, same call `ha_call_service`
 * makes generically. Anything not covered here still works through
 * `ha_call_service` or the raw `ha_request` passthrough.
 */
const SERVICE_TOOL_DEFS: ServiceToolDef[] = [
  // --- light ---
  {
    toolName: 'ha_light_turn_on',
    description:
      'Turn a light on, optionally setting brightness/color (Home Assistant: light.turn_on)',
    domain: 'light',
    service: 'turn_on',
    params: [
      {
        argName: 'brightness',
        zod: z.number().int().min(0).max(255).optional(),
      },
      {
        argName: 'brightnessPct',
        key: 'brightness_pct',
        zod: z.number().int().min(0).max(100).optional(),
      },
      { argName: 'colorName', key: 'color_name', zod: z.string().optional() },
      {
        argName: 'rgbColor',
        key: 'rgb_color',
        zod: z
          .tuple([z.number().int(), z.number().int(), z.number().int()])
          .optional(),
      },
      {
        argName: 'colorTempKelvin',
        key: 'color_temp_kelvin',
        zod: z.number().int().optional(),
      },
      { argName: 'effect', zod: z.string().optional() },
      { argName: 'transition', zod: z.number().optional() },
    ],
  },
  {
    toolName: 'ha_light_turn_off',
    description: 'Turn a light off (Home Assistant: light.turn_off)',
    domain: 'light',
    service: 'turn_off',
    params: [{ argName: 'transition', zod: z.number().optional() }],
  },
  {
    toolName: 'ha_light_toggle',
    description: 'Toggle a light on/off (Home Assistant: light.toggle)',
    domain: 'light',
    service: 'toggle',
    params: [],
  },

  // --- switch ---
  {
    toolName: 'ha_switch_turn_on',
    description: 'Turn a switch on (Home Assistant: switch.turn_on)',
    domain: 'switch',
    service: 'turn_on',
    params: [],
  },
  {
    toolName: 'ha_switch_turn_off',
    description: 'Turn a switch off (Home Assistant: switch.turn_off)',
    domain: 'switch',
    service: 'turn_off',
    params: [],
  },
  {
    toolName: 'ha_switch_toggle',
    description: 'Toggle a switch on/off (Home Assistant: switch.toggle)',
    domain: 'switch',
    service: 'toggle',
    params: [],
  },

  // --- climate ---
  {
    toolName: 'ha_climate_set_temperature',
    description:
      'Set a thermostat target temperature (single target, or high/low for a range) (Home Assistant: climate.set_temperature)',
    domain: 'climate',
    service: 'set_temperature',
    params: [
      { argName: 'temperature', zod: z.number().optional() },
      {
        argName: 'targetTempHigh',
        key: 'target_temp_high',
        zod: z.number().optional(),
      },
      {
        argName: 'targetTempLow',
        key: 'target_temp_low',
        zod: z.number().optional(),
      },
      { argName: 'hvacMode', key: 'hvac_mode', zod: z.string().optional() },
    ],
  },
  {
    toolName: 'ha_climate_set_hvac_mode',
    description:
      'Set the HVAC mode of a thermostat, e.g. "off"/"heat"/"cool"/"heat_cool"/"auto"/"dry"/"fan_only" (Home Assistant: climate.set_hvac_mode)',
    domain: 'climate',
    service: 'set_hvac_mode',
    params: [{ argName: 'hvacMode', key: 'hvac_mode', zod: z.string() }],
  },
  {
    toolName: 'ha_climate_set_fan_mode',
    description:
      'Set the fan mode of a thermostat, e.g. "auto"/"low"/"medium"/"high" (Home Assistant: climate.set_fan_mode)',
    domain: 'climate',
    service: 'set_fan_mode',
    params: [{ argName: 'fanMode', key: 'fan_mode', zod: z.string() }],
  },
  {
    toolName: 'ha_climate_set_preset_mode',
    description:
      'Set the preset mode of a thermostat, e.g. "eco"/"away"/"boost"/"comfort" (Home Assistant: climate.set_preset_mode)',
    domain: 'climate',
    service: 'set_preset_mode',
    params: [{ argName: 'presetMode', key: 'preset_mode', zod: z.string() }],
  },

  // --- cover ---
  {
    toolName: 'ha_cover_open',
    description:
      'Open a cover (blinds, garage door, curtains...) (Home Assistant: cover.open_cover)',
    domain: 'cover',
    service: 'open_cover',
    params: [],
  },
  {
    toolName: 'ha_cover_close',
    description: 'Close a cover (Home Assistant: cover.close_cover)',
    domain: 'cover',
    service: 'close_cover',
    params: [],
  },
  {
    toolName: 'ha_cover_stop',
    description: 'Stop a cover mid-movement (Home Assistant: cover.stop_cover)',
    domain: 'cover',
    service: 'stop_cover',
    params: [],
  },
  {
    toolName: 'ha_cover_set_position',
    description:
      'Set a cover to a specific position, 0 (closed) to 100 (open) (Home Assistant: cover.set_cover_position)',
    domain: 'cover',
    service: 'set_cover_position',
    params: [
      {
        argName: 'position',
        key: 'position',
        zod: z.number().int().min(0).max(100),
      },
    ],
  },
  {
    toolName: 'ha_cover_set_tilt_position',
    description:
      "Set a cover's slat/tilt position, 0 to 100 (Home Assistant: cover.set_cover_tilt_position)",
    domain: 'cover',
    service: 'set_cover_tilt_position',
    params: [
      {
        argName: 'tiltPosition',
        key: 'tilt_position',
        zod: z.number().int().min(0).max(100),
      },
    ],
  },

  // --- media_player ---
  {
    toolName: 'ha_media_player_play',
    description:
      'Resume/start playback (Home Assistant: media_player.media_play)',
    domain: 'media_player',
    service: 'media_play',
    params: [],
  },
  {
    toolName: 'ha_media_player_pause',
    description: 'Pause playback (Home Assistant: media_player.media_pause)',
    domain: 'media_player',
    service: 'media_pause',
    params: [],
  },
  {
    toolName: 'ha_media_player_stop',
    description: 'Stop playback (Home Assistant: media_player.media_stop)',
    domain: 'media_player',
    service: 'media_stop',
    params: [],
  },
  {
    toolName: 'ha_media_player_next_track',
    description:
      'Skip to the next track (Home Assistant: media_player.media_next_track)',
    domain: 'media_player',
    service: 'media_next_track',
    params: [],
  },
  {
    toolName: 'ha_media_player_previous_track',
    description:
      'Go back to the previous track (Home Assistant: media_player.media_previous_track)',
    domain: 'media_player',
    service: 'media_previous_track',
    params: [],
  },
  {
    toolName: 'ha_media_player_set_volume',
    description:
      'Set playback volume, 0 (mute) to 1 (max) (Home Assistant: media_player.volume_set)',
    domain: 'media_player',
    service: 'volume_set',
    params: [
      {
        argName: 'volumeLevel',
        key: 'volume_level',
        zod: z.number().min(0).max(1),
      },
    ],
  },
  {
    toolName: 'ha_media_player_mute',
    description:
      'Mute or unmute playback (Home Assistant: media_player.volume_mute)',
    domain: 'media_player',
    service: 'volume_mute',
    params: [{ argName: 'isMuted', key: 'is_volume_muted', zod: z.boolean() }],
  },
  {
    toolName: 'ha_media_player_select_source',
    description:
      'Switch a media player to a given input/source, e.g. "HDMI 1" or a favorite playlist name (Home Assistant: media_player.select_source)',
    domain: 'media_player',
    service: 'select_source',
    params: [{ argName: 'source', zod: z.string() }],
  },
];

function buildInputSchema(def: ServiceToolDef): z.ZodRawShape {
  return def.params.reduce<z.ZodRawShape>(
    (shape, param) => ({ ...shape, [param.argName]: param.zod }),
    { entityId: z.string() },
  );
}

function buildServiceData(
  def: ServiceToolDef,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const serviceData: Record<string, unknown> = {
    entity_id: input.entityId,
  };
  for (const param of def.params) {
    const value = input[param.argName];
    if (value !== undefined) {
      serviceData[param.key ?? param.argName] = value;
    }
  }
  return serviceData;
}

/** Registers one tool per ServiceToolDef, scoped to one authenticated user. */
export function registerHomeAssistantDomainTools(
  server: McpServer,
  gateway: HomeAssistantDataGateway,
  userId: string,
): void {
  const run = makeHomeAssistantRunner(gateway, userId);

  for (const def of SERVICE_TOOL_DEFS) {
    server.registerTool(
      def.toolName,
      {
        description: def.description,
        inputSchema: z.object(buildInputSchema(def)),
      },
      (input: Record<string, unknown>) =>
        run((connector, credentials) =>
          connector.request(
            credentials,
            'POST',
            `/api/services/${def.domain}/${def.service}`,
            { jsonBody: buildServiceData(def, input) },
          ),
        ),
    );
  }
}
