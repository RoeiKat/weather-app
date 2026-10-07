# Application foundation planning

**Current guidance:** The multi-day forecast and simple Express/tooling correction
supersedes the earlier current-weather-only assumption. The final saved-snapshot
clarification below supersedes location-only persistence and restores creation
timestamps. Earlier session entries remain historical evidence, not competing
implementation instructions.

## Session and scope

- **Date:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Problem:** Establish shared application instructions, an API contract, and a
  design specification for future frontend/backend implementation agents.
- **Prompt, faithful summary:** Read requirements, accepted ADRs, project
  instructions, and architecture docs. Write only
  [application rules](../app/AGENTS.md),
  [API contract](../backend/API_CONTRACT.md),
  [design system](../design/DESIGN_SYSTEM.md), and this AI record. Define only
  required application capabilities. Do not implement code, change ADRs,
  infrastructure, workflows, Terraform, or other files, stage, or commit.
  Verify the four-file boundary before finishing. No sensitive prompt content
  was included; no redactions were necessary.

## Sources and existing architecture

Read the root [agent contract](../../AGENTS.md),
[Copilot instructions](../../.github/copilot-instructions.md),
[requirements](../requirements.md),
[architecture alternatives](../architecture/alternatives.md),
[ADR convention](../adr/README.md),
[design foundation](../design/README.md), and
[AI convention](README.md).

During final verification, concurrently created
[architecture review](../architecture/final-architecture-review.md) and its
[AI record](09-final-architecture-review.md) appeared. The user explicitly
directed preservation of that concurrent work and separate verification of
this task's four files. Read the review for alignment: it retains the accepted
architecture, requires replica-safe sessions, and leaves frontend delivery,
browser security integration, and runtime validation pending. Neither concurrent
document was modified by this task.

The individual accepted ADRs establish:

| Record | Current accepted direction respected by this plan |
| --- | --- |
| [ADR-001](../adr/ADR-001-compute-platform.md) | Container Apps, conventional Node.js/TypeScript API; sessions survive replica turnover |
| [ADR-002](../adr/ADR-002-azure-region.md) | Sweden Central, single primary region, instance/AZ resilience rather than regional DR |
| [ADR-003](../adr/ADR-003-database.md) | PostgreSQL Flexible Server, production cross-AZ HA, private connectivity, bounded pooling, adaptive end-user password hashes |
| [ADR-004](../adr/ADR-004-global-entry-point.md) | Front Door Standard, restricted public ACA origin, API uncached by default |
| [ADR-005](../adr/ADR-005-network-security.md) | Ingress source restrictions plus earliest backend Front Door ID check; private database, workload identity, Key Vault secrets |
| [ADR-006](../adr/ADR-006-cicd-strategy.md) | GitHub Actions/OIDC, infrastructure/release separation, application-owned migrations |

Some requirements/index/instruction/alternative summaries retain earlier
Open/Proposed labels. This plan uses the individual ADRs' current human-approved
scope; it does not repair read-only summaries, reopen decisions, or infer that
documented provider capabilities were deployed/tested.

## Major application decisions

- React + TypeScript frontend, Node.js + TypeScript + Express backend, PostgreSQL
  persistence. Use `tsc` for backend compilation, optional `tsx` for development,
  and Vite only for the frontend. Do not independently substitute these choices.
- Frontend uses only our backend for application data/authentication;
  OpenWeather and privileged credentials stay server-side.
- One simple application with logical boundaries, not microservices.
- The API contract is the integration source of truth. Neither future agent may
  independently change routes/payloads; coordinated human-reviewed contract
  changes precede implementation.
- The application instructions are an explicit onboarding reference. Their
  documentation-directory location does not automatically apply them to future
  source files, so both implementation agents must be told to read them.

## API contract decisions and rationale

- `/api/v1` REST-oriented JSON routes cover health, registration, login,
  logout/session state, multi-day forecasts, and saved locations only.
- **Human-confirmed:** Opaque server-side sessions in a secure HttpOnly cookie,
  with CSRF protection. User selected this recommendation over bearer tokens.
  PostgreSQL-backed session persistence is a proposed simple way to meet
  replica-safe state without another state service.
- Anonymous session bootstrap supplies a session-bound CSRF token from the
  existing session-state endpoint; unsafe requests also check Origin.
  Login rotates session/token; logout revokes server state. Security lifetimes,
  cleanup and algorithm/parameters remain pending, not invented defaults.
- Registration does not automatically log in. Proposed email canonicalization,
  password length policy, and `409 EMAIL_IN_USE` behavior are explicit so
  frontend/backend do not diverge. Email-existence disclosure needs review.
- **Corrected by the user:** Free OpenWeather five-day / three-hour forecast by
  city with optional country code, or saved coordinates. The earlier
  current-weather-only choice is superseded; metric units remain.
- Provider-independent fields include resolved location, retrieval time,
  city UTC offset, and ordered forecast times/Celsius temperatures/conditions.
  No direct provider URLs/raw payloads. Required-field failure is an error,
  not fabricated zero values.
- Best-match city resolution avoids a separate autocomplete/geocoding API.
  Display resolved country/coordinates and allow query refinement; ambiguous
  city behavior and rounding remain proposed policies to review.
- Saved locations are per-user. Four-decimal canonical coordinates support
  duplicate detection/data minimization; this does not anonymize location data.
  Duplicate saves return the existing preference; deletion hides other users'
  records with `404`. Store preference ID, user ownership, location, selected
  forecast time, minimal temperature/description snapshot, and creation time.
  Different forecast times for one city may be saved. Saving/listing/deleting
  do not depend on OpenWeather; selecting a saved item fetches a fresh forecast.
- A single sanitized error envelope and explicit statuses cover validation,
  authentication/CSRF, persistence, throttling, and provider failures.
  Edge/network failures may not share that envelope.
- Health checks bounded API/database readiness, never provider availability.
  Container-local probes remain separate under ADR-005.
- No public API caching, stale-success fallback, automatic forecast history, lookup history,
  location permissions, or extra account/profile operations.

## Design-system decisions

- Proposed calm light dashboard, neutral surfaces, restrained blue accent,
  system fonts, explicit typography/spacing tokens, and consistent controls.
- Single-column compact layout and a simple responsive day-card grid on wide
  screens; the earlier detailed layout system is no longer required.
- Public search with authenticated saving, separate login/register journeys,
  metric multi-day forecast rows grouped by the city's offset/date, retrieval
  timestamps, and local condition icons without provider image requests.
- Explicit loading, empty, validation, expired-session, provider/quota, and
  transport-error states. Preserve confirmed data on failure; no fake saves,
  empty-list fallbacks, or stale weather masquerading as fresh.
- WCAG 2.2 AA proposed target: keyboard/semantic controls, visible focus,
  readable contrast, 44 px targets, screen-reader status feedback, zoom/reflow,
  reduced motion, and reusable presentation patterns.
- No component library, external fonts, dark theme, map, or prototype required.
  Visual direction and accessibility target remain pending human approval.

## Assumptions and unresolved review

These are planning proposals, not newly accepted ADRs or assignment quotations:

- Frontend and API share one public origin; hosting/route integration is not
  selected. Cross-site hosting would require coordinated session/CORS review.
- English interface, metric-only display, public weather lookup, and a small
  unpaginated preference list without an initial count cap.
- Local email/password accounts, PostgreSQL sessions, registration requiring
  later login, and the email/password rules described in the contract.
- Best-match city search, four-decimal coordinate normalization, stable
  preference ordering, and create-or-return-existing duplicate semantics.
- Publish/approve request body-size limit, session absolute/idle/anonymous
  lifetimes, abuse thresholds, retention/deletion policy, password-hashing
  algorithm/parameters, and email-existence disclosure before implementation.
- The free five-day / three-hour product is selected; verify key entitlement,
  geographic matching behavior, attribution, mapping, and timeout/retry budgets.
  Do not add a paid product or caching layer.
- Actual deployment topology, quotas/capacity, latency/SLO/RTO/RPO, and privacy
  compliance are not validated by planning documents.

## Intentionally left for implementation agents

After explicit implementation authorization and required human approvals:

- Frontend: routing/state choices, API client, reusable components/styles,
  accessible interactions, validation UX, race-safe searches, session lifecycle,
  and responsive/keyboard/visual tests against the shared references.
- Backend: Express implementation and driver selection, schema and versioned migrations,
  hashing/session/CSRF implementation, atomic uniqueness and authorization,
  provider adapter, bounded pooling/deadlines, sanitized logging, abuse controls,
  health checks, and contract/security/persistence tests.
- Both: agree pending policies with the human owner, coordinate exact DTOs and
  errors, test integration and backward compatibility, update related docs,
  and record significant AI assistance. Do not assume permission to implement
  infrastructure or delivery configuration.

## Initial session verification and approval (historical)

- Initial worktree inspection was clean: no tracked changes or untracked files.
- Reviewed requirements and accepted individual ADRs against the proposed
  application boundaries. Only the four user-owned documentation files were
  created by this task.
- The initial exact-four-file worktree check detected two concurrent untracked
  review documents, so a whole-worktree "only four files changed" claim would
  be inaccurate. After explicit user confirmation, the scoped check passed:
  exactly four task-owned paths plus the two acknowledged concurrent paths,
  no staged changes, 31 valid local links and four valid JSON examples in the
  owned documents, and clean whitespace. The added review links were checked
  in the final verification.
- No application code, scaffolding, dependencies, Terraform, workflows, or
  resources were created. No files were staged or committed.
- No runtime/build/provider/visual/accessibility/failover tests were possible
  or claimed; this is documentation-only work. No external research or live
  cloud calls were needed to restate the existing accepted architecture.
- **Accepted/rejected:** User explicitly selected cookie sessions with CSRF
  rather than bearer tokens, and metric-only current weather rather than
  metric/imperial selection. Other recommendations were retained as proposals.
- **Final human decision:** **Pending** review of the full API/design/application
  foundation. Owner: requesting user. The two explicit choices above were
  confirmed on 2026-10-07 in this session's clarification responses; the task
  authorized document creation, not implementation or blanket design approval.

## Human clarification: OpenWeather provider boundary, 2026-10-07

- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** Specify OpenWeather from
  <https://openweathermap.org/> as the external weather-data provider. Only the
  backend may call it; its API key stays in secure server-side configuration /
  Key Vault in production. The frontend calls only our backend weather endpoint.
  Normalize provider data into our response contract, keep raw provider schemas
  and provider-specific URLs/parameters/fields internal, and translate provider
  errors, rate limits, and timeouts into standard application errors. Update
  only the application rules, API contract, and this existing AI record; no
  application code or other file changes.
- **Changes:** Made the provider identity and trust boundary explicit in
  [application rules](../app/AGENTS.md) and
  [API contract](../backend/API_CONTRACT.md). Kept existing routes, requests,
  success payloads, and statuses. Explicitly mapped upstream rate limits/quota
  to `503 WEATHER_UNAVAILABLE`, timeouts to `504 WEATHER_TIMEOUT`, other
  provider failures to `502 WEATHER_PROVIDER_ERROR`, and genuine no-match to
  `404 LOCATION_NOT_FOUND`; application throttling remains `429 RATE_LIMITED`.
- **Verification scope:** Documentation consistency, links/JSON/whitespace,
  and file-boundary checks; no runtime or live OpenWeather compatibility tests.
  The design system does not need changes for this backend boundary.
- **Final human decision:** **Confirmed** for this clarification by the user's
  explicit instruction on 2026-10-07. It does not approve the remaining proposed
  foundation policies, select an OpenWeather product/plan, or authorize
  implementation, infrastructure changes, staging, or commits.
- **Follow-up:** The backend implementation agent must verify the chosen
  OpenWeather product/plan, adapter mapping, attribution/terms, deadlines and
  quotas, and test normalized success/failure behavior without exposing provider
  credentials or raw schemas to the frontend.

## Human correction: multi-day forecast and simple implementation, 2026-10-07

Historical note: This correction remains current for forecasts/Express/tooling,
but its location-only persistence and removal of `createdAt` are superseded by
the final clarification below.

- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** Correct the original assignment mismatch: use
  the free OpenWeather API to retrieve/display forecasts for the coming days
  for a selected city. Save only the user's city/location selection in
  PostgreSQL, display saved selections after login, and fetch fresh forecasts
  whenever one is selected. Require React/TypeScript, Node/TypeScript/Express,
  normal `tsc` backend compilation, optional `tsx`, and frontend-only Vite.
  Do not use another backend framework, unnecessary abstractions/services,
  extra frontend frameworks, caching layers, or unrequested features. Change
  only the four owned references; no implementation, staging, or commits.
- **Correction:** Current-weather-only guidance was incorrect for the assignment
  and is superseded. Retained metric units, existing authentication/security
  behavior, error mappings, and the `GET /api/v1/weather` route; that route now
  returns normalized multi-day `ForecastResponse`, not `WeatherResponse`.
  Future source changes require a separate authorized implementation task;
  existing frontend/backend code was left untouched.
- **Product evidence:** On 2026-10-07, the official
  [pricing page](https://openweathermap.org/price) listed "Free for everyone"
  with the three-hour forecast for five days and Geocoding API. The
  [forecast documentation](https://openweathermap.org/api/forecast5) describes
  the five-day / three-hour product and location UTC offset. No paid daily
  product or One Call subscription is needed for this design. Subscription/key
  activation, live responses, terms and quotas still require delivery checks.
  A search-tool attempt failed; evidence was obtained directly from official
  pages instead, without sending repository contents or credentials.
- **Contract:** Return ordered forecast points with valid time, Celsius
  temperature, and normalized condition, plus resolved location, retrieval
  time, and location UTC offset. Do not add a daily aggregation service or leak
  raw provider fields. Cover the full supplied horizon, acknowledging partial
  local calendar days. Every saved-item selection makes a new provider request.
- **Minimal persistence:** Users, agreed session state, and saved preferences.
  Preferences need only ID, owning user ID, and location name/country/coordinates.
  Removed `createdAt` from the preference contract; order by ID. Do not persist
  forecasts/history or client-supplied ownership.
- **Express/tooling decision:** Express is required; Fastify, NestJS, Hono,
  and other replacements are not allowed. Compile backend TypeScript with `tsc`;
  `tsx` is acceptable for development. Vite is acceptable only for the frontend.
  Neither agent may independently replace these decisions.
- **Anti-overengineering:** This is a small assignment application. Prefer
  straightforward handlers, small reusable helpers/components, direct
  parameterized persistence, and a provider adapter. No unnecessary repository
  or service layers, domain/event abstractions, queues, extra services, state/UI
  frameworks, or caching layers. Retain essential authentication, validation,
  user isolation, secret protection, and explicit errors.
- **Design correction:** Shortened the design guide to a polished responsive
  day-card view with local forecast times, temperatures/conditions, saved-city
  rows, and essential loading/error/accessibility behavior. No charts, large
  design framework, or extra weather features.
- **Verification scope:** Compare out-of-scope repository content and Git index
  fingerprints with the pre-edit baseline; check owned documentation links,
  JSON examples, whitespace, forecast shape, and removal of active
  current-weather-only guidance. Existing implementation work is preserved.
  No runtime/build/provider/visual tests are claimed by this documentation task.
- **Checks passed:** Exactly the four owned tracked documents changed; the
  out-of-scope content fingerprint and Git index matched the pre-edit baseline.
  All 34 local links and four JSON examples were valid, whitespace was clean,
  and example-shape checks verified normalized points spanning multiple local
  dates and preferences containing only ID/location. Existing untracked
  implementation files were not added, modified, staged, or removed.
- **Final human decision:** **Confirmed** for the forecast requirement,
  Express/simple tooling, and anti-overengineering constraints by the user's
  explicit instruction on 2026-10-07. Other proposed security policies/visual
  details remain pending review. No implementation or infrastructure permission
  is inferred.

## Final clarification: saved forecast snapshots, 2026-10-07

- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** PostgreSQL must store the forecast the user
  chose to save, not only a city/location. Keep a simple saved item with user
  association, location, selected forecast date/time, minimal temperature/
  description snapshot, and creation timestamp. Do not store raw OpenWeather
  responses. Reopening still uses the location to fetch a fresh multi-day
  forecast. Update only the four owned references; no code, staging, or commits.
- **Correction:** Removed active location-only persistence guidance. The
  existing preference routes now accept `location` plus a `snapshot` containing
  `forecastAt`, `temperatureC`, and `description`, and return ID, location,
  snapshot, and server-assigned `createdAt`. User ownership comes only from the
  authenticated session and is persisted in PostgreSQL, not accepted from clients.
- **Simple behavior:** Save one selected normalized forecast point, not a full
  forecast array or raw provider object. Validate the submitted fields; no
  extra provider call, signing scheme, service, or history mechanism is needed.
  These are user-submitted saved selections, not provider-attested evidence.
  Deduplicate by user + canonical coordinates + selected forecast time.
  Different times for the same city can be saved; duplicates return the original
  snapshot and creation time. List by creation time then ID.
- **Fresh reopening:** Opening any saved item calls the existing backend weather
  endpoint with its coordinates and fetches a fresh forecast from OpenWeather.
  Never use the snapshot as a fresh response or overwrite it on reopening.
  Past selected forecast times do not prevent fetching upcoming city forecasts.
- **UI alignment:** Each forecast point has a Save forecast action. Saved rows
  show selected time, temperature/description, and creation time with an explicit
  Saved forecast snapshot label; opening fresh data is a separate action.
  No snapshot comparison dashboard or update workflow.
- **Unchanged:** Small React/TypeScript frontend, Express/TypeScript backend
  with `tsc`/optional `tsx`, frontend-only Vite, free OpenWeather product,
  server-only credentials, auth/CSRF, user isolation, standard errors, and
  anti-overengineering requirements.
- **Verification scope:** Check snapshot request/response examples, minimal
  fields, documentation consistency/links/whitespace, and unchanged out-of-scope
  content/Git index against the baseline. No runtime/provider tests are claimed.
- **Final human decision:** **Confirmed** for selected-snapshot persistence by
  the user's explicit instruction on 2026-10-07. This supersedes only the earlier
  location-only saving assumption, not the fresh multi-day forecast behavior.
  Other proposed policies/design details remain pending review; implementation
  and infrastructure changes are not authorized.
