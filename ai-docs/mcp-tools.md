# MCP tool catalogues

Where each integration's tools are defined, and how they're generated/structured. Read
`ai-docs/architecture.md` first for the request lifecycle these tools run inside of.

## Garmin (`backend/src/interfaces/mcp/garmin-tools.ts`, ~1069 lines, ~130 tools)

Declarative table: `TOOL_DEFS: ToolDef[]`, one entry per allowlisted `garminconnect.Garmin`
method — `{ method, description, params: [{ name, zod }] }`. `registerGarminTools` iterates the
table and calls `server.registerTool(...)` for each, wiring params to a Zod input schema and the
handler to `gateway.call(userId, method, params)`.

- Must stay in sync with the Python-side allowlist in `garmin-connector/app/data.py` — adding a
  Garmin tool means adding it in **both** places.
  - The garmin-connector's `Depends(require_internal_secret)` fastapi guard checks (`app/security.py`) sits in front of `/call`;
    the allowlist itself is enforced in `data.py`'s dispatch, not by the guard.
- Descriptions are hand-tuned for common methods, auto-derived (accurate but plainer) for the
  long tail.
- Params typed loosely (`z.unknown()`/JSON-ish) for activity/workout payloads are intentional —
  Claude fills them from the corresponding Garmin Connect JSON shape rather than the schema
  enumerating every field.
- One extra tool wraps `GarminConnector.connectApi` directly (`garmin_connectapi` — raw REST
  passthrough) for endpoints with no high-level `garminconnect` method (mostly nutrition/food
  logging).

## Home Assistant (`home-assistant-tools.ts` + `home-assistant-domain-tools.ts`, ~252 lines)

Generic-first, not generated: HA's REST API is small and uniform (unlike Garmin), so:

- `home-assistant-tools.ts` — a handful of generic tools (`ha_list_entities`, `ha_get_states`,
  `ha_get_history`, `ha_call_service`, ...) plus `ha_request` (raw `{method, path, jsonBody,
queryParams}` passthrough, mirrors `garmin_connectapi`).
- `home-assistant-domain-tools.ts` — thin, hand-written convenience wrappers for the common
  domains (lights, switches, climate, covers, media players) that just call `ha_call_service`
  under the hood with the right `domain`/`service`.
- `home-assistant-tool-runtime.ts` — `makeHomeAssistantRunner(gateway, userId)` factors out the
  "load credentials, call gateway, handle `not connected`" boilerplate shared by every tool
  handler in both files.

## YouTube (`youtube-tools.ts`, ~277 lines, 22 actions)

Same dispatch-table shape as Garmin but hand-written (much smaller surface): one entry per
supported `action`, handler calls `gateway.call(userId, action, params)`. Covers video/playlist
CRUD, comments, channel/analytics reads, and `youtube_upload_video`.

## Adding or changing a tool

- Garmin: add/edit the `TOOL_DEFS` entry in `garmin-tools.ts` **and** the matching allowlist entry
  in `garmin-connector/app/data.py` (same method name) — the two are not validated against each
  other at build time, so a mismatch fails at call time, not compile time.
- Home Assistant: add a generic tool in `home-assistant-tools.ts` if it's a new primitive, or a
  domain wrapper in `home-assistant-domain-tools.ts` if it's sugar over `ha_call_service`.
- YouTube: add an action to the dispatch table in `youtube-tools.ts` and the corresponding case in
  `HttpYoutubeConnector.call` (`infrastructure/youtube/http-youtube-connector.ts`).
- In all three cases, the tool handler itself should stay a thin translation — real logic belongs
  in the gateway/connector, not the tool file.
