# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`home-remote-mcps` — a personal remote MCP gateway. A NestJS backend exposes Model Context
Protocol (Streamable HTTP) servers for Garmin Connect, Home Assistant, and YouTube, so Claude
(or any MCP client) can call them from anywhere. Auth is delegated to an external SSO
(`home-auth`, OAuth2) for the web UI; MCP clients authenticate with a per-user API key embedded
in the URL. A separate Python sidecar (`garmin-connector`) owns the actual Garmin login/session
logic via the `garminconnect` library.

Three deployables:

- `backend/` — NestJS API + MCP servers + serves the built frontend as static SPA.
- `frontend/` — React SPA (login, manage stored credentials, issue API keys).
- `garmin-connector/` — internal-only FastAPI sidecar wrapping `garminconnect` (handles Garmin
  login/MFA/token refresh — no maintained Node equivalent exists).

## Commands

Run from repo root (npm workspaces cover `backend`/`frontend`; `garmin-connector` is a separate
Python project).

```bash
# Dev servers
npm run dev:backend          # nest start --watch (backend/)
npm run dev:frontend         # vite (frontend/)

# Build
npm run build                # frontend then backend (backend copies frontend/dist into itself)
npm run build:frontend
npm run build:backend

# Test
npm run test                 # backend then frontend
npm run test:backend         # jest, workspace=backend
npm run test:frontend        # vitest run, workspace=frontend
npm run test:backend -- --watch
npx jest <name-or-path-fragment> --workspace=backend   # single test, or: cd backend && npx jest <pattern>

# Lint / format
npm run lint                 # eslint on both workspaces
npm run format                # prettier --write . (repo-wide)
```

garmin-connector (Python, FastAPI + uvicorn, separate venv/deps — not part of the npm workspace):

```bash
cd garmin-connector
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docker: root `Dockerfile` multi-stage builds frontend → backend → runtime (bundles Litestream for
SQLite replication to MinIO). `garmin-connector/Dockerfile` builds the sidecar separately.
`deploy/docker-compose.yml` runs both as sibling services on an internal network (sidecar has no
published port — only reachable at `http://garmin-connector:8000` from the backend container).

## Architecture

### Layering (backend)

Hexagonal/DDD-flavored, one dir per layer under `backend/src/`:

- `domain/<area>/` — abstract classes as ports (e.g. `GarminConnector`, `HomeAssistantConnector`,
  `YoutubeConnector`, `CredentialCrypto`, repository interfaces) plus plain entities/value types.
  No framework imports here.
- `application/<area>/` — use cases (one class per action, `execute()` method) that orchestrate
  domain ports. This is where business logic lives.
- `infrastructure/<area>/` — adapters implementing the domain ports: TypeORM repositories, HTTP
  clients (`HttpGarminConnector`, `HttpHomeAssistantConnector`), AES-GCM crypto, JWKS token
  verification.
- `interfaces/http/` — REST controllers/DTOs/guards for the browser-facing API (auth, credential
  management, API key management).
- `interfaces/mcp/` — one controller + one `register*Tools` file per integration, exposing MCP
  tools over Streamable HTTP.

New integration = new folder in each of the four layers, wired into its own `*.module.ts`, added
to `app.module.ts`.

### MCP request path

Each MCP integration follows the same shape (see `garmin-mcp.module.ts` /
`garmin-mcp.controller.ts` as the reference):

1. Route is `POST /api/mcp/<service>/:apiKey` — the API key travels in the URL path, not an
   `Authorization` header, because Claude's remote-connector UI only accepts a URL with no way to
   attach a custom header.
2. `@Public()` on the controller bypasses the global `JwtAuthGuard` (browser session auth);
   `ApiKeyGuard` (service-specific, `@UseGuards`) resolves the API key to a user id instead via
   `ResolveUserFromApiKeyUseCase`.
3. Controller builds a fresh `McpServer` + `NodeStreamableHTTPServerTransport` per request
   (stateless — `sessionIdGenerator: undefined`), calls `register<Service>Tools(server, gateway,
  userId)`, then `transport.handleRequest(req, res, req.body)`.
4. The `*DataGateway` (application layer) loads the user's encrypted credential, decrypts it,
   calls the domain connector port, and — if the connector returned refreshed tokens — re-encrypts
   and persists them before returning.

If Claude's custom connectors ever require a real OAuth handshake instead of a bare key-in-URL,
only the guard + route need to change; gateways and tool handlers are untouched.

### Per-integration connector shape differs by upstream API

- **Garmin** (`domain/garmin/garmin-connector.ts`): no official REST API or maintained Node
  client. Backend proxies to the `garmin-connector` Python sidecar over an internal-secret-headed
  HTTP call. `call(method, params)` dispatches by name to ~130 allowlisted methods on the
  `garminconnect.Garmin` client (catalogue lives in `garmin-tools.ts`); `connectApi` is a raw
  passthrough for endpoints (mostly nutrition) with no high-level method. Tokens auto-refresh
  server-side inside `garminconnect` — every call can return `refreshedTokensJson` to persist.
- **Home Assistant** (`domain/home-assistant/home-assistant-connector.ts`): official uniform REST
  API secured by one long-lived bearer token — no sidecar, backend talks directly to the user's
  HAOS instance. `request(method, path, ...)` is the one primitive; `home-assistant-tools.ts` and
  `home-assistant-domain-tools.ts` translate it into specific REST calls.
- **YouTube** (`domain/youtube/youtube-connector.ts`): standard Google OAuth2 (each user brings
  their own Google Cloud OAuth client id/secret, registered via the Credentials page) — backend
  talks directly to YouTube Data API v3 / Analytics API v2, no client library. Access tokens are
  short-lived and refreshed ahead of expiry using the stored refresh token; `refreshedCredentialsJson`
  is persisted the same way as Garmin's rotated tokens.

### Auth model

Two independent auth mechanisms coexist:

- **Browser session**: OAuth2 against `home-auth` (external SSO) — `AuthController`
  (`/api/auth/login|callback|logout|me`), tokens set as cookies (`auth-cookies.ts`), verified by
  the global `JwtAuthGuard` (registered as `APP_GUARD` in `auth.module.ts`) via JWKS
  (`JwksAccessTokenVerifier`). `home-auth` calls back `POST /api/auth/disconnect?secret=...` (a
  shared-secret webhook, not JWT-guarded) on global logout to revoke sessions server-side.
- **MCP API keys**: per-user, per-request, checked by `ApiKeyGuard` on each `interfaces/mcp/*`
  controller — independent of the session cookie flow. Managed via `ApiKeysModule`
  (`interfaces/http/controllers/api-keys.controller.ts`).

Stored credentials (Garmin session tokens, HA long-lived token, YouTube OAuth tokens) are
encrypted at rest with `CredentialCrypto` (AES-GCM, `CREDENTIALS_ENCRYPTION_KEY`) — the backend
never stores or inspects raw upstream passwords, only post-login session material.

### Persistence

TypeORM + `better-sqlite3`, entities in `infrastructure/persistence/entities/`, repositories in
`infrastructure/persistence/repositories/` implementing the `domain/*/repository.ts` ports.
`DATABASE_PATH` env var (default under `backend/data/`). Production containers replicate the
SQLite file to MinIO via Litestream (`backend/litestream.yml`, `docker-entrypoint.sh`) — losing
`CREDENTIALS_ENCRYPTION_KEY` makes all stored credentials permanently unrecoverable.

### Frontend

Small React SPA (`frontend/src/presentation/`): `LoginPage` (kicks off `home-auth` OAuth),
`CredentialsPage` (connect/manage Garmin, HA, YouTube), `ApiKeysPage` (issue/revoke MCP API
keys). `AuthProvider` + `RequireAuth` gate routes on the session cookie; `infrastructure/api-client.ts`
is the one fetch wrapper. Built and served as static files by the NestJS backend in production
(`ServeStaticModule`, SPA fallback excluding `/api*`).

## Conventions

- Backend/frontend both lint via ESLint flat config + `typescript-eslint` strict, formatted with
  Prettier; `lint-staged` + Husky (`pre-commit`, `pre-push`, `commit-msg`) enforce both plus
  Conventional Commits (`commitlint.config.js`) on every commit.
- Domain ports are TypeScript `abstract class`es (not `interface`s) so they can be used as NestJS
  DI tokens directly (`{ provide: GarminConnector, useClass: HttpGarminConnector }`).
- Comments in this codebase are used specifically to explain _why_ a non-obvious constraint exists
  (protocol limitation, upstream quirk, security boundary) — match that when adding code.
