# Weather backend

Node.js 24 LTS, TypeScript, Express and PostgreSQL. Production compilation uses
`tsc`; development/tests use `tsx`. No backend Vite tooling. The read-only
[API contract](../docs/backend/API_CONTRACT.md) defines the public interface.
No provider payloads, credentials, session identifiers or hashes are returned.

## Local development

1. Use Node.js 24 and a local PostgreSQL database (PostgreSQL 17+ recommended).
2. In this directory, run `npm ci` and copy `.env.example` to `.env`.
   Configure your local database credentials and OpenWeather key.
3. Run `npm run migrate:dev`, then `npm run dev`.
4. Allow the frontend's **exact origin**, normally `http://localhost:5173`.
   The API defaults to port 3000. Local CORS is credentialed and allowlisted;
   production is designed for one HTTPS origin through Front Door.

For example, create local PostgreSQL with Docker using synthetic credentials:

```powershell
docker run --name weather-local-db -e POSTGRES_USER=weather_local -e POSTGRES_PASSWORD=local-only-change-me -e POSTGRES_DB=weather -p 127.0.0.1:5432:5432 -d postgres:17
```

Do not reuse that password outside your own development machine. Do not commit
`.env`. There is no production native-password fallback.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Tests provision an isolated, actual PostgreSQL instance under `.test-postgres`
using a development-only embedded runtime, synthetic accounts, and controlled
OpenWeather fixtures, Node's built-in test runner, Jest assertions/mocks and
Supertest HTTP requests. They do not call Azure or OpenWeather. The runtime is not
included in the production image. Do not point tests at a shared database.

## Session and CSRF protocol

Call `GET /api/v1/auth/session` with credentials before unsafe operations. Keep
its `csrfToken` in memory and send it as `X-CSRF-Token` along with the exact
allowlisted `Origin` on every POST/DELETE. Protected writes authenticate first,
then check CSRF. Session bootstrap is the only auth-state fallback; a database
failure is an explicit 503, never anonymous success.

Production uses `__Host-weather-session`, Secure, HttpOnly, SameSite=Lax,
Path=/, no Domain. Development uses `weather-session` without Secure for local
HTTP. Session identifiers have 256 random bits; PostgreSQL stores only their
SHA-256 digests. CSRF tokens are separately generated session-bound random
values. Login atomically revokes the old session and rotates both values.
Registration never changes authentication. Logout revokes before clearing the
cookie. Cookies are cleared only after successful revocation.

Human-approved policies recorded in [the implementation record](../docs/ai/12-backend-implementation.md):

- Authenticated absolute lifetime: 24 hours; idle lifetime: 30 minutes, capped
  by absolute expiry. Anonymous absolute/idle lifetime: 30 minutes.
- Argon2id: 64 MiB, three iterations, parallelism one, independently salted.
  Passwords are 12-128 Unicode code points with no trimming/normalization.
  Unknown accounts use a dummy Argon2 verification. Four concurrent hash/verify
  operations per process limit memory pressure; excess gets 429/Retry-After.
- JSON body limit: **16 KiB**. Unknown fields, repeated scalar query fields,
  invalid media types, malformed JSON and unexpected bodies are rejected.
- Durable fixed-window abuse limits: five login attempts per canonical email
  per 15 minutes (including successful attempts), ten registrations per session
  per hour, 60 weather requests per session per minute. 429 has integer
  Retry-After. These do not rely on untrusted proxy headers.

Schedule `node dist/cleanup.js` (or `npm run cleanup`) every 15 minutes using a
private operational Job; expired rows are unusable immediately even before
cleanup. Cleanup requires DELETE on sessions/rate_limits, not DDL or provider
secrets. New anonymous sessions can circumvent session-scoped quotas: these
backend controls complement, not replace, ADR-005's edge source-IP abuse rules.
Account-based limits can be used for denial-of-login; tune edge controls and
load-test the approved limits before production.

## OpenWeather

Uses the Direct Geocoding API `/geo/1.0/direct?limit=1` for city best-match
resolution, followed by the **free five-day / three-hour forecast**
`/data/2.5/forecast` with coordinates, `units=metric` and English descriptions.
Coordinate lookups use the same forecast endpoint directly. No `cnt` restriction,
paid daily product, One Call subscription, or daily aggregation is used.
Responses contain only location, metric units, successful retrieval time,
provider city UTC offset and all available future forecast points, sorted by
unique increasing valid time. Each point contains only its time, temperature
and normalized condition. Validate every entry before removing elapsed points;
invalid or duplicate timestamps fail rather than being silently discarded.
One shared deadline (default five seconds) covers both city calls and
body reading; provider bodies are capped at 64 KiB. No caching, retries,
lookup-history persistence or stale-success responses.

Provider 404/empty geocoding maps to LOCATION_NOT_FOUND; 429/503 maps to
WEATHER_UNAVAILABLE, timeout to WEATHER_TIMEOUT, all other failures or malformed
required data to WEATHER_PROVIDER_ERROR. Only validated normalized fields are
returned. Retry-After is forwarded only when it is a known integer duration.
Names/descriptions are text, not HTML. Country codes use the ISO list; coordinates
use `Math.round(value * 10000) / 10000`, normalizing negative zero. Frontend must
use the returned coordinates rather than re-round.

Forecast and Geocoding are listed on OpenWeather's free plan. Configure an
activated free-plan key; confirm account access, quotas and licensing before release.
Provide visible **OpenWeather attribution** in the frontend per the selected
plan's terms. This backend does not authorize a subscription or claim that
account-specific quotas/licensing have been verified.

## Saved forecast selections

POST preferences requires **both** `location` and `snapshot`. The snapshot has
exactly a valid UTC `forecastAt`, finite `temperatureC`, and nonempty plain-text
`description` (maximum 200 characters). Saving needs authentication/CSRF but
never calls OpenWeather. It is a user-submitted selection, not provider-attested
evidence; no signing scheme or extra provider lookup is needed.

PostgreSQL stores the owner's ID, location, this minimal snapshot, an opaque ID
and server-assigned creation time. No raw response or full forecast array is
stored. Uniqueness is user + canonical coordinates + selected forecast time;
different times may coexist. Duplicate saves preserve original location,
snapshot and creation time. Lists sort by creation time then ID.

Reopening a saved item calls the existing weather route with its coordinates.
Each call fetches a fresh full forecast, even if the saved time is in the past.
It never overwrites the saved snapshot or returns that snapshot as fresh data.
Listing/deleting remains independent of the provider.

Migration `002_forecast_snapshots.sql` retains pre-existing location-only rows
unchanged with NULL snapshot columns. This legacy disposition was explicitly
approved by the user. The corrected list/delete API exposes only complete saved
forecasts; it does not fabricate values for legacy records. Recovery/disposition
of those legacy rows is a private operational task, not a new API endpoint.
The original migration/checksums, users and sessions remain intact.
The old location-only unique constraint is replaced with forecast-time identity:
an old backend's location-only `ON CONFLICT` statement is no longer compatible.
Coordinate the contract/frontend/backend cutover and stop legacy preference
writes before this migration; do not claim rolling mixed-version compatibility.

## Production database / migration Job

Set `NODE_ENV=production`, `DB_AUTH_MODE=entra`, `PGSSL=true`, `PGHOST`,
`PGDATABASE`, `PGUSER`, `AZURE_CLIENT_ID` and the API's `FRONT_DOOR_ID`.
`AZURE_CLIENT_ID` selects the user-assigned managed identity explicitly.
`PGUSER` is its Entra-mapped SQL principal. Tokens for
`https://ossrdbms-aad.database.windows.net/.default` are obtained through Azure
Identity for **every new physical connection**, checked against actual expiry,
and never persisted/logged. TLS validates the certificate chain and hostname.
API connections use PgBouncer port **6432**; migration Jobs use direct port
**5432** and their separate migration identity/SQL principal.

Managed PgBouncer rejects the client's three startup timeout fields. Terraform
configures `pgbouncer.ignore_startup_parameters` for those fields and enforces
identical server defaults (`statement_timeout=5000`, `lock_timeout=3000`,
`idle_in_transaction_session_timeout=10000`). Do not merely ignore them and lose
server-side protection. The effective 5s/3s/10s values were verified on the live
runtime connection. See [the deployment runbook](../docs/deployment.md) for the
automatic immutable-image/migration/candidate release path.

Pools default to five connections, maximum 20; connection deadline five seconds,
SQL deadline five seconds, lock deadline three seconds and physical connection
recycling ten minutes. Account hashing and provider I/O never hold SQL
transactions. There are no automatic write retries after ambiguous commits.
Database failures log only a sanitized event and return SERVICE_UNAVAILABLE.
Entra refresh, TLS trust, private DNS, PgBouncer/HA failover and aggregate pool
capacity must still be validated in the accepted Azure environment.

The private bootstrap administrator maps identities and grants only necessary
SQL permissions. The runtime principal needs schema USAGE, SELECT/INSERT on
users, SELECT/INSERT/UPDATE/DELETE on sessions and rate_limits, and
SELECT/INSERT/DELETE on preferences. It needs no DDL or schema_migrations access.
The migration principal owns the application schema/migration tables and runs
DDL, but is not the database administrator. Grant runtime access/default
privileges through the approved private bootstrap path. No HTTP administration
route exists. Production OpenWeather keys use ACA Key Vault-backed environment
secret references; migration/cleanup commands do not require that key.

Migrations are versioned SQL, checksum verified and serialized by a
transaction-scoped advisory lock; they never run on API startup:

```powershell
docker build -t weather-api .\backend
docker run --rm --env-file .\backend\.env weather-api node dist/migrate.js
```

The same immutable image is used by the private Container Apps migration Job
with command `node dist/migrate.js`, then deployed to the API only after migration
success. The production image deliberately requires production Entra settings;
the local development image invocation above needs production-style environment
configuration, or an explicit local `NODE_ENV=development` override. Schema
changes must remain compatible with the still-serving previous revision.

## Probes, origin boundary and shutdown

`GET /api/v1/health` checks PostgreSQL with a bounded SELECT, returns exactly
`{"status":"ok"}`, and never calls OpenWeather. Like **all** main-listener paths,
it requires the exact, single configured X-Azure-FDID in production. Missing,
duplicate, comma-joined and incorrect IDs fail before cookie/body/DB work.
Do not expose a public health bypass. Header checks require the separate ACA
ingress IPv4 restrictions maintained by Terraform; the header alone is spoofable.
The backend does not trust X-Forwarded-For or log URLs/bodies/headers.

The API listens on configurable `PORT`, default 3000, as a non-root user.
Use ACA **TCP startup/liveness probes on PORT**. A separate **TCP readiness
listener on PROBE_PORT**, default 3001, accepts and immediately closes sockets
only while PostgreSQL checks succeed. Checks run every five seconds and close
this listener on failure; detection is bounded by polling plus the SQL deadline.
Configure an ACA TCP readiness probe on this port; do **not** enable external
ingress or additional exposed TCP ports for it. It has no HTTP/business bypass.
Docker HEALTHCHECK uses the same readiness socket. Platform probe configuration
remains infrastructure-owned and must be verified in ACA.

SIGTERM/SIGINT stop readiness checks, remove readiness, drain Express requests,
and close PostgreSQL. A 15-second shutdown deadline prevents indefinite draining;
configure ACA termination grace longer than this. Container starts Node directly
(no npm/shell signal intermediary). All API responses/errors are no-store.
Only sanitized event identifiers and server-generated request IDs are logged.

No Azure resources, infrastructure, workflows or frontend files are changed by
this implementation. Image build/run and real SIGTERM handling need a running
Docker daemon; see the implementation record for actual validation evidence.
