# Architecture reference

Deep-dive companion to `CLAUDE.md`. Read that first for the summary; this is for when you need
exact file paths and data flow.

## Services

| Service            | Tech                                | Exposure                                                                     |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| `backend`          | NestJS, TypeORM + better-sqlite3    | Public (`PORT`, default 3000), serves SPA too                                |
| `frontend`         | React + Vite + Tailwind             | Built into `frontend/dist`, served by backend in prod                        |
| `garmin-connector` | FastAPI + uvicorn + `garminconnect` | Internal only, `GARMIN_CONNECTOR_URL` (compose DNS: `garmin-connector:8000`) |

## Backend layer map (`backend/src/`)

```
domain/<area>/           abstract classes = ports, plain entities. No framework imports.
  api-key/                ApiKey entity + ApiKeyRepository port
  auth/                    AccessTokenPayload, AccessTokenVerifier, OAuthClient, RevokedSessionRepository ports
  credential/              Credential entity (states: pending/validated/failed) + CredentialRepository port
  garmin/                  GarminConnector port
  home-assistant/          HomeAssistantConnector port
  logs/                    LogsConnector port (MinIO/Vector Docker logs)
  personal-health/         PersonalHealthConnector port
  youtube/                 YoutubeConnector port
  shared/                  CredentialCrypto port, hash helper
  user/                    User entity + UserRepository port

application/<area>/       use cases (one class, one execute()). Business logic lives here.
  api-keys/                create / list / revoke
  auth/                    handle-oauth-callback, handle-session-revoked
  credentials/             start-garmin-login, submit-garmin-mfa, save-home-assistant-connection,
                            save-logs-connection, save-personal-health-connection,
                            start-youtube-connection, complete-youtube-connection, list, delete
  mcp/                     GarminDataGateway, HomeAssistantDataGateway, LogsDataGateway,
                            PersonalHealthDataGateway, YoutubeDataGateway,
                            ResolveUserFromApiKeyUseCase

infrastructure/<area>/    adapters implementing the domain ports
  auth/                    HttpOAuthClient, JwksAccessTokenVerifier
  crypto/                  AesGcmCredentialCrypto
  garmin/                  HttpGarminConnector (calls the Python sidecar)
  home-assistant/          HttpHomeAssistantConnector (calls the user's HAOS instance directly)
  logs/                    MinioLogsConnector (`minio` client against the shared home-lab bucket)
  personal-health/         HttpPersonalHealthConnector (calls health.sloboda.fr directly)
  youtube/                 HttpYoutubeConnector (calls Google OAuth2 + YouTube Data/Analytics APIs)
  persistence/             database.module.ts, entities/*.orm-entity.ts, repositories/typeorm-*.ts
  shared.module.ts          DI wiring shared across features (crypto, auth verifier, etc.)

interfaces/http/          browser-facing REST API
  controllers/              auth, credentials, api-keys
  guards/                    JwtAuthGuard (global, APP_GUARD), ApiKeyGuard (per MCP controller)
  decorators/                @CurrentUser(), @Public()
  dto/, presenters/          request/response shapes

interfaces/mcp/           one controller + one register*Tools(...) per integration
  garmin-mcp.{controller,module}.ts, garmin-tools.ts        (~130 tools, ~1069 lines)
  home-assistant-mcp.{controller,module}.ts,
    home-assistant-tools.ts, home-assistant-domain-tools.ts, home-assistant-tool-runtime.ts
  logs-mcp.{controller,module}.ts, logs-tools.ts, logs-tool-runtime.ts   (5 tools)
  personal-health-mcp.{controller,module}.ts, personal-health-tools.ts, personal-health-tool-runtime.ts
  youtube-mcp.{controller,module}.ts, youtube-tools.ts       (22 actions, ~277 lines)
```

## MCP request lifecycle (concrete, Garmin example)

1. Claude (or any MCP client) POSTs to `/api/mcp/garmin/:apiKey`.
2. `GarminMcpController` is `@Public()` (skips the global `JwtAuthGuard`) but has
   `@UseGuards(ApiKeyGuard)`.
3. `ApiKeyGuard.canActivate` reads `request.params.apiKey`, calls
   `ResolveUserFromApiKeyUseCase.execute(rawKey)` → looks up `ApiKeyRepository` by hash, sets
   `request.mcpUserId`.
4. Controller builds `new McpServer(...)`, calls
   `registerGarminTools(server, garminDataGateway, req.mcpUserId)` (registers ~130 tool handlers
   closing over `userId`), connects a fresh `NodeStreamableHTTPServerTransport`
   (`sessionIdGenerator: undefined` — stateless, one transport per HTTP request), then
   `transport.handleRequest(req, res, req.body)`.
5. Inside a tool handler, `GarminDataGateway` (application/mcp/garmin-data-gateway.ts):
   - loads the user's `Credential` row for service `garmin` via `CredentialRepository`
   - decrypts `encryptedTokens` via `CredentialCrypto`
   - calls `GarminConnector.call(tokensJson, method, params)` (domain port)
   - `HttpGarminConnector` (infra) POSTs to the sidecar's `/call` with header
     `X-Internal-Secret: GARMIN_CONNECTOR_SECRET`
   - sidecar's `data.call_method` dispatches to the matching method on a rehydrated
     `garminconnect.Garmin` client
   - if the sidecar's response includes rotated tokens, the gateway re-encrypts and
     `credentialRepository.save(...)`s them before returning the tool result

Home Assistant, YouTube, personal-health, and logs gateways follow the identical shape, swapping
the connector and what "call" means (HA: `request(method, path, ...)` REST passthrough; YouTube:
`call(action, params)` dispatch table in `youtube-tools.ts`; personal-health:
`request(path, queryParams)` REST passthrough scoped under the user's API key; logs:
`listPrefixes`/`listObjects`/`readObjectLines` object-storage primitives against the shared MinIO
bucket).

## Credential connection flows (per integration, differs by upstream auth model)

- **Garmin** — `StartGarminLoginUseCase.execute(userId, email, password)`: live login attempt
  against the sidecar. Nothing is persisted unless it succeeds or needs MFA (MFA-pending state
  lives in the sidecar's in-memory `_pending` dict, keyed by `pendingId`, TTL 10 min — the process
  must stay up between the two requests). `SubmitGarminMfaUseCase` completes it. Raw password
  never touches the DB — only the resulting `tokensJson` (encrypted).
- **Home Assistant** — `SaveHomeAssistantConnectionUseCase.execute(userId, baseUrl, token)`:
  single-step, tests the long-lived token against the live instance before persisting (mirrors
  Garmin's "only persist on success", no MFA dance to justify a pending state).
- **YouTube** — two-step OAuth2, split across an authenticated and an unauthenticated request:
  1. `StartYoutubeConnectionUseCase` (authenticated, browser session) stores the user's own Google
     Cloud OAuth client id/secret encrypted on a `pending` `Credential` row and returns Google's
     consent `authorizeUrl`, with `state` = the pending credential's id.
  2. `CompleteYoutubeConnectionUseCase` (public, unauthenticated — Google calls this back, no
     session cookie available) reads `state` back to find the pending credential, exchanges the
     `code` for tokens, and marks it validated.
- **Personal health** — `SavePersonalHealthConnectionUseCase.execute(userId, apiKey)`:
  single-step, tests the `health.sloboda.fr` API key before persisting (mirrors Home Assistant;
  fixed base URL instead of a user-supplied one).
- **Logs** — `SaveLogsConnectionUseCase.execute(userId, basePath)`: single-step, tests that the
  MinIO prefix is listable before persisting. Unlike every other flow, no secret is collected here
  — the bucket endpoint/credentials are shared infra config (`MINIO_*` env vars); `basePath` is
  the only per-user value, and it isn't sensitive.

All converge on the same `Credential` entity (`domain/credential/credential.ts`) with states
driven by `markPending` / `markValidated` / `markFailed`.

## Auth model detail

- Global guard: `JwtAuthGuard` registered as `APP_GUARD` in `interfaces/http/modules/auth.module.ts`
  — applies to every route by default. `@Public()` (a metadata decorator read by the guard) opts a
  route out; used by `AuthController`'s own endpoints and by all `interfaces/mcp/*` controllers
  (which use `ApiKeyGuard` instead).
- `JwtAuthGuard` verifies the access-token cookie via `JwksAccessTokenVerifier`
  (`infrastructure/auth/jwks-access-token-verifier.ts`), fetching `home-auth`'s JWKS.
- `AuthController.disconnect` (`POST /api/auth/disconnect?secret=...`) is `@Public()` but checks
  a shared secret (`AUTH_WEBHOOK_SECRET`) manually — this is `home-auth`'s logout webhook
  (`logoutWebhookUrl`), calling `HandleSessionRevokedUseCase` to record a `RevokedSession` so
  already-issued tokens for that user stop verifying.
- MCP API keys are a fully separate mechanism (`ApiKeyGuard` + `ApiKeyRepository`, hashed at rest
  via `domain/shared/hash.ts`) — a revoked browser session does not touch API keys and vice versa.

## Persistence

TypeORM entities: `ApiKeyOrmEntity`, `CredentialOrmEntity`, `RevokedSessionOrmEntity`,
`UserOrmEntity` (`infrastructure/persistence/entities/`). SQLite file at `DATABASE_PATH`
(container default `/app/backend/data/home-remote-mcps.sqlite`). In production, `litestream`
(installed in the runtime image, config `backend/litestream.yml`, driven by
`backend/docker-entrypoint.sh`) continuously replicates that file to a MinIO bucket and restores
from it on cold start if the local file is missing.

## Adding a new MCP integration — checklist

1. `domain/<service>/<service>-connector.ts` — abstract class port + any value types.
2. `infrastructure/<service>/http-<service>-connector.ts` — concrete adapter.
3. `application/credentials/*-<service>-connection.use-case.ts` — however that service's auth
   flow works (single-step token test, multi-step login, OAuth2 — pick the closest existing
   example above).
4. `application/mcp/<service>-data-gateway.ts` — loads credential, decrypts, calls connector,
   persists any rotated tokens.
5. `interfaces/mcp/<service>-tools.ts` — `register<Service>Tools(server, gateway, userId)`.
6. `interfaces/mcp/<service>-mcp.{controller,module}.ts` — copy `garmin-mcp.*` almost verbatim.
7. Register the new module in `app.module.ts`; add a route/section to `CredentialsPage.tsx` in
   the frontend if it needs manual setup (base URL, OAuth client, etc.).
