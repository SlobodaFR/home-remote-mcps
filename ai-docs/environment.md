# Environment variables

Reference for every config knob. Source of truth is `backend/.env.example` and
`garmin-connector/.env.example` (French comments there — kept in French since that's the existing
convention; this file is the English index).

## `backend/.env`

| Variable                                                                                                                 | Required | Purpose                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SERVICE_URL`                                                                                                       | yes      | Base URL of `home-auth` (external SSO)                                                                                                                                                                             |
| `AUTH_CLIENT_ID`                                                                                                         | yes      | OAuth2 client id registered on `home-auth` for this app                                                                                                                                                            |
| `AUTH_CLIENT_SECRET`                                                                                                     | yes      | OAuth2 client secret (confidential client)                                                                                                                                                                         |
| `AUTH_WEBHOOK_SECRET`                                                                                                    | yes      | Shared secret checked on `POST /api/auth/disconnect?secret=...`, `home-auth`'s global-logout webhook (`logoutWebhookUrl`)                                                                                          |
| `FRONTEND_URL`                                                                                                           | yes      | Public URL of this service — used for the OAuth `redirect_uri`, CORS origin, and post-login redirect                                                                                                               |
| `PUBLIC_BASE_URL`                                                                                                        | yes      | Public URL used when building MCP connector links shown to the user                                                                                                                                                |
| `CREDENTIALS_ENCRYPTION_KEY`                                                                                             | yes      | AES-GCM key (>= 32 random chars) encrypting all stored credentials at rest. **Losing this key permanently loses every stored credential** — no recovery path                                                       |
| `GARMIN_CONNECTOR_URL`                                                                                                   | yes      | Internal URL of the `garmin-connector` sidecar (compose DNS: `http://garmin-connector:8000`)                                                                                                                       |
| `GARMIN_CONNECTOR_SECRET`                                                                                                | yes      | Shared secret sent as `X-Internal-Secret` to the sidecar — must match the sidecar's own `GARMIN_CONNECTOR_SECRET`                                                                                                  |
| `DATABASE_PATH`                                                                                                          | no       | SQLite file path (container default `/app/backend/data/home-remote-mcps.sqlite`)                                                                                                                                   |
| `NODE_ENV`                                                                                                               | no       | `development` / `production`                                                                                                                                                                                       |
| `PORT`                                                                                                                   | no       | Default `3000`                                                                                                                                                                                                     |
| `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_REPLICA_PATH`, `MINIO_REGION`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY` | no       | Litestream continuous replication target. If `MINIO_BUCKET` is set, `docker-entrypoint.sh` restores the DB on boot (if missing) and replicates continuously; otherwise the SQLite file is purely local (no backup) |

## `garmin-connector/.env`

| Variable                  | Required | Purpose                                                                                                                                                  |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GARMIN_CONNECTOR_SECRET` | yes      | Must equal the backend's `GARMIN_CONNECTOR_SECRET` — checked by `app/security.py`'s `require_internal_secret` dependency on every route except `/health` |

## Notes

- No env var carries a Garmin/HA/YouTube _user's_ raw password or long-lived token — those are
  supplied through the web UI at runtime and immediately encrypted with
  `CREDENTIALS_ENCRYPTION_KEY` before hitting the database. `.env` only holds this app's own
  service-to-service secrets.
- YouTube is the one exception where per-user secrets exist client-side of the encryption
  boundary too: each user supplies their **own** Google Cloud OAuth Client ID/Secret via the
  Credentials page (not a shared app-wide value in `.env`), because YouTube quota is per-Google-
  Cloud-project.
