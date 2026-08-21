---
name: Home Remote MCPs
description: Personal remote MCP gateway control surface - connect Garmin/Home Assistant/YouTube credentials and mint API keys for MCP clients
colors:
  ink: '#111111'
  ink-dark: '#f2f2f0'
  on-primary: '#ffffff'
  on-primary-dark: '#111111'
  canvas: '#ffffff'
  canvas-dark: '#1c1c1e'
  soft-cloud: '#f5f5f5'
  soft-cloud-dark: '#101012'
  charcoal: '#39393b'
  charcoal-dark: '#c7c7c9'
  mute: '#707072'
  mute-dark: '#9a9a9e'
  stone: '#9e9ea0'
  stone-dark: '#6b6b6f'
  hairline: '#cacacb'
  hairline-dark: '#3a3a3d'
  hairline-soft: '#e5e5e5'
  hairline-soft-dark: '#2a2a2c'
  success: '#007d48'
  success-dark: '#34d399'
  error: '#d30005'
  error-dark: '#f87171'
  warning: '#a15c00'
  warning-dark: '#fbbf24'
typography:
  display:
    fontFamily: 'Anton, sans-serif'
    fontSize: '64px'
    fontWeight: 500
    lineHeight: 0.9
  headline:
    fontFamily: 'Inter, sans-serif'
    fontSize: '32px'
    fontWeight: 500
    lineHeight: 1.2
  title:
    fontFamily: 'Inter, sans-serif'
    fontSize: '24px'
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: 'Inter, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  body-strong:
    fontFamily: 'Inter, sans-serif'
    fontSize: '16px'
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, sans-serif'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: 'Inter, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.5
rounded:
  none: '0px'
  sm: '18px'
  md: '24px'
  lg: '30px'
  full: '9999px'
spacing:
  xxs: '2px'
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '18px'
  xl: '24px'
  xxl: '30px'
  section: '48px'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.on-primary}'
    typography: '{typography.body-strong}'
    rounded: '{rounded.full}'
    height: '48px'
    padding: '0 24px'
  input-text:
    backgroundColor: '{colors.soft-cloud}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
  card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    padding: '24px'
  nav-link:
    textColor: '{colors.mute}'
    typography: '{typography.body-strong}'
  nav-link-active:
    textColor: '{colors.ink}'
    typography: '{typography.body-strong}'
---

# Design System: Home Remote MCPs

## Overview

**Creative North Star: "The Utility Vault"**

This is not a product being sold to strangers - it is personal infrastructure, visited briefly and
rarely, whose entire job is custody: storing credentials for services that don't offer a clean way
to be reached by an MCP client, and minting the API keys that let a client reach them. Every
decision in this system serves that framing. There is no brand accent color because there is
nothing to sell; the palette is Carbon & Paper - near-black ink on white and off-white paper, the
same restraint as a receipt or a ledger, not a screen-native gradient world. Where the system does
allow itself softness - the full-pill buttons, the 24px-radius inputs - it reads as approachable
rather than decorative: **Soft and approachable** controls sitting inside **sharp, flat, hairline-
bordered** containers. The one deliberately loud gesture is the Anton wordmark, used at two
completely different scales (a tiny uppercase brand mark in the header, a massive 64px campaign
headline on login) and nowhere else - display type is rationed, not a general-purpose headline
font.

**Key Characteristics:**

- Fully neutral palette: no brand hue, only ink/canvas/soft-cloud grays plus three semantic status
  colors (success/error/warning).
- Flat by construction: zero shadows anywhere in the implementation; depth comes from a two-step
  background lightness (soft-cloud page → canvas card) plus 1px hairline borders.
- Two-register shape language: structural containers (cards, code blocks) are sharp (0px radius);
  every interactive control (buttons, inputs) is heavily rounded (24px inputs, full-pill buttons).
- Display type (Anton) is rationed to exactly two roles - the persistent brand wordmark and the
  login hero headline - never a general section-heading font.
- Single breakpoint: `sm` (640px) is the only responsive boundary used anywhere in the app.
- Dark mode is a first-class, system-driven inversion of the same neutral family (off-black/off-
  white, never pure), not a separate design.

## Colors

Fully neutral - Carbon & Paper. The only chromatic tokens in the system are the three semantic
status colors; there is no brand accent, and none should be introduced without an explicit product
decision (see Named Rule below).

### Primary

- **Ink** (`#111111` light / `#f2f2f0` dark): the only "primary" color in the system, because
  there is no brand hue - it carries all primary actions (button fills), all body text, and the
  wordmark. Functions as both the text color and the primary-action fill, which is why
  `on-primary` exists as its own token (the color that sits _on top of_ an ink-filled surface) and
  must invert alongside it in dark mode (`#ffffff` light / `#111111` dark) so a primary button
  never goes low-contrast when the theme flips.

### Neutral

- **Canvas** (`#ffffff` light / `#1c1c1e` dark): elevated surface - cards, the header bar. One
  lightness step above the page background.
- **Soft Cloud** (`#f5f5f5` light / `#101012` dark): page background _and_ the fill color inside
  text inputs - the same recessed surface serves both roles, which is why an input reads as "a
  soft-cloud-colored notch cut into the page," not a separate input chrome.
- **Charcoal** (`#39393b` light / `#c7c7c9` dark): darker secondary text register, defined in the
  token set but not currently drawn on by any component - reserved.
- **Mute** (`#707072` light / `#9a9a9e` dark): secondary text - inactive nav links, captions,
  helper copy, timestamps.
- **Stone** (`#9e9ea0` light / `#6b6b6f` dark): lightest text register, defined but not currently
  drawn on by any component - reserved.
- **Hairline** (`#cacacb` light / `#3a3a3d` dark): the border color on every card, the header's
  bottom border, and the mobile nav's divider - the system's only border color.
- **Hairline Soft** (`#e5e5e5` light / `#2a2a2c` dark): a lighter border step, defined but not
  currently drawn on by any component - reserved.

### Semantic

- **Success** (`#007d48` light / `#34d399` dark): connected/OK credential status text.
- **Error** (`#d30005` light / `#f87171` dark): failed credential status, delete/revoke/error text
  and messages, error-state focus rings.
- **Warning** (`#a15c00` light / `#fbbf24` dark): `pending_mfa` status text - the one intermediate
  state between success and failure.

### Named Rules

**The No-Accent Rule.** There is no brand color. Every non-neutral pixel in this system is a
semantic status color (success/error/warning) carrying real state, never decoration. Introducing a
brand accent is a product decision, not a styling one - it would contradict "The Utility Vault"
framing.

**The Dark Mode Is Not Optional Rule.** Every color token ships a dark counterpart, driven purely
by `prefers-color-scheme` (no manual toggle exists). A new token without a dark value is an
incomplete token, not a follow-up.

## Typography

**Display Font:** Anton (with sans-serif fallback)
**Body Font:** Inter (with sans-serif fallback)

**Character:** A stark pairing on purpose - Anton is a heavy, condensed, all-caps-leaning display
face rationed to exactly two jobs (see Named Rule); Inter carries literally everything else,
including every section heading in the app, so "headline" and "title" below are Inter, not Anton.

### Hierarchy

- **Display** (weight 500, 64px, line-height 0.9): the login page's `Home MCPs` hero headline only.
  Uppercase, Anton.
- **Wordmark** (weight 500, 16-18px, line-height 1, Anton, uppercase, tight tracking): the
  persistent `Home Remote MCPs` header brand mark - the _other_ Anton usage, at a completely
  different scale from Display. Not a scale step; a distinct, named treatment.
- **Headline** (weight 500, 32px, line-height 1.2, Inter): defined in the type scale
  (`heading-xl`) but not yet drawn on by any current screen - reserved for a heavier section break
  than Title.
- **Title** (weight 500, 24px, line-height 1.2, Inter): every section `<h2>` in the app - "Services
  connectes," "Nouvelle cle API," etc. The actual day-to-day heading weight.
- **Body** (weight 400, 16px, line-height 1.5, Inter): paragraph copy, helper text under section
  titles.
- **Body Strong** (weight 500, 16px, line-height 1.5, Inter): emphasized inline text - credential
  labels ("Garmin Connect"), API key labels - not a separate size, just weight-shifted body.
- **Label** (weight 500, 14px, line-height 1.5, Inter): status text, secondary metadata rows,
  captions.
- **Caption** (weight 500, 12px, line-height 1.5, Inter): fine print - last-tested timestamps,
  service-connection hints under a card title.

### Named Rules

**The Rationed Display Rule.** Anton appears in exactly two places on any screen: the persistent
header wordmark and (on `/login` only) the hero headline. It is never a general section-heading
font - every `<h2>` in the authenticated app is Inter Title, not Anton.

## Layout

Single-column throughout; there is no grid system and no multi-column composition anywhere in the
app - a direct expression of "solo-app economy of motion" from the product brief. Every
authenticated page is a `max-w-xl` (576px) column, horizontally centered, holding a vertical stack
of full-width sections.

Container rhythm is responsive on the single `sm` (640px) breakpoint - the only breakpoint used
anywhere in this codebase:

- Page padding: `px-lg` (18px) below `sm`, `px-xl` (24px) at `sm` and above.
- Page vertical padding and inter-section gap: `py-xl`/`gap-xl` (24px) below `sm`, `py-section`/
  `gap-section` (48px) at `sm` and above.
- Card internal padding stays constant at `p-xl` (24px) across all breakpoints - only the _page_
  rhythm compresses on mobile, not the card interior.

Card/list rows that pair a content block with an action (a connected-service card with its delete
button, an API key row with its revoke button) are `flex-col` below `sm` and `flex-row` (space-
between) at `sm` and above - the action control drops below its content rather than being forced
into a cramped side-by-side row on a narrow viewport.

The header is the one component with a genuinely different structure per breakpoint rather than a
reflow: below `sm` it is two stacked rows (brand + logout, 48px; then nav, 44px, divided by a
hairline) because brand + nav + user email + logout cannot fit one line under ~640px; at `sm` and
above it collapses back to the single 56px row with everything inline. It is `sticky top-0`.

### Named Rules

**The Single Breakpoint Rule.** `sm` (640px) is the only responsive boundary in the app. There is
no `md`/`lg`/`xl` behavior anywhere - a screen is either "narrow" or "not narrow."

## Elevation & Depth

Flat by construction - zero `box-shadow` anywhere in the implementation. Depth is conveyed entirely
through a two-step background lightness (`soft-cloud` page background recedes, `canvas` cards and
the header sit one step lighter/more-elevated on top) combined with a 1px `hairline` border on
every card and code block. Nothing lifts, glows, or casts a shadow on hover or focus; interactive
feedback is color-only (text darkening on hover, an outline ring on focus-visible).

### Named Rules

**The Flat-By-Default Rule.** Surfaces never cast shadows. If a future component needs elevation,
express it as another background-lightness step plus a hairline border, not a `box-shadow`.

## Shapes

Two-register shape language, not one uniform radius:

- **Structural containers are sharp** (0px / `rounded.none`): every card, section, and `<code>`
  block. Nothing that holds content or data gets rounded.
- **Interactive controls are heavily rounded**: text inputs at 24px (`rounded.md`, the bare
  `rounded` utility), primary buttons and the login CTA at full-pill (`rounded.full`, 9999px). The
  two unused steps in the scale (`sm` 18px, `lg` 30px) exist as intermediate options but nothing
  currently uses them.
- Borders are always `hairline` (1px, `#cacacb` / `#3a3a3d` dark) and always exactly 1px - no
  heavier border weight exists in the system.

### Named Rules

**The Structure-vs-Action Rule.** If it holds content, it's sharp. If you can click, type into, or
press it, it's heavily rounded. A rounded card or a sharp-cornered button would both be off-system.

## Components

### Buttons

- **Shape:** full-pill (`rounded.full`, 9999px).
- **Primary:** `ink` background, `on-primary` text, `body-strong` typography, 48px height
  (`h-12`), `disabled:opacity-50`. Two padding variants observed: full-width (`w-full`, no
  horizontal padding, used for every form submit) and inline (`px-xl` 24px horizontal padding,
  used for "Generer" and the login CTA where the button sits next to or below shorter content).
- **Hover / Focus:** no dedicated hover treatment on the primary fill (relies on
  `disabled:opacity-50` for the only state change); no visible focus ring currently defined on
  primary buttons.
- **Text/Ghost (destructive & utility):** no fill, no border - `error`-colored text with
  `hover:underline` for "Supprimer"/"Revoquer," `mute`-colored text with `hover:text-ink` for
  "Deconnexion." Both carry a `focus-visible:outline` ring (2px, offset 2px, colored to match the
  action - `ink` for neutral, `error` for destructive) - the one place in the system with an
  explicit keyboard-focus treatment.

### Cards / Containers

- **Corner Style:** sharp, `rounded.none` (0px).
- **Background:** `canvas` (white / `#1c1c1e` dark).
- **Shadow Strategy:** none - see Elevation & Depth.
- **Border:** 1px `hairline`, all four sides.
- **Internal Padding:** `p-xl` (24px), constant across breakpoints.

### Inputs / Fields

- **Style:** `soft-cloud` background (no border), `rounded.md` (24px) corners, `px-md py-sm`
  (12px/8px) padding, `body` typography, `placeholder:text-mute`.
- **Focus:** `focus:ring-2 focus:ring-ink` - a solid 2px ink ring, no border-color shift.
- **Label pattern:** placeholder-as-label throughout (no separate `<label>` element exists on any
  form in the app today) - the placeholder text is the only field label.
- **Error / Disabled:** no per-field error or disabled visual state exists; form-level feedback is
  a separate success/error message line rendered below the form after submit, not inline per
  field.

### Navigation

- **Style:** text-only links, no background or pill treatment. Active state is a 2px bottom border
  in `ink` with `ink` text; inactive is transparent border with `mute` text, `hover:text-ink`.
  Typography is `body-strong` at the header's nav-link size.
- **Mobile treatment:** see Layout - the header restructures into two stacked rows below `sm`
  rather than reflowing a single row; the nav row scrolls horizontally (`overflow-x-auto`) as a
  safety net, though only two links exist today so it never actually needs to scroll.

### Status Label (signature component)

Text-only, no chip/background treatment - a colored word (`success`/`error`/`warning`) directly
under the item it describes, `label` typography. Chosen deliberately over a pill/badge: this is a
data-density decision consistent with "plain and procedural" - status is information, not
decoration, so it doesn't get a background to call attention to itself.

### Code / URL Display Block (signature component)

`<code>` blocks showing MCP connector URLs and the YouTube OAuth redirect URI: `soft-cloud`
background, sharp corners, `p-md` (12px) padding, `caption` typography (**not** a monospace
font - the type system has no mono role), `break-all` for long URLs on narrow viewports. Used
specifically for content the user is meant to copy verbatim.

## Do's and Don'ts

### Do:

- **Do** keep Anton rationed to the header wordmark and the login hero - never use it for an
  in-app section heading (`Title` / Inter / 24px owns that job).
- **Do** pair every new color token with its dark-mode counterpart in the same change - dark mode
  is system-driven and always-on, not an opt-in surface.
- **Do** keep structural containers sharp and interactive controls rounded - the two registers are
  the system's shape language, not an inconsistency to reconcile.
- **Do** collapse a content+action row to `flex-col` below `sm` whenever the row can plausibly
  overflow on a narrow viewport - the credential cards and API key rows already establish this
  pattern.
- **Do** use a plain colored status word for state, not a background pill/badge - matches the
  existing Status Label pattern.

### Don't:

- **Don't** introduce a brand accent color. The No-Accent Rule is deliberate, not an oversight to
  fix.
- **Don't** add `box-shadow` anywhere. Depth is background-lightness + hairline border only.
- **Don't** add a second responsive breakpoint (`md`/`lg`/`xl`) without a concrete layout that
  needs it - the app has stayed on a single `sm` boundary by design, not by omission.
- **Don't** round a card/container or sharpen a button/input - it breaks the Structure-vs-Action
  Rule and reads as an inconsistency, not a variation.
