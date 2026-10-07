# Weather application design system

Date: **2026-10-07**.
Status: **Proposed design specification; human approval required before UI
implementation.** No components, CSS, library, or frontend hosting are selected.

Use alongside the [application rules](../app/AGENTS.md),
[API contract](../backend/API_CONTRACT.md), and
[requirements](../requirements.md). This document defines presentation, not
new API capabilities.

## Direction and visual language

Build a calm, lightweight weather dashboard: clear hierarchy, generous space,
neutral surfaces, and restrained blue accents. Prioritize a legible weather
summary and obvious search/save actions over animation, gradients, map views,
or decorative dashboards. Initial scope is a light theme, English interface,
and metric-only current weather.

Proposed semantic palette:

| Role | Value | Usage |
| --- | --- | --- |
| Page | `#F8FAFC` | Application background |
| Surface | `#FFFFFF` | Cards and inputs |
| Primary text | `#0F172A` | Headings/body |
| Secondary text | `#475569` | Supporting text |
| Decorative border | `#CBD5E1` | Nonessential card separation |
| Control boundary | `#64748B` | Input/control outlines on light surfaces |
| Primary action / focus | `#1D4ED8` | White-label primary button; focus ring |
| Primary hover | `#1E40AF` | Hover/pressed emphasis |
| Error | `#B91C1C` | Error text/icons plus written explanation |
| Success | `#166534` | Confirmations with text |

Validate actual contrast in all implemented states; token selection alone is
not accessibility certification. Never communicate status by color alone.
Disabled styles must remain readable and unmistakably inactive.

## Typography and spacing

- Use the native system sans-serif stack; no external font service or mandatory
  font dependency. Use tabular numerals for weather measurements if available.
- Body/input: 16 px, line height 1.5; supporting text: 14 px, line height 1.5.
  Avoid essential text below 14 px.
- Page heading: 28-32 px; section heading: 20-24 px; card heading: 18-20 px.
  Use medium/semibold emphasis rather than many weights.
- Current temperature: 48 px on compact screens, up to 64 px on wide screens,
  with a clearly adjacent Celsius unit. Do not let numerals crowd location names.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48 px. Prefer 16-24 px component padding,
  24-32 px section separation, and consistent 8 px label/control spacing.
- Card radius: 12 px; control radius: 8 px. Use subtle borders; shadows only
  where elevation communicates interaction, not on every element.

## Layout, grid, and responsive behavior

- Center content in a maximum 1120 px container; page gutters 16 px on compact
  screens and 24-32 px on larger screens.
- Below 768 px: single-column flow, search then weather then saved locations.
  Labels remain above controls; actions stack when needed.
- At 768-1023 px: allow two-column metric groups and saved-location cards,
  but keep the search and primary weather summary full width.
- At 1024 px and above: use a 12-column grid with 24 px gaps; weather area
  spans eight columns and saved locations four. Avoid fixed-height card grids.
- Registration/login forms use a centered, maximum 440 px card.
- Support 320 px viewport width without horizontal page scrolling, 200% text
  zoom, and reflow at 400% browser zoom. Long names/errors wrap; controls do
  not overlap. Breakpoints respond to content, not named devices.
- No fixed header or sticky panel may hide keyboard focus or error messages.
  Avoid unnecessary mobile hamburger navigation for this small set of routes.

## Navigation and journeys

- Header: application name linking to the weather view, plus authentication
  actions. Anonymous users see Login and Register; authenticated users see a
  clear signed-in indicator and Logout. Avoid prominent full-email exposure
  on shared-screen layouts.
- Public weather lookup remains usable without login. Offer a Login to save
  action rather than pretending an anonymous save succeeded.
- Registration success leads to login with a concise success notice; no
  automatic authentication. Login returns to the weather view.
- Saved locations appear within the main weather view when authenticated;
  selecting one requests current weather using its coordinates.
- Remove is a distinct, labeled action. A pending deletion disables only that
  action; remove the card only after server success. No undo promise without
  a supporting API.
- Logout completes only after server confirmation. On failure, explain that
  logout did not complete and offer retry.
- Session expiry clears private preferences/user state, preserves public
  weather where appropriate, and shows a polite login prompt. Never
  automatically resubmit a failed save after login.
- Client-side page paths/routing are implementation choices; backend routes
  and payloads must remain those in the API contract.

## Buttons and interactions

- Primary: solid blue with white label, reserved for the main form action.
  Secondary: neutral outline. Tertiary: text action with clear focus/hover.
  Destructive: explicit Remove label with error-colored emphasis.
- Minimum interactive target 44 by 44 px; provide spacing between targets.
- Use buttons for actions and links for navigation. Do not make clickable
  nonsemantic containers or nest Remove inside a whole-card button.
- Label actions specifically: Search weather, Save location, Log in, Register,
  Remove location, Log out. Icons supplement, not replace, names.
- Define default, hover, active, focus-visible, disabled, and loading states.
  A pending action retains its label with an activity cue and prevents duplicate
  submission. Honor reduced-motion preferences; no essential animated feedback.

## Forms and inputs

- Persistent visible labels; placeholders are examples, never the only label.
  Link hint/error text to its control and mark invalid fields programmatically.
- Search: required city input, optional country-code input with a two-letter
  hint, and Search weather. No autocomplete, map, or location permission prompt.
  Coordinate lookup is used for saved locations; a coordinate-entry form is
  not required for the initial UI.
- Login/registration: email and password only. Use email autocomplete and
  `current-password` / `new-password` appropriately. Permit paste/password
  managers. A show-password toggle must have an accessible changing label.
- Mirror API bounds for helpful validation, but the server remains authoritative.
  Do not trim/normalize passwords. Display the proposed 12-128 character
  registration rule as guidance; avoid unsupported strength guarantees.
- Validate on submission and after an invalid field is edited; do not show
  aggressive errors before users interact. Preserve values after failures,
  never log them, and discard password state when leaving the form/succeeding.
- Present field errors inline and a focusable form-level summary when useful.
  Generic credential failures stay form-level; `EMAIL_IN_USE` can link to login.
- Do not add account recovery, verification, MFA, consent tracking, or personal
  profile fields without approved requirements and API changes.

## Cards and weather patterns

- Weather card hierarchy: resolved city/country, condition text/icon,
  temperature, feels-like, then humidity and wind. Always display units:
  degrees Celsius, percent humidity, and meters per second.
- Render icons locally from the contract's condition code; no direct provider
  image requests. Condition text provides the meaning; decorative icons use
  empty alternative text. No color-only or icon-only weather distinctions.
- Show the provider observation time with explicit timezone context, formatted
  for the browser locale/timezone with its zone label. It is not a refresh time.
- Display resolved coordinates as secondary detail so an ambiguous city can be
  checked before saving. Never label the result "your location."
- Save uses the exact resolved location from the backend. Existing saves show
  Saved, not repeated creation notifications; handle both `200` and `201`.
- Saved cards show name/country and optionally coordinates for disambiguation;
  do not imply they contain freshly fetched weather. Selecting a saved location
  runs a weather lookup.
- Include OpenWeather attribution/link text in the weather area once the chosen
  product's requirements are verified. Attribution is not permission for the
  frontend to call the provider.

## Loading, error, and empty states

| State | Required presentation |
| --- | --- |
| Initial authentication | Small neutral loading state; avoid flashing logged-in or anonymous-only actions before state resolves |
| No weather query | Prompt to search for a city; no fabricated weather |
| Weather loading | Reserved summary space, restrained skeleton/activity cue, textual loading announcement |
| No matching location | Explain no match; suggest checking city spelling/country; keep query editable |
| Provider timeout/failure/quota | Explicit weather-unavailable message and retry; registration/login/preferences remain usable |
| Previous weather after failed lookup | Clearly mark previous result and observation time beside the error; never display it as the new query's success |
| Preferences loading | In-place loading cue, not an empty-list claim |
| No saved locations | Explain how to search and save; no sample records disguised as persisted data |
| Preference operation failure | Preserve current confirmed state and offer retry; never substitute an empty list or optimistic success |
| Authentication/CSRF failure | Explain session/security refresh need; bootstrap session as appropriate, without replaying mutations automatically |
| Rate limit | Explain wait/retry timing when provided; avoid automatic rapid retries |
| Network/non-JSON failure | Sanitized service/connection message, retry, and diagnostic reference when available |

Use inline messages near the affected feature. Important errors remain until
resolved or dismissed; do not rely solely on disappearing toasts. Successful
save/removal can use a short nonblocking status announcement.

Cancel or ignore superseded search responses so an older lookup cannot replace
the latest query's result. Do not automatically retry unsafe requests or show
fake progress percentages.

## Accessibility and reusable components

- Proposed target: WCAG 2.2 AA. Verify keyboard-only use, screen-reader behavior,
  text/control contrast, zoom/reflow, focus visibility, and target sizes.
- Use landmarks, a skip-to-content link, one page-level heading, logical heading
  order, and natural tab order. No keyboard traps or positive tabindex.
- Maintain focus through rerenders; on route changes move focus to the main
  heading, on invalid forms to the first invalid control or summary, and after
  card removal to a sensible nearby control.
- Use polite live regions for loading/success, assertive announcements sparingly
  for blocking errors. Do not repeatedly announce decorative skeletons.
- Reuse consistent Button, FormField, StatusMessage, Card, WeatherSummary, and
  SavedLocation patterns as implementation needs arise. These are conceptual
  building blocks, not mandated files or a component library.
- Keep API handling and domain state outside purely visual building blocks.
  Centralize semantic styling tokens; avoid copied per-page styles and large
  configurable component frameworks.
- Verify real states with synthetic fixtures and keyboard/viewport checks.
  This specification is not a visual prototype or accessibility test result.
