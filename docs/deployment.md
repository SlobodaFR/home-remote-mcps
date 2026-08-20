# Deployment

Production runs as two Docker containers behind a reverse proxy, orchestrated by
`deploy/docker-compose.yml`.

## Images

- `home-remote-mcps` (root `Dockerfile`) — multi-stage build: frontend build → backend build
  (bundles the frontend's `dist` into the backend image and compiles it) → runtime image with
  Node 20, the compiled backend, and [Litestream](https://litestream.io) for SQLite replication.
- `garmin-connector` (`garmin-connector/Dockerfile`) — the FastAPI sidecar, built separately.

## Running

```bash
cd deploy
# .env               -> backend config (same keys as backend/.env.example)
# garmin-connector.env -> sidecar config (same keys as garmin-connector/.env.example)
docker compose up -d
```

- `home-remote-mcps` is published on `127.0.0.1:3006` only — put a reverse proxy (`deploy/Caddyfile`
  has a working example) in front for TLS and public exposure.
- `garmin-connector` has **no published port** — it's reachable only from `home-remote-mcps` over
  the compose-internal network, at `http://garmin-connector:8000`. Do not expose it publicly; it
  has no per-user auth, only the shared internal secret.
- Both containers resolve DNS via `1.1.1.1`/`8.8.8.8` explicitly (set in the compose file) rather
  than relying on the host's resolver.

## Data & backups

The SQLite database lives on the `home-remote-mcps-data` named volume
(`/app/backend/data/home-remote-mcps.sqlite` inside the container). If `MINIO_BUCKET` is set in
`.env`, the container:

- restores the database from the MinIO replica on startup, if the local file doesn't already exist
- continuously replicates local writes to that same MinIO bucket via Litestream

Without `MINIO_BUCKET` set, there is no backup — the volume is the only copy.

**`CREDENTIALS_ENCRYPTION_KEY` is not itself backed up by Litestream** — it's an env var, not
data in the database. Back it up separately (e.g. in your secrets manager); losing it makes every
row in the `credentials` table permanently undecryptable, even if the database file itself is
intact.

## Updating

Pull/build new images for both services, then:

```bash
docker compose up -d
```

Compose recreates only the containers whose image or config changed. Litestream keeps replicating
across the restart as long as the volume is preserved.

## Health checks

- `home-remote-mcps`: `GET /api/docs` (Swagger UI) or any authenticated `/api/...` route confirms
  the backend is up.
- `garmin-connector`: `GET /health` returns `{"status": "ok"}` — reachable only from inside the
  compose network (e.g. `docker compose exec home-remote-mcps curl http://garmin-connector:8000/health`).
