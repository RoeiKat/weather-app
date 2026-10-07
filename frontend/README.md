# Weather frontend

Static React + TypeScript SPA using Vite. Application data comes exclusively
from same-origin `/api/v1/...`; there is no provider SDK, browser storage of
credentials/tokens, service worker, telemetry, external font, or frontend
container. The backend API contract and design system remain authoritative.
Weather lookup returns the normalized **free OpenWeather five-day / three-hour
forecast**, not current conditions. The browser never contacts the provider.

## Local commands

Node.js **22.12 or later** (validated with 24.15.0) and npm:

```powershell
Set-Location frontend
npm ci
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

`npm run dev` runs the UI only by default. To connect a local backend, set the
Node-only `WEATHER_API_PROXY` environment variable to its actual HTTP(S) origin
before starting Vite. Vite proxies `/api/*` while retaining the browser Origin;
configure the Vite development origin in the backend's Origin allowlist.
The proxy target is not embedded in the production build.
No backend port, cross-origin CORS exception, or insecure production cookie
override is assumed here. Public search still works when session bootstrap
fails, and authentication features show the failure with an explicit retry.

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
is grouped into day cards using the city's fixed `timezoneOffsetSeconds`, not
the browser timezone. Available times, Celsius temperature and conditions are
shown without invented daily aggregates; partial first/last days are labelled.
Retrieval time is labelled separately from the forecast's valid time.

Each row saves its exact `forecastAt`, `temperatureC` and
`condition.description` mapped to `snapshot.description`, alongside the
backend's resolved location. Saves use idempotent 200/201 responses and match
duplicates by canonical coordinates **plus forecast time**; different times
for the same city may be saved. Saved rows show a clearly labelled immutable
snapshot and server creation time, both explicitly in UTC. **Open fresh
forecast** always calls the backend again by coordinates, including for past
saved points; fresh responses never overwrite stored snapshots.

Deletions remain visible until confirmed. Provider failures do not disable
authentication or saved-list/removal operations. A previous forecast is
explicitly labelled with its location/retrieval time while a lookup is pending
or failed, never presented as the new query's success. After a provider failure,
users can still deliberately save a point from that labelled previous forecast:
it is a user-selected snapshot, and saving makes no additional weather request.

Unit tests verify API shapes/headers/statuses, forms, loading/error/empty states,
session expiry/rotation, mutation failures, superseded lookup races, the full
40-point horizon, city-offset date grouping, separate forecast-time saves,
snapshot preservation and repeated fresh reopening.
Chromium tests exercise keyboard journeys, route focus, 320 px reflow, tablet
and desktop layouts. This is not a complete WCAG audit, real provider integration,
backend session/cookie test, deployment, load test, or cross-browser guarantee.
The backend/release owner must resolve backend security policies and verify
free-product key entitlement, attribution and terms before release.
