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

- Node.js >= 26 (see `.nvmrc`)
- Python >= 3.11 for `garmin-connector`
- A running `home-auth` instance (OAuth2 client registered for this app) for browser login
- Docker, for production deploys (`deploy/docker-compose.yml`)

## Local development

```bash
npm install                    # installs backend + frontend workspaces

cp backend/.env.example backend/.env          # fill in home-auth + secrets, see comments in the file
cp garmin-connector/.env.example garmin-connector/.env

npm run dev:backend            # http://localhost:3000 (API under /api, Swagger under /docs, development only)
npm run dev:frontend           # http://localhost:5173, proxies API calls to the backend

cd garmin-connector && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

`GARMIN_CONNECTOR_SECRET` must match between `backend/.env` and `garmin-connector/.env`.

## Build, test, lint

```bash
npm run build        # frontend, then backend (bundles frontend/dist into the backend build)
npm run test          # backend (vitest) then frontend (vitest)
npm run lint           # oxlint (type-aware)
npm run format          # oxfmt --write, repo-wide
npm run format:check
npm run typecheck
```

Husky hooks (`pre-commit`, `pre-push`, `commit-msg`) run lint-staged and commitlint
([Conventional Commits](https://www.conventionalcommits.org/)) automatically.

## Feature flags (home-features)

Le service lit des flags booléens dans [home-features](https://features.sloboda.fr) via OFREP
(`@openfeature/server-sdk` + `@openfeature/ofrep-provider`), derrière le port
`FeatureFlags.isEnabled(key, codeDefault)` (`backend/src/domain/shared/feature-flags.ts`). L'adaptateur
(`backend/src/infrastructure/feature-flags/`) ne contient rien de propre à ce service : les autres
services home-* le recopient tel quel.

- **Configuration** : `FEATURES_OFREP_URL` (base `https://features.sloboda.fr/api`, https obligatoire
  en production) et `FEATURES_API_KEY` (clé serveur liée à l'app et à l'environnement, format
  `hf_` + 64 hex). Absentes : tous les flags valent le défaut du code (warning unique) ; invalides :
  idem, avec une erreur au démarrage. Le démarrage n'attend jamais home-features.
- **Évaluation** : délai de 500 ms par requête ; résultat mémorisé 30 s par clé. Valeur définie pour
  l'environnement → cette valeur ; pas de valeur (`DISABLED`) ou flag inconnu (`FLAG_NOT_FOUND`) →
  défaut du code ; autre erreur (réseau, délai, 401, 429, 5xx) → dernière valeur connue, sinon défaut
  du code, mémorisé 30 s aussi, avec un warn au plus toutes les 5 min par flag et code d'erreur
  (le message du provider distingue une clé refusée, `unauthorized`, d'une panne). Un 429 suspend
  toutes les évaluations jusqu'au `Retry-After`. La dernière valeur connue est propre au processus :
  perdue au redémarrage.
- **Pin d'urgence** : `FEATURES_PIN_<CLE_EN_MAJ_SNAKE>=true|false` (ex.
  `FEATURES_PIN_AUTH_VERIFY_TOKEN_CLAIMS=false`) l'emporte sur tout, y compris sans
  home-features. Toute autre valeur est ignorée (erreur loguée). Nécessite un redémarrage du conteneur.
  Tout caractère hors `[A-Za-z0-9]` devient `_` (`a-b` et `a.b` partagent donc le même pin).
- `OFREP_ENDPOINT`, `OFREP_HEADERS` et `OFREP_TIMEOUT_MS`, que le provider lirait sinon, sont ignorés
  et retirés de l'environnement au démarrage (warn).

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

Optional telemetry variables (backend, harness convention `ops-telemetry`):

| Variable          | Default                    | Role                                                                                         |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `POSTHOG_API_KEY` | unset (telemetry disabled) | PostHog project key (1Password `POSTHOG_API_KEY`, passed by `deploy-vps.yml`). Unset = NOOP. |
| `POSTHOG_HOST`    | `https://eu.i.posthog.com` | PostHog ingestion host.                                                                      |

Two anonymous events leave the service: `runtime_health` (event-loop lag, ELU, memory, every 60 s)
and `http_request` (route template, method, status, duration). No user id, IP, API key, query,
header or MCP body is ever read. `/healthz` is not reported.
