# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the repo owner, acting as their own admin and end user of a personal remote MCP
gateway. They connect their own upstream accounts (Garmin Connect, Home Assistant, YouTube) and
issue per-service API keys so MCP clients (Claude, or any MCP-compatible client) can reach those
accounts remotely.

Solo today; the underlying auth model is already per-user (browser session via `home-auth` SSO,
independent per-user API keys), so this may extend to a few trusted people later. Design should
not assume it stays single-user forever, but should not invent multi-user features (teams, roles,
sharing) that were not asked for.

## Product Purpose

`home-remote-mcps`: a personal remote MCP gateway. A NestJS backend exposes Model Context Protocol
(Streamable HTTP) servers for Garmin Connect, Home Assistant, and YouTube so an MCP client can call
them from anywhere. This frontend is the control surface for that gateway: connect/manage stored
credentials for each upstream service, and issue/revoke the per-user API keys that MCP clients use
to authenticate (the key travels in the connector URL, not a header, because Claude's remote-
connector UI only accepts a bare URL).

Success = the user can, in a couple of minutes, connect a new service or mint a fresh API key and
paste it into an MCP client, with clear feedback when a connection is broken (expired token, wrong
credentials, MFA pending) so they know to come fix it before the failure shows up as a confusing
tool error inside Claude.

## Positioning

Not a product competing for users: personal infrastructure. Its distinguishing mechanism is that it
is the _credential and key custodian_ sitting in front of upstream APIs that don't otherwise offer
a clean way to be reached by an MCP client (Garmin has no official REST API or maintained Node
client; the backend proxies to a Python sidecar wrapping the unofficial `garminconnect` library).
Encrypted-at-rest storage (AES-GCM) and a bare-URL-embedded API key are the two facts that shape
every screen: the UI must make it obvious what is stored, what a key is for, and that a shown key
or URL will never be shown again.

## Operating Context

- Used in short, infrequent sessions: connect a service once, mint a key once, then rarely return
  except to check status, rotate a broken credential, or revoke a key.
- Accessed from both desktop and mobile browsers (mobile-first responsive is an explicit, current
  requirement, not aspirational).
- Sits behind two independent auth layers: browser session via `home-auth` OAuth2 SSO (cookies,
  JWKS-verified) for the UI itself, and separate per-service API keys for MCP clients. The UI only
  deals with the former; the latter it only creates/lists/revokes.
- Three connectable services today, each with a different connection shape: Garmin (email +
  password, with a possible MFA step), Home Assistant (base URL + long-lived token), YouTube
  (Google OAuth client id/secret, then a redirect through Google's consent screen back to this
  app). Any future service will likely add a fourth shape rather than fitting the existing three.
- UI copy is in French.

## Capabilities and Constraints

- Confirmed functionality: connect/update/delete a Garmin credential (incl. MFA step); connect/
  update Home Assistant (base URL + long-lived token); connect YouTube via Google OAuth and surface
  the redirect result; list connected services with status (`ok` / `failed` / `pending_mfa`), last
  error, and last-tested time; create/list/revoke API keys, each producing three service-specific
  MCP URLs (Garmin, Home Assistant, YouTube) shown exactly once.
- A shown API key URL or newly-connected credential's secret material is never retrievable again
  after the initial reveal - the UI must not imply it can be recovered later.
- No native mobile app and no plan for one; "mobile" means the responsive web app in a mobile
  browser.
- Undecided: whether/when a second or third trusted user actually gets onboarded, and what (if
  anything) changes about the UI when that happens (e.g. per-user scoping is already server-side,
  but nothing in the UI currently signals "whose credential is this" because there has only ever
  been one).

## Brand Commitments

Binding, not a placeholder - the identity below was deliberately extended (dark-mode tokens added,
mobile-first responsive header fixed) rather than replaced, and future work should keep doing that
unless the user explicitly asks for a redesign:

- Name / wordmark: "Home Remote MCPs" (header brand mark, uppercase, tracking-tight) and "Home
  MCPs" (login page hero headline) - both in use, not a typo to reconcile.
- Type system: Anton (display/headlines) + Inter (body/UI text).
- Palette: neutral-first token system - `ink` (near-black text) / `canvas` (elevated
  surface: cards, header) / `soft-cloud` (page background + input fill, same elevation family as
  canvas but one step recessed) / `mute`, `stone`, `hairline` (borders) - plus semantic `success`
  (green) / `error` (red) / `warning` (amber). No accent/brand color beyond the neutral system
  today.
- Shape: `rounded-full` on interactive controls (buttons, pills), sharp/hairline-bordered
  rectangular cards elsewhere - the two-radius system is intentional, not inconsistent.
- Dark mode: system-preference-driven (`prefers-color-scheme`, no manual toggle), same neutral
  token family inverted (off-black/off-white, never pure), already implemented via CSS custom
  properties in `src/index.css`.

## Evidence on Hand

None - no testimonials, case studies, press, or marketing copy exist or are needed; this is
personal infrastructure, not something being sold or demoed to strangers. Future work must not
fabricate any of that.

## Product Principles

1. Credential custody is the core trust surface - every screen involving a secret (password,
   token, client secret, API key) must be legible about what's stored, what's shown once, and what
   happens on failure. Never soften or hide a broken-connection state.
2. Mobile-first, not mobile-tolerated - the primary control surface must work as a first-class
   experience on a phone, not degrade gracefully from a desktop-first layout.
3. Solo-app economy of motion - this is visited rarely and briefly; optimize for "get in, fix or
   create the one thing, get out" over discoverability or feature depth.
4. Extend the existing identity, don't reinvent it - the neutral Anton/Inter/ink-canvas-soft-cloud
   system is a binding commitment; new work should feel like the same app, not a rebrand.
5. Each upstream service gets an honest, service-shaped connection flow - don't force Garmin,
   Home Assistant, and YouTube's genuinely different auth mechanics into one generic "connect"
   pattern just for visual consistency.

## Accessibility & Inclusion

None known beyond standard web accessibility hygiene (contrast, focus visibility, keyboard
navigation) - no specific requirement has been established for this user or any future one.
