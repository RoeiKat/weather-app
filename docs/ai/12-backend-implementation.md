# Backend implementation

**Current guidance:** The correction entry below supersedes this record's
historical framework, current-weather-only, and location-only persistence
choices. The current implementation is Express, free multi-day forecasts and
minimal saved forecast snapshots. Earlier evidence is retained as history.

## Session and authorization

- **Date:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements:** F-01 through F-04, S-01/S-02, N-02/N-04,
  accepted ADR-001 through ADR-006.
- **Problem:** Implement the contract-compliant Node.js/TypeScript backend,
  PostgreSQL persistence, OpenWeather adapter, secure sessions, tests and
  production container without changing frontend/infrastructure/shared contracts.
- **Prompt, faithful summary:** Read application rules, API contract, final
  architecture review and relevant accepted ADRs. Implement all specified backend
  capabilities, local and production database authentication, versioned migrations,
  separate migration command, non-root production container and graceful shutdown.
  Write only `backend/**` and this record. Do not stage or commit. Run
  lint/typecheck/tests/build and status/diff; report remaining issues.
  No secrets or personal data were included; examples and fixtures are synthetic.

The initial worktree was clean and no backend existed. Explicit implementation
authorization in this request supersedes historical documentation-only scope,
but does not silently approve unresolved application policies.

Read [application guidance](../app/AGENTS.md),
[API contract](../backend/API_CONTRACT.md),
[final architecture review](../architecture/final-architecture-review.md),
[requirements](../requirements.md), repository agent/Copilot instructions,
the [application planning record](10-application-foundation.md), the
[AI convention](README.md), and accepted individual ADRs.
Historical proposal labels were not treated as current architecture decisions.

## Explicit human policy approval

Before code, the agent surfaced the contract's human-review gate. The requesting
user selected **"Approve this baseline and implement (Recommended)"** in the
backend implementation conversation on 2026-10-07. The approved question specified:

- Node.js 24 LTS, Fastify, node-postgres.
- Argon2id with 64 MiB, three iterations, parallelism one.
- Authenticated sessions: 24-hour absolute, 30-minute idle lifetime.
- Anonymous sessions: 30-minute expiry; separately executable expired-state
  cleanup.
- 16 KiB request-body limit.
- PostgreSQL-backed limits: five login attempts per canonical email per
  15 minutes, ten registrations per session per hour, 60 weather requests per
  session per minute; no unvalidated forwarded-IP trust.
- Proposed contract behavior including `409 EMAIL_IN_USE`, canonical email and
  12-128 Unicode-code-point passwords, metric-only weather, and no preference cap.

**Final human decision:** Approved implementation and this explicit policy
baseline by the requesting user. This is not approval of production deployment,
spending, privacy compliance, capacity, or untested live Azure behavior.
Read-only shared documents were not rewritten or marked accepted.

## Implementation kept

- [Backend](../../backend/README.md): one Fastify API with logical validation,
  authentication, provider, persistence and runtime boundaries; no microservices
  or extra state services.
- All required `/api/v1` routes: health, register, login, logout, auth state,
  weather, list/save/delete preferences.
- Exact successful response fields, explicit contract error envelopes, opaque
  server-generated diagnostic IDs, no-store, input/media/body/query validation,
  allowlisted credentialed development CORS and security headers.
- PostgreSQL-backed opaque sessions with only identifier digests stored,
  independently generated CSRF tokens, exact Origin checks, auth-before-CSRF
  for protected writes, atomic login rotation, expiry and revocation.
  Registration does not change authentication. Unknown accounts still perform
  Argon2 verification; password work is bounded to four concurrent operations
  per process.
- Parameterized queries, account uniqueness, per-user preference access,
  four-decimal coordinate canonicalization, atomic duplicate preference saves
  preserving existing metadata, owner-scoped deletion and deterministic lists.
- [Versioned migration](../../backend/migrations/001_initial.sql) for accounts,
  sessions, preferences and shared rate limits; checksum ledger and
  transaction-scoped advisory locking.
- Separately executable migration and expired-state cleanup commands. API
  startup never runs migrations; database-only commands do not require
  OpenWeather secrets, Front Door ID, or browser-origin configuration.
- OpenWeather Direct Geocoding best-match resolution and Current Weather metric
  lookups. Only validated normalized responses are exposed; no provider URLs,
  raw objects, API keys, history, retries, cache, or stale-success fallback.
  Provider error bodies are cancelled, successful bodies bounded to 64 KiB,
  and one shared deadline covers resolution, weather retrieval and body reading.
- Production configuration fails closed unless it has Entra authentication,
  TLS hostname/chain verification, explicit user-assigned identity, HTTPS
  origins and the exact Front Door profile boundary. Managed Identity tokens
  are fetched for new physical connections and checked against actual expiry.
  API and migration Job identities/SQL grants remain separate.
- Exact single `X-Azure-FDID` validation before cookie parsing, body parsing,
  authentication or dependency work on every production main-listener path.
  No forwarded-IP trust or public health bypass.
- [Dockerfile](../../backend/Dockerfile) and
  [.dockerignore](../../backend/.dockerignore): Node 24 multi-stage build,
  production-only dependencies and compiled runtime/migrations, non-root user,
  configurable ports, direct Node entrypoint and readiness HEALTHCHECK.
  The same image runs `node dist/migrate.js` for the private migration Job.
- HTTP health is PostgreSQL-only and origin-restricted. Separate container-local
  TCP readiness listener closes on DB-check failure and recovers afterward;
  TCP startup/liveness use the API listener. Readiness has no business route
  and must not be exposed through ACA ingress.
- SIGTERM/SIGINT handlers register during startup, stop readiness checks,
  remove readiness, drain requests and close the pool, with a 15-second
  process shutdown deadline.
- [Local configuration example](../../backend/.env.example) and backend
  documentation cover CSRF, approved limits, PostgreSQL grants, Entra/PgBouncer
  ports, Key Vault-backed production provider keys, cleanup scheduling,
  migration orchestration, probes and known integration gates.

## Alternatives rejected / boundaries preserved

- No bearer tokens, browser credential storage, process-local production
  sessions or replica-local production abuse counters.
- No native-password production fallback, insecure TLS, assumed startup-token
  lifetime, automatic mutation retries or privileged runtime DDL.
- No direct browser OpenWeather calls, forwarded provider errors, provider key
  logging, geolocation permissions, lookup history or additional API endpoints.
- No Terraform, workflow, frontend, ADR or contract edits, Azure provisioning,
  live provider credentials/calls, staging or commits.
- No dependency-failure anonymous success, successful logout without revocation,
  fabricated weather fields or ignored unexpected errors.

## Verification

Commands ran from `backend` on Node.js **24.15.0**:

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed, strict TypeScript |
| `npm test` | **79 tests passed**, three files |
| `npm run build` | Passed; production TypeScript emitted |
| `npm audit` | Zero reported vulnerabilities |
| `npm audit --omit=dev` | Zero reported production vulnerabilities |
| `docker build --tag weather-backend-validation .\backend` from repository root | Blocked: Docker Desktop Linux engine pipe unavailable |
| `docker --context default build --tag weather-backend-validation .\backend` | Alternative engine also unavailable |
| `git status --short`, `git diff --stat`, `git diff --check` | Run; tracked diff clean, new files accounted for |
| `git diff --no-index --check -- NUL <backend-file>` for each untracked backend source/config/documentation file | Passed whitespace checks |

The VS Code test tool initially found no discovered tests; the repository's
Vitest runner was then used directly. Initial dependency installation exposed
advisories in the older selected test runner; updated Vitest and compatible
ESLint/typescript-eslint dependencies before final validation. No advisories
remain in the final lockfile audit.

Tests use an isolated **actual PostgreSQL 18.4** runtime from the development-only
`embedded-postgres` package, with SCRAM authentication and synthetic data.
No existing/local/Azure database is targeted. Test clusters are stopped and
their specific temporary directories removed after the suite.

Test evidence includes:

- Contract success/error fields, statuses, no-store and exact 16 KiB boundary.
- Password parameters, full 128-code-point multibyte password verification,
  canonical email, generic failed credentials and concurrent registrations.
- Anonymous bootstrap, session reuse and identifier hashing, production cookie
  attributes, both expiry types, absolute-lifetime cap, logout/replay rejection,
  account switching and registration preserving current login.
- Atomic concurrent login rotation and state reuse by a second API instance.
- Origin/CSRF enforcement, protected auth-before-CSRF and cross-session token
  rejection; absent/wrong/duplicate/comma-joined FDID rejection before DB work.
- Per-user isolation, shared-coordinate saves across users, concurrent
  preference duplicates, metadata preservation, owner-only delete and ordering.
- Exact route thresholds for registration/weather and login; durable counters
  across two Store instances; integer Retry-After and counter-window expiry.
- Weather normalization, condition mapping, nullable country, negative zero,
  no-match, upstream quota/service/error translation, malformed/missing fields,
  invalid country/humidity/wind/timestamp/text, malformed JSON, oversized
  provider bodies, timeout and shared two-call deadline.
- Weather outages leaving preferences available; DB failures yielding 503
  rather than anonymous success.
- Migration idempotency/checksum rejection and separate executable migration/
  cleanup command success without provider secrets.
- Identity-token callback renewal/expiry rejection and TLS settings using
  controlled token mocks, not Azure credentials.
- Actual HTTP and TCP serving, DB-failure readiness closure/recovery, graceful
  in-flight request draining, and readiness removal on close.
- A separate Node entrypoint process serves actual HTTP, invokes its registered
  SIGTERM handler through `process.emit('SIGTERM')`, and exits cleanly. This
  verifies the handler, not Linux/ACA delivery of an OS signal.

The first route suite had two test-assumption failures: Argon2's encoded
parameter ordering, and a DB-failure mock that covered pooled queries but not
the pool-connect path. Corrected tests, not production behavior, and reran.
Final lint/types/tests/build/audit all pass.

## Worktree and write-scope evidence

All edits performed by this agent are under `backend/**` or this exact record.
No files were staged or committed. During validation, another task created
`frontend/**` and `docs/ai/11-frontend-implementation.md`; those concurrent
untracked changes were observed and left untouched. Therefore the **whole**
worktree is not backend-only, but this task's writes are within its authorized
scope. No shared contract, architecture, ADR, infrastructure or workflow file
was changed by this agent.

## Remaining validation / operational gates

1. **Docker/ACA:** A Docker CLI exists but its engine is not running. The image
   cannot yet be built/run/scanned here. Verify Linux native Argon2 loading,
   production-only image contents, non-root execution, configurable PORT,
   OS SIGTERM propagation and ACA probe/termination behavior with a running
   engine. No image/deployment success is claimed.
2. **Azure SQL/identity:** Prove actual private DNS/TLS trust, Entra principal
   mapping, least-privilege API/migration grants, identity selection, token
   refresh/reconnects through PgBouncer, failover and aggregate pool capacity
   in the accepted environment. Controlled tests do not establish these.
3. **Ingress:** Infrastructure must implement and maintain ADR-005's nonempty
   backend IPv4 ingress allowlist in addition to the app FDID check. Validate
   intended-profile probes and direct/forged/other-profile rejection across
   all revisions/hostnames. Never externally expose the readiness port.
4. **Provider:** Confirm account-specific Current Weather/Geocoding entitlement,
   quotas and terms; supply the actual key through a Key Vault-backed ACA
   reference. Frontend must provide required OpenWeather attribution.
   No live account/provider-plan behavior or subscription was verified.
5. **Operations/privacy:** Schedule the private expired-state cleanup command,
   tune/load-test approved limits and hashing capacity, configure edge rate
   controls (session quotas alone are resettable), and approve account/location
   retention/deletion/disclosures. Per-email throttling can also deny login to
   a targeted account. No privacy-compliance/HA/latency claim is made.

Official references checked for adapter/identity context:
[OpenWeather Current Weather](https://openweathermap.org/api/current),
[Geocoding API](https://openweathermap.org/api/geocoding-api),
[Microsoft managed-identity PostgreSQL documentation](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity).
The Azure Container Apps tool was consulted for available operations without
accessing/provisioning resources; deployment conventions follow the accepted ADRs.

## Foundation correction implementation, 2026-10-07

### Human direction and scope

- **Tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Prompt, faithful summary:** Adapt the existing backend rather than restart
  it. Reread the corrected application rules, API contract and foundation record.
  Require Express/TypeScript, normal `tsc` production compilation, the free
  OpenWeather five-day / three-hour forecast, and user-owned minimal snapshots
  of a selected forecast point. Reopening fetches fresh forecasts without
  overwriting the original snapshot. Preserve useful authentication,
  PostgreSQL, migrations, tests and Docker work. Write only `backend/**` and
  this record; no foundation changes, staging or commits.
- Read [corrected application rules](../app/AGENTS.md),
  [corrected API contract](../backend/API_CONTRACT.md) and the final correction/
  saved-snapshot entries in [the foundation record](10-application-foundation.md).
  Existing implementation and earlier approval evidence were examined before
  editing. The previously approved session, hashing, body and abuse limits are
  retained; the user's Express/forecast correction overrides the old stack/
  current-weather selection.
- **Explicit legacy-data decision:** Before writing the upgrade migration,
  explained that old location-only rows have no truthful forecast snapshot.
  The user selected **"Retain legacy rows unchanged, but expose only complete
  forecast snapshots through the corrected API (Recommended)"** in this
  correction conversation. No old time, temperature or description was invented.
- **Final human decision:** The correction and legacy disposition are Approved
  by the requesting user's explicit directions on 2026-10-07. Deployment,
  production compatibility acceptance, live provider/identity access, privacy
  lifecycle and spend remain separate gates.

### Exactly what changed

1. [Express handlers](../../backend/src/app.ts) replace the previous transport
   framework, preserving routes, auth/CSRF ordering, session rotation and cookie
   settings, exact origin restrictions, request IDs, error envelopes, body/media
   validation, no-store, CORS, rate limits and business behavior.
   Express 5 handles rejected async handlers; the existing sanitizing error
   policy now maps Express JSON-parser errors. Its millisecond cookie Max-Age
   API is used correctly. Proxy trust, automatic HEAD fallback, ETags and
   framework disclosure are disabled.
2. [Runtime](../../backend/src/runtime.ts) now owns Node's HTTP server wrapping
   Express, with the existing request/socket deadlines and graceful close.
   PostgreSQL pools, local password versus production Entra configuration,
   early FDID boundary, separate TCP readiness, configurable ports and entrypoint
   SIGTERM/SIGINT handling are preserved.
3. [Provider adapter](../../backend/src/weather.ts) calls the free forecast
   endpoint `/data/2.5/forecast`, not current weather, after existing best-match
   geocoding when appropriate. It requests the full horizon with no `cnt`
   restriction and no paid product. Returns exactly `location`, `units`,
   `fetchedAt`, `timezoneOffsetSeconds` and normalized `forecast` points.
   Validates every supplied entry before filtering elapsed points, sorts valid
   times, rejects duplicates/empty future data, and keeps all available future
   points. UTC offset and required temperatures/descriptions are validated.
   Provider error mappings, body cap, shared deadline and no-cache behavior
   remain intact. No raw provider response is exposed or stored.
4. [Validation](../../backend/src/validation.ts) requires exact location and
   snapshot objects. Snapshot is only valid UTC `forecastAt`, finite Celsius
   temperature and nonempty plain-text description of at most 200 characters.
   Canonical timestamp representations and coordinates drive duplicate identity.
   Past snapshots remain valid saved data; no client ownership, IDs, creation
   time, raw payload, signing scheme or additional provider verification is
   accepted/introduced.
5. [Persistence](../../backend/src/store.ts) saves and returns `snapshot` plus
   the existing ID/location/server-created time. Atomic uniqueness is owner +
   canonical coordinates + forecast time. Different times may be saved,
   duplicates preserve the original entire snapshot/location/creation time,
   lists retain creation-time/ID order, and deletes remain owner-scoped.
   Weather requests never update saved data or read snapshots as fresh weather.
6. [Migration 002](../../backend/migrations/002_forecast_snapshots.sql) adds
   minimal snapshot columns and integrity checks, changes forecast-selection
   uniqueness, and preserves legacy rows with NULL snapshot columns plus a
   legacy-location unique index. New API reads/deletes filter out legacy rows,
   as expressly approved. Original migration 001/checksums, users and sessions
   were not modified. Migration execution is still separate from API startup.
7. Removed old framework/plugin dependencies/imports/types/configuration.
   Removed Vitest and its configuration because its dependency tree includes
   Vite. Tests now use **Node's built-in test runner**, existing Jest-compatible
   `expect`/`jest-mock` assertions/mocks, and Supertest for actual Express HTTP.
   Small table-test/request helpers preserve existing coverage; no service/
   domain/repository architecture, cache, queue or event system was added.
   A full Jest runner was briefly evaluated but brought development advisories
   and unnecessary transform dependencies; rejected in favor of Node's runner
   and the much smaller standalone assertion/mock libraries.
8. [Package configuration](../../backend/package.json), lockfile, test/typecheck
   inputs and [backend documentation](../../backend/README.md) were updated.
   Production still compiles with `tsc`; `tsx` is development/test-only.
   [Dockerfile](../../backend/Dockerfile) remains unchanged: its existing build
   now emits the Express API, with production-only dependencies, non-root user,
   direct Node command and migration files. [.dockerignore](../../backend/.dockerignore)
   removes the obsolete test configuration entry. No application process was
   restarted; runtime validation uses isolated ephemeral test servers.

### Correction verification

Executed on Node.js 24.15.0 from `backend`:

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed, strict TypeScript |
| `npm test` | **91 passed**, four suites in three test files |
| `npm run build` | Passed; Express production output compiled with `tsc` |
| `npm audit` | Zero reported vulnerabilities |

The existing authentication, security, concurrency, ownership, PostgreSQL,
token-callback, health/readiness, migration/cleanup and signal-handler tests
were adapted, not discarded. HTTP route tests now exercise Express over actual
Supertest-managed sockets. Real PostgreSQL remains isolated and synthetic.

New/corrected tests verify:

- Forty normalized, three-hour points spanning the full forecast horizon,
  correct provider endpoint/metric parameters and no `cnt` truncation.
- Successful retrieval time versus forecast valid times, city UTC offset,
  strictly increasing order, duplicate rejection, required-field failure,
  invalid-entry rejection even if its timestamp is elapsed, and explicit
  failure when no future point remains.
- Saved minimal fields and user association, mandatory snapshot validation,
  missing/invalid UTC time, invalid calendar dates, wrong/nullable temperature,
  empty/oversized/non-text description, raw objects and client ownership/time.
- Different forecast times for the same coordinates, canonical-time duplicate
  detection and immutable original snapshots during duplicate saves.
- Reopening an explicitly past saved point twice produces two new provider
  calls and changed fresh forecast temperatures while persisted snapshots and
  creation times remain byte-for-byte equivalent at the API level.
- Upgrading a constructed original-schema database preserves its account,
  password hash, authenticated session and legacy location row; the legacy row
  is not exposed/deleted by the new API, a complete snapshot can coexist at the
  same coordinates, and rerunning both migrations is idempotent.
- Actual Express HTTP serving, TCP readiness closure/recovery on DB failure,
  in-flight request draining and clean entrypoint SIGTERM-handler invocation.

During adaptation, two preserved preference tests initially failed because
their old payloads lacked the now-required snapshot. Corrected those fixtures
and reran all tests. No relaxation of the corrected contract was made.

### Scope and remaining issues

- Foundation/design changes and frontend/its AI record already existed at the
  start of this correction. They were read-only and not edited by this agent.
  All implementation edits are under `backend/**` or this exact AI record;
  nothing was staged or committed. Final status/diff and removed-dependency
  verification are recorded in the correction conversation.
- The old backend's location-only `ON CONFLICT (user_id, latitude, longitude)`
  is incompatible with the replacement uniqueness rule. This contract revision
  requires coordinated frontend/backend cutover and stopping legacy preference
  writes before migration 002; do not run a mixed old/new writer deployment or
  claim rolling migration compatibility. Legacy row recovery/disposition is an
  explicit private operations task, not an additional API.
- Prior Docker-engine, live ACA/SQL/Entra/PgBouncer, ingress allowlist, OS-signal
  delivery, account key activation/quota/attribution and operational privacy/
  cleanup/load-validation limitations remain. The provider is now the free
  forecast/Geocoding product, not a current-weather or paid daily subscription.
  The official [forecast](https://openweathermap.org/api/forecast5) and
  [pricing](https://openweathermap.org/price) pages were consulted; no live key,
  provider call, subscription purchase or Azure provisioning was performed.

  ### Final correction delivery checks

  - `npm ls fastify @fastify/cookie vite vitest @vitest/mocker --all` returned an
    empty dependency tree. Source/configuration/lockfile searches found no old
    framework, backend Vite/Vitest, old current-weather URL/response type, or
    transport-injection references. Historical framework names remain only in
    this AI record as superseded evidence.
  - `npm audit --omit=dev` also reports zero production vulnerabilities.
  - Loaded `dist/app.js` with normal Node (no development loader), instantiated
    the compiled Express application using synthetic configuration, verified
    its callable Express runtime and disabled framework disclosure, and closed
    its unused DB pool. This did not start an application server or contact any
    external service.
  - Reattempted `docker build --tag weather-backend-validation .\backend`:
    Docker Desktop's Linux engine pipe is still unavailable. Container build/run
    verification remains blocked; no image success is claimed.
  - Ran final `git status --short`, `git diff --stat`, `git diff --check` and
    cached-name checks, plus whitespace checks for all **33** owned untracked
    files. No files were staged or committed. Removed the temporary refactoring
    script and the empty test PostgreSQL directory; isolated test clusters had
    already been stopped/deleted by tests.
  - The all-read-only aggregate fingerprint changed during this task because
    concurrent frontend work updated its source/tests/documentation and AI record.
    Read-only file timestamps identified those concurrent updates; foundation/
    design documents were last changed before this correction began. Therefore
    a globally unchanged worktree/fingerprint is **not** claimed. Every edit
    performed by this agent remained in `backend/**` or this AI record, and
    concurrent frontend/foundation work was preserved without edits.
