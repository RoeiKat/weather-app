# Frontend implementation session

**Current guidance:** The forecast/snapshot correction entry below supersedes
the initial current-weather-only implementation. The original session is
retained as historical evidence, not the current frontend specification.
The API simplification entry supersedes the earlier Zod validation and
development-proxy implementation.

- **Title / date:** React + TypeScript static frontend; 2026-10-07.
- **Author / human decision owner:** AI assistant using Copilot SDK in VS Code /
  requesting user.
- **AI tool and model:** Copilot SDK in VS Code; model Unknown.
- **Related requirements / ADRs:** F-01 through F-03, N-04, S-02;
  [application rules](../app/AGENTS.md),
  [API contract](../backend/API_CONTRACT.md),
  [design system](../design/DESIGN_SYSTEM.md),
  [final architecture review](../architecture/final-architecture-review.md),
  accepted [ADR-004](../adr/ADR-004-global-entry-point.md),
  [ADR-005](../adr/ADR-005-network-security.md) and
  [ADR-006](../adr/ADR-006-cicd-strategy.md).

## Problem and prompt

**Faithful prompt summary:** Implement the React + TypeScript frontend only
inside `frontend/**`, plus this record. Follow the shared API and design,
registration/login/logout/auth-state UX, public metric weather search, saved
resolved locations, same-origin backend-only requests, cookie-session + CSRF,
loading/empty/error/private-session states, accessible responsive UI and tests.
Produce a static production artifact for the final Storage/Front Door hosting
model. Do not modify backend, infrastructure, workflows, shared specifications
or ADRs. Do not stage or commit. Run lint/typecheck/tests/build and inspect Git
status/diff before completion. No sensitive inputs were supplied or reproduced.

## Human approval and scope

The current request explicitly authorized frontend implementation despite
historical documentation-only labels. The design and API documents still
contained separate pre-implementation approval requirements, so the assistant
asked for approval before writing application files.

**Durable approval reference:** In this implementation conversation on
2026-10-07, the requesting user selected:

> Approve the current design and frontend API behavior; proceed (Recommended)

The question explicitly covered the current design, frontend-visible API
behavior, 12-128 Unicode-code-point password bounds and `EMAIL_IN_USE`
registration feedback. It explicitly left backend session lifetimes, hashing,
abuse limits and provider terms to their respective owners. This approval was
not used to rewrite or accept any shared specification or backend policy.

## Recommendation and implementation

- Use Vite, React and strict TypeScript for one static SPA, without another
  runtime, frontend container, routing framework or component library.
- Use the architecture's exact navigation paths: `/`, `/login`, `/register`,
  including trailing-slash handling and browser history navigation.
- Centralize API transport and runtime response validation with Zod. Use only
  documented relative `/api/v1/...` routes, `credentials: same-origin`,
  `cache: no-store`, JSON and the documented CSRF header.
- Keep session and CSRF state in memory. Share concurrent session-bootstrap
  requests so competing cookie/token responses cannot race. Login accepts the
  rotated auth state; registration leads to login without automatic login.
  Successful logout clears private state and bootstraps a new anonymous
  session. Failed logout remains visibly unsuccessful and supports retry.
- Recover explicitly from expired authentication and failed CSRF without
  automatic mutation replay. Hide and clear private preferences on expiry;
  ignore late private responses after logout/account changes. Do not substitute
  anonymous success for a failed session bootstrap.
- Search by city plus optional uppercase country code; saved-location lookup
  uses exact canonical coordinates. Save only the backend's resolved location.
  Accept both idempotent save statuses, identify existing saves by coordinates,
  sort confirmed preferences by creation time then opaque ID, and remove only
  after server confirmation. Concurrent operations retain independent pending
  controls; late list responses cannot undo confirmed mutations.
- Abort/ignore superseded weather lookups. A failed/pending lookup labels any
  retained weather as previous and prevents saving it as the new lookup.
  Provider errors do not disable authentication/preference operations.
- Follow the design's palette, system fonts, metric units, neutral cards,
  local condition icons, visible resolved coordinates and browser-locale
  observation timestamp with explicit timezone label. Include a plain
  OpenWeather attribution link, not a provider network request.
- Implement visible labels, field errors, password visibility controls,
  invalid-form focus, route heading focus, post-removal focus, skip navigation,
  landmarks, status/error announcements, reduced-motion support and at least
  44 px interactive targets. Layouts cover compact, tablet and desktop widths.
- Supply a Node-only optional Vite `/api` development proxy through
  `WEATHER_API_PROXY`, retaining the browser Origin. No backend port or
  production CORS exception was invented.
- Add [frontend handoff documentation](../../frontend/README.md), npm lockfile,
  contract/UI tests, Chromium browser tests and a separate static `404.html`.
  Build output is [frontend/dist](../../frontend/dist); it is generated and
  ignored, not committed. Hash-named assets are under `/assets`, with no
  source maps or service worker.

**Rejected / deferred:** Frontend containerization, direct OpenWeather calls or
images, browser token/credential storage, invented API routes, cross-origin
production API URLs, speculative forecasts/geolocation, optimistic deletion,
automatic unsafe retries, a generic client-router/library layer, and any
infrastructure/deployment changes.

## Verification

Environment: Windows, Node.js 24.15.0, npm 11.12.1. Dependencies were installed
only after creating the manifest. Playwright Chromium was installed only after
the browser test reported its required executable missing.

Final commands in `frontend`:

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed, strict TypeScript |
| `npm test` | Passed: 36 tests across two files |
| `npm run build` | Passed: Vite static production output |
| `npm run test:e2e` | Passed: 6 Chromium tests, desktop 1280 px, tablet 800 px, compact 320 px |

The editor test tool initially found no registered tests, so the repository's
Vitest runner was used. Early checks exposed lifecycle cleanup lint warnings
and an abort-classification bug involving DOMException; both were corrected
and the full relevant checks rerun successfully. A strengthened private-state
test initially used an ambiguous accessible-name selector; it was narrowed,
then passed. No failed checks were treated as successful.

Contract/UI tests cover relative routes, credentials/cache behavior, exact
payloads, canonical coordinates, CSRF rotation, bodyless 204 responses, opaque
path encoding, idempotent saves, malformed/non-JSON/network failures, response
bounds, invalid forms, password preservation/bounds, public lookup during
session failure, previous-result labeling, preference failures, superseded
searches, expiry, CSRF recovery without replay, logout failure/success, late
private responses, initial loading and route focus.

Browser tests run against the actual production build with synthetic backend
fixtures. They exercise keyboard registration/login/search/save/select/remove/
logout, direct login navigation, focus, measured target sizes and no horizontal
page overflow. The full journey also passes under a restrictive same-origin
CSP without unsafe script/style allowances and asserts no external requests
or uncaught page errors. Desktop and compact screenshots were visually
inspected; they match the intended calm hierarchy and responsive flow.

Measured implemented color contrast passed 4.5:1 normal-text and 3:1
control/focus thresholds: primary text 17.06:1, supporting text 7.58:1,
primary button 6.70:1, hover 8.72:1, error 5.91:1, success 6.81:1,
disabled text 6.15:1, control boundary 4.76:1 and focus 6.41:1.
This is not complete WCAG certification or a manual screen-reader/text-zoom
audit.

Production output: `index.html`, `404.html`, one hashed CSS asset (about 5 KB)
and one hashed JavaScript asset (about 329 KB / 101 KB gzip). Vite reports two
nonfatal upstream Zod comment-annotation warnings; the build and restrictive-CSP
browser tests pass. npm also reports an ESLint 9 upstream support/deprecation
warning; the installed lint runner works. Dependency upgrades can be assessed
separately without broadening this frontend implementation.

Git status and diff were inspected without staging. The worktree was clean at
session start. All writes performed by this session are in `frontend/**` and
this record; no existing tracked files outside that scope were changed by this
session. During validation, new untracked `backend/**` files appeared from
concurrent work. They were left untouched, so the whole shared worktree is not
frontend-only; this session must not claim otherwise. Untracked frontend files
are additions, which ordinary unstaged `git diff` does not display; no-index
diff checks were used without staging.
All 24 allowed-scope additions passed no-index whitespace checks; the index
contained no staged files. A production-output smoke check verified both
referenced hashed assets exist, the separate 404 exists, and no source maps,
synthetic credentials/tokens, provider API URL or development proxy
configuration appear in the generated JavaScript.

## Final human decision and remaining work

**Approved:** Requesting user, 2026-10-07, frontend implementation scope and
the current frontend-visible specification, via the explicit task and approval
selection above. **Pending:** Human acceptance of the completed implementation
and deployed integration/release.

- No real backend/provider, database, Azure deployment, backend cookie flags,
  cross-replica sessions or live Origin behavior was tested here.
- Backend owners retain approval of session lifetimes, anonymous cleanup,
  password hashing parameters, abuse limits and privacy lifecycle policies.
- Backend/release owners must select/verify OpenWeather product terms and
  attribution; the generic link is not a compliance claim.
- Infrastructure/CI owners must deploy only `dist`, retain old hashed assets,
  publish the entry point last, implement the known-route-only SPA rewrites,
  real missing-path/asset 404s, HTTPS/security headers, uncached HTML/API and
  hashed-asset caching described in the handoff. Preview-server fallback is
  not proof of Storage/Front Door routing.
- Additional manual assistive-technology, 200% text-zoom, browser-zoom and
  cross-browser acceptance remain appropriate before production release.
- No staging, commit, workflow change, containerization or Azure resource
  operation was performed.

## Correction: multi-day forecasts and saved snapshots, 2026-10-07

- **Author/tool/model:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** Do not restart or redesign the frontend. Adapt
  the existing React + TypeScript + Vite SPA to the corrected foundation: free
  OpenWeather five-day / three-hour forecasts, specific selected forecast-point
  saves, minimal immutable snapshots plus location, and fresh backend forecast
  requests on reopening. Keep the app small and preserve useful existing work.
  Read the four corrected sources, write only frontend files and this record,
  run lint/typecheck/tests/production build, verify scope, and do not stage or
  commit. No sensitive prompt content or credentials were supplied.
- **Sources reread:** [application rules](../app/AGENTS.md),
  [API contract](../backend/API_CONTRACT.md),
  [design foundation](../design/DESIGN_SYSTEM.md) and
  [foundation correction/clarification](10-application-foundation.md).

### Changes accepted for implementation

The user's explicit correction request authorizes this adaptation. The free
forecast product, snapshot persistence and React/TypeScript/Vite stack are
human-directed requirements, not new assistant-selected architecture.

1. **Exact normalized API shapes:** Replaced the current-weather DTO with
   `ForecastResponse`: `location`, `units`, `fetchedAt`,
   `timezoneOffsetSeconds`, and the full ordered `forecast` array. Each point
   contains only `forecastAt`, `temperatureC`, and `condition`. Runtime
   validation rejects empty arrays, duplicate/out-of-order times, malformed
   points, invalid offsets and legacy/raw provider response fields rather
   than silently dropping data or fabricating days.
2. **Specific point saves:** The existing preference POST now submits exactly
   `{location, snapshot}`. `snapshot` has `forecastAt`, `temperatureC` and
   `description`, mapped from the selected point's `condition.description`.
   Preference responses require the same snapshot plus ID/location/server
   `createdAt`. No user ID, condition code, whole forecast array, units or
   client creation time is submitted.
3. **Coming-days UI:** Reused the existing cards, icons, fields, status messages
   and palette. Replaced the single conditions/metric summary with responsive
   day cards containing every available three-hour time, Celsius temperature,
   condition and per-point Save forecast action. Dates/times use the supplied
   city offset, not the browser timezone. The fixture's 40 points span six
   local dates with explicitly partial first/last days. No daily aggregates,
   missing intervals, complete-five-calendar-day promise or extra metrics.
   Retrieval time is labelled Retrieved at in UTC, never Observed.
4. **Saved snapshots:** Saved rows show city/country, coordinates, the explicit
   Saved forecast snapshot label, selected UTC forecast time, stored Celsius
   temperature/description and server creation time in UTC. Duplicate/pending
   indicators use canonical coordinates plus selected time, so separate times
   for one city remain independently saveable. Saves/removals update only
   after server confirmation. Confirmed rows sort by timestamp instant, then
   ID, including mixed fractional timestamp precision.
5. **Fresh reopening:** Separate Open fresh forecast and Remove controls.
   Every reopening calls the existing weather endpoint by coordinates,
   including past saved times and repeated selections of the same row.
   Successful fresh responses move focus to the resolved-city heading and
   never overwrite the saved snapshot. Failed/pending lookups label retained
   data Previous forecast with its resolved city/retrieval time; saved rows
   remain usable during provider outages. After a failed refresh, users may
   deliberately save an explicitly displayed previous point without another
   provider request. This corrects the old location-only save restriction:
   the snapshot is a user-submitted selection, not a claim of fresh retrieval.
6. **Related surfaces:** Updated search button, empty/loading/success/session
   text, auth-form descriptions, page metadata, footer, attribution and
   [frontend handoff](../../frontend/README.md). Updated existing API/UI/browser
   fixtures and tests; added one small shared date/selection helper and its
   focused unit tests.

**Preserved:** Vite/React/TypeScript and the existing dependencies/lockfile,
navigation routes, backend endpoint paths, same-origin credentials/no-store
transport, registration/login/logout flows, session rotation/CSRF recovery,
private-state clearing, explicit errors, superseded-request cancellation,
local SVG icons, static 404 and Storage/Front Door delivery model.

**Rejected/not introduced:** New state/UI libraries, a router or architectural
layer, charts, forecast caching, automatic history/snapshot updates, paid
provider products, provider SDKs/images/direct browser calls, extra API routes,
frontend containers or changes outside the original write scope.

### Correction verification

All final commands ran from `frontend`:

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 60 tests across three files |
| `npm run build` | Passed: static shell, 404 and hashed JS/CSS |
| `npm run test:e2e` | Passed: 6 Chromium tests at 1280, 800 and 320 px |

Forecast tests cover the complete 40-point horizon, chronological/unique
timestamps, city-midnight grouping, negative/fractional/extreme fixed offsets,
partial edges, exact minimal save payloads, distinct same-city forecast times,
per-point pending states, UTC snapshot/creation timestamps, immutable past
snapshots, saving a labelled previous point during provider outages without
another weather lookup, and new coordinate requests on every reopening. Existing
authentication, session/CSRF, network/non-JSON, error/loading/empty, race and
deletion regressions still pass.

Production browser journeys render all 40 points, save one selected snapshot,
reopen it twice with deliberately different fresh responses, verify the stored
snapshot remains unchanged, and exercise keyboard focus, target sizes,
no-horizontal-overflow layouts and logout. The restrictive same-origin CSP
continues to pass with no external requests or uncaught page errors. Desktop
and compact screenshots were visually inspected. The first unit run found two
selectors that assumed a single daily time/location heading; these were
corrected to distinguish repeated times and fresh versus saved headings, then
all checks passed. No product behavior failure was hidden.

Generated production output is still `frontend/dist`, approximately 332 KB
JavaScript / 102 KB gzip and 5.5 KB CSS, with the separate shell/error document.
The existing nonfatal upstream Zod annotation warnings remain; no dependencies
were added or replaced.

### Correction scope and decision

Git status/diff were checked without staging. The correction began with the
four foundation edits and untracked frontend/backend implementation already
present. All writes made by this correction are in `frontend/**` and this
record. The four read-only foundation documents retain their pre-correction
write timestamps.

An aggregate outside-scope fingerprint changed during final verification:
concurrent backend adaptation added/updated backend code, migrations and test
tooling. These files were not touched by this frontend session. Therefore a
whole-shared-worktree-only-frontend claim would be false; ownership is reported
separately. The Git index fingerprint matched the correction-start baseline,
and nothing was staged or committed.
All 26 owned additions passed no-index whitespace checks. A static-output smoke
check verified both hashed assets and the separate 404 exist, with no public
source maps, synthetic credentials/tokens, provider API URL or development
proxy configuration in the production JavaScript.

**Final human decision:** Confirmed by the requesting user's explicit
2026-10-07 correction instruction for the forecast/snapshot requirements and
frontend adaptation scope. Human acceptance of this implementation and live
deployment remains pending. Backend session/security policies, live provider
key/quota/attribution checks, actual backend integration, deployment routing/
headers/caching and manual assistive-technology/zoom/cross-browser acceptance
remain owner/release checks. The free product is now selected; the earlier
open product-selection note is superseded, not a reason to use a paid API.

## API simplification and environment configuration, 2026-10-07

- **Author/tool/model:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** Simplify the small application's existing API
  client without redesigning the UI or changing the contract. Remove Zod and
  unnecessary response-schema validation; use ordinary TypeScript response
  types and fetch. Read `VITE_API_BASE_URL` from `import.meta.env`, use
  `http://localhost:3000/api/v1` locally and `/api/v1` in production, preserve
  cookie credentials, CSRF and basic errors, add a public environment example,
  remove API-validation-only dependencies, and run lint/types/tests/build.
  Write only frontend files and this record; do not stage or commit.
- **Decision:** Explicitly authorized by the user's request. No new framework,
  dependency, backend hostname, API route or application feature was introduced.

### Implementation changes

- Replaced all Zod schemas and inferred DTO types with ordinary TypeScript
  interfaces for users, sessions, locations, forecast points/responses,
  snapshots, preferences and errors.
- Kept one small fetch helper for cookie credentials, no-store requests,
  JSON parsing, bodyless 204s, HTTP errors, cancellation and connection errors.
  Removed response-schema parsing and endpoint success-status arrays.
  Successful JSON is trusted to follow the backend contract; TypeScript
  declarations do not provide runtime validation. Backend validation/
  normalization remains authoritative.
- Retained `ApiError` because the existing UI uses its code/fields/request ID/
  retry hint for explicit errors and CSRF/session recovery. The only error
  envelope check is a basic code/message check to avoid treating an unexpected
  edge response as a known backend error. Existing mutation header/body
  construction and missing-CSRF protection remain shared rather than copied.
- Uses exactly `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL`.
  Fetch uses `credentials: 'include'` for both direct local-backend and
  same-origin production cookies. Missing base configuration produces an
  explicit configuration error, not an undefined URL or silent fallback.
- Added [frontend/.env.example](../../frontend/.env.example) with
  `VITE_API_BASE_URL=http://localhost:3000/api/v1`, and the tracked public
  [production defaults](../../frontend/.env.production) with
  `VITE_API_BASE_URL=/api/v1`. Updated the ignore rules to track these public
  configuration files while keeping private local overrides ignored. Added
  the normal Vite environment type declaration.
- Removed the old `WEATHER_API_PROXY` Vite configuration. Local development
  now uses the requested direct backend URL; production still uses Front Door
  and does not embed a Container Apps hostname. Updated the
  [frontend README](../../frontend/README.md) with environment setup, public
  build-time variable handling and credentialed local Origin/CORS requirements.
  The existing backend code was read only to confirm it has explicit
  credentialed CORS/preflight handling; backend files were not changed.
- Removed the direct Zod dependency and regenerated the frontend npm lockfile
  using `npm install` after the manifest change. **Zod remains only as a
  transitive development dependency of the existing React-hooks ESLint plugin
  (including its zod-validation-error helper).** It is not a production
  dependency, is not imported by frontend application code and is not in the
  application bundle. Removing that lint tooling was neither needed nor
  requested.
- Removed tests of the intentionally deleted response schemas. Retained
  transport/payload/CSRF and UI regressions; added tests for both configured
  base URLs, cookie inclusion, missing configuration and unchanged saved
  snapshot responses. No auth, forecast presentation or snapshot behavior was
  redesigned.

### Actual verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 43 tests across three files |
| `npm run build` | Passed without the old Zod annotation warnings |
| `npm run test:e2e` | Passed: 6 Chromium tests, compact/tablet/desktop |
| `npm ls zod --all` | Only the existing ESLint plugin's development dependency path |
| `npm ls zod --omit=dev` | Empty production tree; npm's expected empty-query exit status was 1 |

The production browser suite verifies same-origin API URLs and the existing
cookie/CSRF, forecast, save/reopen/remove and logout journeys under the
restrictive same-origin CSP. The production JS decreased from approximately
332 KB / 102 KB gzip to **244 KB / 77 KB gzip** (35 transformed modules instead
of 130); the UI stylesheet is unchanged. The static build still includes
`index.html`, `404.html` and hashed assets under `/assets`.

**Scope and remaining checks:** No contract, backend, infrastructure,
workflows, UI design or root local-integration files were changed. Git
status/diff and outside-scope/index fingerprints are checked against the
pre-edit baseline without staging. The requesting user's simplification is
approved; completed implementation/deployment acceptance remains pending.
For live local use, configure the backend's explicit frontend Origin allowlist
and cookie policy appropriately; no wildcard CORS or production security
exception is introduced here. Live backend/provider/deployment integration
was not tested by this frontend-only change. Frontend environment values are
public and must never contain secrets.
