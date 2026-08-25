# Connecting to Claude

Each MCP API key you generate (see [`getting-started.md`](./getting-started.md)) gives you up to
five URLs, one per service — each is a standalone MCP server endpoint.

## Add a custom connector

In Claude (claude.ai or the Claude apps): **Settings → Connectors → Add custom connector**, then
paste one of the URLs. Repeat per service — Garmin, Home Assistant, YouTube, personal health, and
logs are added as separate connectors, since MCP connectors are one server per URL.

The API key lives in the URL itself (there's no separate auth step to configure) — this is
intentional: Claude's custom-connector UI on mobile/desktop only accepts a plain URL, with no way
to attach a bearer token or header, so the key travels in the path instead.

## Keeping keys safe

- Each URL is shown exactly once, right after you generate the key — copy it somewhere safe
  immediately (a password manager, not a chat message or a shared doc).
- If a URL leaks, revoke the key from the **API Keys** page — this immediately invalidates all of
  its URLs, and issue a new one.
- One key's URLs all resolve to the same underlying account — there's no way to scope a single
  key to only one service, but you don't have to add every connector if you don't need them all.

## What Claude can do with each connector

- **Garmin** — read activities, health metrics (sleep, HRV, stress, body battery, training
  readiness, etc.), body composition, gear; log activities, weigh-ins, hydration; manage workouts
  and schedules — roughly full parity with what the Garmin Connect app itself exposes.
- **Home Assistant** — read entity states and history; control lights, switches, climate, covers,
  and media players; call arbitrary Home Assistant services for anything not covered by a
  dedicated tool.
- **YouTube** — manage videos, playlists, comments; read channel/analytics data; upload videos.
- **Personal health** — read Apple Health data synced to `health.sloboda.fr` (metrics, workouts,
  symptoms, ECG, heart-rate notifications, state-of-mind, cycle tracking, medications).
- **Logs** — browse and grep Docker container logs shipped to a shared MinIO bucket by Vector
  (see the `home-monitoring` repo), for debugging what a container did without SSHing in.

If a tool call fails with an authentication/connection error, the underlying service credential
probably needs to be reconnected — check its status on the **Credentials** page.
