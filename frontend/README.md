# Weather frontend

Static React + TypeScript SPA using Vite and Tailwind CSS (the native v4 Vite
plugin and a small color/shadow theme). Application data comes exclusively
from our backend, configured by `VITE_API_BASE_URL`; production uses same-origin
`/api/v1/...`. There is no provider SDK, browser storage of
credentials/tokens, service worker, telemetry, external font, or frontend
container. The backend API contract and design system remain authoritative.
Weather lookup returns the normalized **free OpenWeather five-day / three-hour
forecast**, not current conditions. The browser never contacts the provider.

## Local commands

Node.js **22.12 or later** (validated with 24.15.0) and npm:

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser suite needs Playwright Chromium. If it is not already installed,
run `npx playwright install chromium`. It serves the production build on
`127.0.0.1:4173` and intercepts only documented backend routes with synthetic
fixtures; no live backend/provider or credentials are required. Build before
running that suite.

The example sets `VITE_API_BASE_URL=http://localhost:3000/api/v1` for local
development. Run the backend separately and open the Vite UI on `localhost`
(normally port 5173). Local requests go directly to the backend with
`credentials: include`; its Origin allowlist must include the frontend origin
and its credentialed CORS/preflight handling must allow `Content-Type` and
`X-CSRF-Token`. The frontend does not change backend cookie or security policy.
There is no Vite API proxy configuration.

Restart any already-running Vite process after installing Tailwind or changing
Vite plugins; hot-reloading source alone may not load the new plugin.

The tracked `.env.production` sets `VITE_API_BASE_URL=/api/v1`. Production
builds therefore use Front Door's shared public domain, never a Container Apps
hostname. CI can explicitly set that same value when building. Vite embeds
these values at build time; changing them requires a rebuild, not a runtime
container setting. All `VITE_*` values are public: **never put secrets in them**.
Missing API configuration is shown as an explicit error. Public search remains
usable when only session bootstrap fails, with explicit authentication retry.

## Static delivery handoff

`npm run build` produces **`frontend/dist`**. Upload only its contents to the
dedicated Storage static website `$web` container selected by the final
architecture review. No Node runtime or container is needed in production.

- `index.html` is the public, nonpersonalized SPA entry point.
- `assets/*` files have content-hashed names; no public source maps are emitted.
- `404.html` is a separate error document. Configure it as Storage's error
  document, **not** `index.html`.
- SPA routes are `/`, `/login`, `/register`, and their trailing-slash equivalents.
  Front Door must rewrite only those frontend navigation GET/HEAD requests to
  `/index.html` with status 200. Unknown paths/missing assets must return a real
  404; never rewrite `/api` or `/assets` to the shell. Vite's preview fallback
  is not a verification of Storage/Front Door routing.
- Route `/api/v1/*` to the backend origin, with caching disabled and Cookie,
  Authorization and CSRF headers preserved. Never send API traffic to Storage.
- Publish hashed assets first and `index.html` last; retain previous release
  assets for old tabs and rollback. Serialize release publishers.
- Set hashed asset responses to `public, max-age=31536000, immutable` only on
  successful hashed asset responses. HTML/navigation/404 responses use
  `no-store`. Do not publicly cache backend responses.
- Front Door owns HTTPS, MIME enforcement and response security headers.
  Strip Cookie/Authorization/CSRF only on requests forwarded to Storage.

A tested production-compatible CSP baseline:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'
```

Add `X-Content-Type-Options: nosniff`, HSTS, a restrictive referrer policy and
permissions policy at the edge. No inline script/style, `unsafe-inline`,
`unsafe-eval` or third-party connection permission is required. The
OpenWeather attribution is a plain navigation link, not an image/API request.
The browser suite exercises this CSP on the built application; deployment
owners must still verify actual headers, cache rules, HTTPS, deep links,
missing assets and real cookie/Origin behavior in the deployed environment.

## Behavior and testing boundaries

Session bootstrap and logout failure are not treated as anonymous success.
Login rotates in-memory CSRF state. A protected `UNAUTHENTICATED` error clears
private preferences and refreshes the session; `CSRF_FAILED` refreshes security
state. Neither automatically replays a mutation. The complete supplied forecast
is grouped into selectable days using the city's fixed `timezoneOffsetSeconds`, not
the browser timezone. Available times, Celsius temperature and conditions are
shown without invented daily aggregates; partial first/last days are labelled.
Retrieval time is labelled separately from the forecast's valid time.

The weather-first layout uses a pale-blue canvas, rounded white surfaces and a
compact selected-point hero. At desktop widths the hero sits beside a horizontal
day selector and **only the selected day's** three-hour point cards; mobile
stacks them with native horizontal overflow inside the selectors, not the page.
The first returned point/day is selected initially and on each fresh response.
Choosing a day selects its first available point; choosing a time updates the
hero without changing the day. The full supplied horizon remains reachable,
including partial first/last days across up to six local dates.
Each native selector exposes
`aria-pressed`, keeps keyboard focus, and updates the hero's date/time, temperature,
condition and local SVG together. Display temperatures use up to one decimal;
the hero's Save action submits the exact selected `forecastAt`, `temperatureC` and
`condition.description` mapped to `snapshot.description`, alongside the
backend's resolved location. Saves use idempotent 200/201 responses and match
duplicates by canonical coordinates **plus forecast time**; different times
for the same city may be saved. Compact saved cards use two columns from tablet
width and one on mobile, showing a clearly labelled immutable
snapshot and server creation time, both explicitly in UTC. **Open fresh
forecast** always calls the backend again by coordinates, including for past
saved points; fresh responses never overwrite stored snapshots.

Deletions remain visible until confirmed. Provider failures do not disable
authentication or saved-list/removal operations. A previous forecast is
replaced with scoped, noninteractive hero/day skeletons during a lookup. After a
failure it is explicitly labelled with its location/retrieval time, never
presented as the new query's success. After a provider failure,
users can still deliberately save a point from that labelled previous forecast:
it is a user-selected snapshot, and saving makes no additional weather request.

The API client uses ordinary TypeScript interfaces and fetch. Successful JSON
is trusted to follow the backend contract; TypeScript types are not runtime
validation. The backend remains responsible for validating/normalizing data.
The client handles HTTP failures, contract error messages/CSRF codes,
network/non-JSON failures, cancellations and bodyless 204 responses.
An absent/empty forecast is an explicit service error, not fabricated weather.
`Retry-After` temporarily disables forecast lookup actions without automatic retry.

Session bootstrap reserves the header account row with skeleton blocks. Auth
forms remain visible but unavailable until the session is ready. Saved-list
requests use card skeletons, distinct from anonymous/empty/error states. Skeletons
respect reduced motion; Save/Remove/Login/Register/Logout use disabled buttons
and concise loading labels instead. Session errors stay in a small recovery
region and do not displace public search or hide Login/Register navigation.

Login and registration share a 980 px two-column auth surface, with a compact
form and an original decorative weather SVG on a blue gradient. Below 768 px
the decoration is hidden. Password visibility is integrated into the input.
Field errors replace helper text; server errors are compact alerts without
diagnostic request IDs. Programmatic route/result/removal/alert focus is retained
without a noninteractive outline; links, buttons and inputs retain visible
keyboard focus. Header account links are explicitly styled as outline/primary
actions. No social login, new weather metrics or dependencies were added.

Unit tests verify API URLs/payloads/headers/statuses, forms, loading/error/empty states,
session expiry/rotation, mutation failures, superseded lookup races, the full
40-point horizon, city-offset date grouping, separate forecast-time saves,
snapshot preservation and repeated fresh reopening.
Chromium tests exercise keyboard journeys, route focus, skeletons, reduced motion,
320/390/768/1024/1440 px layouts and 200% text sizing, plus compact auth/error
geometry and responsive saved-card grids. The visual inspection and local smoke-test
results are recorded in [the refinement record](../docs/ai/15-frontend-refinement.md).
This is not a complete WCAG audit, deployment, load test, or cross-browser guarantee.
The backend/release owner must resolve backend security policies and verify
free-product key entitlement, attribution and terms before release.
