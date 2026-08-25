# Getting started

This guide walks through running the app locally and connecting your first service.

## 1. Prerequisites

- Node.js 20+ (`.nvmrc` pins the version — `nvm use` if you have nvm)
- Python 3.11+ (for the Garmin sidecar)
- Access to a running `home-auth` instance with an OAuth2 client registered for this app
  (redirect URI: `<FRONTEND_URL>/api/auth/callback`)

## 2. Configure

```bash
cp backend/.env.example backend/.env
cp garmin-connector/.env.example garmin-connector/.env
```

Open `backend/.env` and fill in every value marked "Requis" in the comments: your `home-auth`
client id/secret, a webhook secret, the public URL this instance runs at, an encryption key for
stored credentials, and a shared secret for the Garmin sidecar. **Pick
`CREDENTIALS_ENCRYPTION_KEY` carefully and keep it backed up** — if you lose it, every stored
credential (Garmin, Home Assistant, YouTube, personal health, logs) becomes permanently unusable
and every user has to reconnect.

Set `GARMIN_CONNECTOR_SECRET` to the same value in both `.env` files.

## 3. Run it

```bash
npm install

npm run dev:backend      # http://localhost:3000
npm run dev:frontend     # http://localhost:5173

# separate terminal, separate Python environment:
cd garmin-connector
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open the frontend URL, log in through `home-auth`, and you land on the app.

## 4. Connect a service

From the **Credentials** page:

- **Garmin Connect** — enter your Garmin email/password. If Garmin asks for a verification code
  (MFA), you'll be prompted for it on the same page. Your password is never stored — only the
  session tokens Garmin returns after a successful login.
- **Home Assistant** — enter your instance's base URL (e.g. your DuckDNS/Nabu Casa address) and a
  long-lived access token, generated in Home Assistant under _Profile → Security → Long-Lived
  Access Tokens_.
- **YouTube** — create your own OAuth 2.0 client ("Web application" type) in the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials), enable the
  **YouTube Data API v3** and **YouTube Analytics API**, and add the callback URL shown on the
  page as an authorized redirect URI. Then paste the Client ID/Secret and continue through
  Google's consent screen. YouTube quota is tied to your own Google Cloud project, which is why
  this is the one service where you bring your own OAuth client instead of a shared one.
- **Personal health** — enter an API key issued by `health.sloboda.fr` (from your account on that
  service, API keys section) to link your Apple Health data.
- **Logs** — enter the base path (prefix) inside the shared MinIO bucket where Vector deposits
  Docker logs, e.g. `logs/` (see the `home-monitoring` repo). No credentials to enter here — the
  bucket itself is already configured server-side via `MINIO_*`; hosts and dates are discovered
  automatically.

Each connection attempt is tested live before anything is saved — you'll see an error immediately
if credentials are wrong, rather than a silent failure later.

## 5. Generate an MCP API key

From the **API Keys** page, give the key a label (e.g. "Claude mobile") and generate it. You'll be
shown up to five URLs — one per service (Garmin, Home Assistant, YouTube, personal health, logs)
— **shown only once**. Copy the ones you need now.

See [`connecting-claude.md`](./connecting-claude.md) for how to add these URLs as custom
connectors in Claude.

Revoking a key immediately invalidates all of its URLs.
