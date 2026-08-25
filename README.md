# home-remote-mcps

Personal remote MCP gateway. Exposes Garmin Connect, Home Assistant, YouTube, personal health
data, and Docker container logs (shipped to MinIO by Vector) as [Model Context
Protocol](https://modelcontextprotocol.io) servers reachable over HTTP, so Claude (or any MCP
client) can query and control them from anywhere — no local server, no local credentials.

Authentication for the web UI is delegated to an external SSO (`home-auth`, OAuth2). MCP clients
authenticate separately with a per-user API key issued from that UI.

## Why a sidecar for Garmin

Garmin Connect has no official public API and no actively maintained Node client. The
`garmin-connector` service is a small internal-only Python sidecar wrapping the
[`garminconnect`](https://pypi.org/project/garminconnect/) library, which handles Garmin's login
flow (including MFA) and token refresh. The NestJS backend talks to it over the Docker network
with a shared secret; it is never exposed publicly. Every other integration — Home Assistant,
YouTube, personal health, and logs — has a normal REST (or S3-compatible) API, so the backend
talks to them directly with no sidecar.

## Project layout

```
backend/            NestJS API — REST (auth, credentials, API keys) + MCP servers, DDD-ish layers
frontend/            React SPA — login, manage stored credentials, issue MCP API keys
garmin-connector/    FastAPI sidecar — Garmin Connect login/session via `garminconnect`
deploy/              docker-compose + Caddy config for production
```

See [`CLAUDE.md`](./CLAUDE.md) for the detailed architecture (layering, MCP request path,
per-integration connector design, auth model) and [`ai-docs/`](./ai-docs) for deeper reference
material. Human-oriented guides live in [`docs/`](./docs).

## Requirements

- Node.js >= 20 (see `.nvmrc`)
- Python >= 3.11 for `garmin-connector`
- A running `home-auth` instance (OAuth2 client registered for this app) for browser login
- Docker, for production deploys (`deploy/docker-compose.yml`)

## Local development

```bash
npm install                    # installs backend + frontend workspaces

cp backend/.env.example backend/.env          # fill in home-auth + secrets, see comments in the file
cp garmin-connector/.env.example garmin-connector/.env

npm run dev:backend            # http://localhost:3000 (API under /api, Swagger under /api/docs)
npm run dev:frontend           # http://localhost:5173, proxies API calls to the backend

cd garmin-connector && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

`GARMIN_CONNECTOR_SECRET` must match between `backend/.env` and `garmin-connector/.env`.

## Build, test, lint

```bash
npm run build        # frontend, then backend (bundles frontend/dist into the backend build)
npm run test          # backend (jest) then frontend (vitest)
npm run lint           # eslint on both workspaces
npm run format          # prettier --write, repo-wide
```

Husky hooks (`pre-commit`, `pre-push`, `commit-msg`) run lint-staged and commitlint
([Conventional Commits](https://www.conventionalcommits.org/)) automatically.

## Deployment

`Dockerfile` at the repo root multi-stage builds frontend → backend → a runtime image that bundles
[Litestream](https://litestream.io) for continuous SQLite replication to a MinIO (S3-compatible)
bucket, restoring on boot if `MINIO_BUCKET` is set. `garmin-connector/Dockerfile` builds the
sidecar image separately. `deploy/docker-compose.yml` runs both as sibling services on an internal
Docker network — the sidecar has no published port, reachable only from the backend at
`http://garmin-connector:8000`. `deploy/Caddyfile` is the reverse-proxy config for the public
service.

Required environment variables are documented inline in `backend/.env.example` and
`garmin-connector/.env.example`.
