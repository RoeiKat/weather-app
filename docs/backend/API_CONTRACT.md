# Application API contract

Date: **2026-10-07**.
Status: **Proposed shared specification, pending human review**, except the
cookie-session, metric units, free OpenWeather multi-day forecast, and provider
boundary requirements explicitly confirmed by the user. This corrects the
superseded current-weather-only assumption. No backend implementation is
included or authorized.

Sources: [requirements](../requirements.md),
[application rules](../app/AGENTS.md), accepted individual
[ADRs](../adr/README.md), and [planning record](../ai/10-application-foundation.md).
Neither implementation agent may independently change this contract.

This is a small assignment app: React + TypeScript frontend; Node.js +
TypeScript + Express backend compiled with `tsc` (`tsx` is acceptable for
development). Vite is frontend-only. No replacement backend framework,
unnecessary architectural layers, extra services, or unrequested features.

## Conventions and scope

- Base path: `/api/v1`. Routes below include that prefix.
- HTTPS in deployed environments. JSON request/response bodies use
  `application/json`; `204` responses have no body. Property names are camelCase.
- IDs are opaque nonempty strings; clients must not infer database keys or
  ownership. Dates are UTC RFC 3339 strings ending in `Z`.
- Reject unknown body/query fields, repeated scalar query parameters, malformed
  JSON, invalid types, nonfinite numbers, and missing required values with `400`.
  Unsupported request media types return `415`; oversized bodies return `413`.
  The backend must publish and test a bounded body-size limit before release.
- All application API responses use `Cache-Control: no-store`, including
  anonymous authentication state and errors. No public API caching is enabled.
- No forecast history, geolocation permissions, unit selection, profiles,
  password recovery, email verification, MFA, account deletion, or provider
  administration endpoints are defined. Privacy lifecycle policy still requires
  review; missing deletion endpoints are not a compliance claim.

## OpenWeather provider boundary

- [OpenWeather (openweathermap.org)](https://openweathermap.org/) is the external
  weather-data provider. Use its **free five-day / three-hour forecast API**;
  do not require a paid daily forecast or One Call subscription. Only the
  backend may call OpenWeather. The
  [forecast documentation](https://openweathermap.org/api/forecast5) and
  [free-plan listing](https://openweathermap.org/price) describe this product.
  Respect free-plan quotas and verify key access/attribution before delivery.
- The frontend must never call OpenWeather directly. For weather data, it calls
  only our `GET /api/v1/weather` endpoint with the application query parameters
  defined below.
- The OpenWeather API key remains server-side and comes from secure
  configuration. In production, use Key Vault-backed secret references under
  ADR-005; never include the key in frontend assets, responses, or logs.
- The backend must normalize OpenWeather responses into our `ForecastResponse`.
  Raw OpenWeather schemas/payloads must not become the frontend response
  contract. OpenWeather-specific URLs, parameters, and response fields remain
  backend implementation details; provider changes must not silently alter
  our routes or response shapes.
- Translate all OpenWeather errors, rate limits, and timeouts into the common
  application error envelope below. Upstream rate limits/quota exhaustion map
  to `503 WEATHER_UNAVAILABLE`, timeouts to `504 WEATHER_TIMEOUT`, and other
  provider failures/unusable responses to `502 WEATHER_PROVIDER_ERROR`.
  A genuine no-match maps to `404 LOCATION_NOT_FOUND`. Our own application
  throttling remains `429 RATE_LIMITED`, distinct from upstream throttling.
  Use sanitized messages and application request IDs, not raw provider errors;
  include `Retry-After` for provider unavailability only when known.

## Browser authentication and CSRF

Use an opaque, unpredictable session identifier in a backend-issued cookie,
not a bearer token response. Store revocable session state server-side in
PostgreSQL so it survives multiple replicas and revision turnover.

- Production cookie: `__Host-weather-session`; `Secure`, `HttpOnly`,
  `SameSite=Lax`, `Path=/`, and no `Domain`. Never expose its value to JavaScript.
- Frontend calls use credentials. Plan for frontend and API under one public
  origin with `/api/v1` routed to the backend. Frontend hosting/route wiring is
  still undecided; this is a proposed integration assumption, not infrastructure
  approval. A cross-site deployment requires coordinated security/contract review.
- `GET /api/v1/auth/session` bootstraps authentication and a session-bound CSRF
  token, including a minimal anonymous session when necessary.
- Every `POST` and `DELETE` below requires `X-CSRF-Token` matching the current
  session, including registration, login, and logout. Check the public `Origin`
  against an explicit allowlist on unsafe browser requests; reject absent or
  disallowed origins with `403`. No wildcard credentialed CORS.
- Keep CSRF tokens in frontend memory, not browser storage or logs. They are
  not authentication credentials and never replace ownership checks.
- Login rotates the session identifier and CSRF token and invalidates the old
  session. Logout revokes the current session and expires its cookie.
- Missing/expired/revoked authentication on protected routes returns `401`.
  Never redirect API callers to HTML login pages.
- Before implementation, obtain human approval for session absolute/idle
  lifetimes, anonymous-session expiry/cleanup, password-hashing parameters, and
  abuse limits. These values must not be chosen silently by either agent.

`AuthState` has exactly:

```json
{
  "user": {"id": "usr_example", "email": "reader@example.test"},
  "csrfToken": "synthetic-session-bound-token"
}
```

`user` is `null` when anonymous; `csrfToken` is always a nonempty string on a
successful auth-state response. Registration returns a `User` object, which is
the same `{ "id": string, "email": string }` structure without a token.

## Common errors and status behavior

All backend application errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the submitted values.",
    "requestId": "req_example",
    "fields": [
      {"field": "email", "message": "Enter a valid email address."}
    ]
  }
}
```

`code`, sanitized `message`, and opaque diagnostic `requestId` are required.
`fields` is present only for field-validation errors and is a nonempty array
of `{field, message}` strings, using the request's field names. Do not echo
credentials or sensitive submitted values. Clients branch on `code`, not
message text. Do not expose stacks, database errors, keys, or upstream bodies.

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid body/query/path or malformed JSON; `fields` when applicable |
| `401` | `UNAUTHENTICATED` | Authentication required, absent, expired, or revoked |
| `401` | `INVALID_CREDENTIALS` | Generic login failure; same result for unknown email and wrong password |
| `403` | `CSRF_FAILED` | Unsafe request has invalid/missing CSRF token or unacceptable Origin |
| `403` | `ORIGIN_FORBIDDEN` | Deployed backend rejects the Front Door profile boundary |
| `404` | `LOCATION_NOT_FOUND` | Weather lookup has no matching location |
| `404` | `PREFERENCE_NOT_FOUND` | Preference is absent or belongs to another user |
| `409` | `EMAIL_IN_USE` | Registration email already exists |
| `413` | `PAYLOAD_TOO_LARGE` | Request body exceeds the published limit |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Body-bearing request is not JSON |
| `429` | `RATE_LIMITED` | Application abuse/rate limit reached; integer `Retry-After` seconds required |
| `502` | `WEATHER_PROVIDER_ERROR` | Provider failure or unusable response |
| `503` | `WEATHER_UNAVAILABLE` | Provider quota/service unavailable; include `Retry-After` only if known |
| `503` | `SERVICE_UNAVAILABLE` | Required backend dependency unavailable |
| `504` | `WEATHER_TIMEOUT` | Provider lookup deadline exceeded |
| `500` | `INTERNAL_ERROR` | Unexpected backend failure, sanitized and logged |

The endpoint tables list endpoint-specific statuses. All endpoints may also
return applicable shared `400`, `403 ORIGIN_FORBIDDEN`, `429`, `500`, or
`503 SERVICE_UNAVAILABLE`; body-bearing endpoints may return `413`/`415`.
Every unsafe endpoint may return `403 CSRF_FAILED`. Apply the origin boundary
first, then authenticate protected routes before checking their CSRF tokens.

Infrastructure/edge/network failures can produce non-JSON responses or no
response; the frontend must handle these as transport/service errors rather
than assume every failure is this envelope.

`409 EMAIL_IN_USE` improves registration UX but discloses email existence.
This proposed trade-off requires human security review before implementation;
login must never disclose whether an account exists.

## Endpoints

### Health

| Property | Definition |
| --- | --- |
| Method / route | `GET /api/v1/health` |
| Authentication | None; deployed origin restrictions still apply |
| Request | No body or query parameters |
| Success | `200` with `{"status":"ok"}` |
| Errors | `503 SERVICE_UNAVAILABLE` using the common envelope when the API/database readiness check fails |

Use a lightweight, bounded PostgreSQL readiness check; no OpenWeather call and
no infrastructure/version details. A provider outage must not make this
endpoint unhealthy. Container-local liveness/startup probes are separate
deployment mechanisms under ADR-005, not public authentication bypass routes.

### Registration

| Property | Definition |
| --- | --- |
| Method / route | `POST /api/v1/auth/register` |
| Authentication | None; anonymous/authenticated session CSRF and Origin checks required |
| Body | `{"email":"reader@example.test","password":"synthetic-long-password"}` |
| Success | `201` with `{"user":{"id":"usr_example","email":"reader@example.test"}}` |
| Errors | `400 VALIDATION_ERROR`, `409 EMAIL_IN_USE` |

Proposed validation: trim surrounding email whitespace, require a syntactically
valid email of at most 254 characters, and store/compare it case-insensitively
using one canonical lowercase representation. Password: 12-128 Unicode code
points, no silent trimming, normalization, truncation, or composition rules.
Choose a compatible hashing library rather than silently imposing its byte
limit. Enforce email uniqueness atomically.

Registration creates an account but **does not log in** or replace an existing
login. The frontend takes the user to login after success.

### Login

| Property | Definition |
| --- | --- |
| Method / route | `POST /api/v1/auth/login` |
| Authentication | None; current session CSRF and Origin checks required |
| Body | Same email/password fields and input bounds as registration |
| Success | `200` with `AuthState`; sets the rotated authenticated session cookie |
| Errors | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` |

Use the same email canonicalization and generic failed-credential response
for unknown accounts and incorrect passwords. An authenticated caller can
explicitly log in to another account; success replaces, not combines, sessions.
Never return password hashes or session identifiers.

### Logout

| Property | Definition |
| --- | --- |
| Method / route | `POST /api/v1/auth/logout` |
| Authentication | No logged-in user required; valid current session CSRF and Origin checks required |
| Request | No body or query parameters |
| Success | `204`, no body; revokes current session and clears cookie |
| Errors | Common errors, particularly `403 CSRF_FAILED` |

Anonymous logout with a valid anonymous-session token also succeeds. A request
without a valid session/token is not a successful logout fallback. After
success, discard frontend user/CSRF state and call the session endpoint before
the next unsafe request. Do not clear local state as if server revocation
succeeded when logout fails.

### Authentication state

| Property | Definition |
| --- | --- |
| Method / route | `GET /api/v1/auth/session` |
| Authentication | None |
| Request | No body or query parameters |
| Success | `200` with `AuthState`, including `user:null` for absent/expired login |
| Errors | Common errors; database failure is `503`, not anonymous success |

Replace expired/revoked cookies with a fresh anonymous session and CSRF token.
Do not renew absolute authenticated lifetime indefinitely. On expiry-induced
`401` elsewhere, clear private frontend data and bootstrap this state; do not
automatically replay a mutation.

### Multi-day forecast lookup

| Property | Definition |
| --- | --- |
| Method / route | `GET /api/v1/weather` |
| Authentication | None; logged-in users can additionally save the resolved location |
| Query | Exactly one mode: `q` plus optional `countryCode`, **or** both `latitude` and `longitude` |
| Body | None |
| Success | `200` with `ForecastResponse` below |
| Errors | `400`, `404 LOCATION_NOT_FOUND`, `502 WEATHER_PROVIDER_ERROR`, `503 WEATHER_UNAVAILABLE`, `504 WEATHER_TIMEOUT` |

- `q`: trimmed city name, 1-100 characters. `countryCode`: optional two-letter
  ISO 3166-1 alpha-2 code, normalized uppercase, valid only with `q`.
- Coordinates: finite decimal values; latitude -90 to 90, longitude -180 to 180.
  Do not accept mixed query/coordinate modes, partial pairs, units, arbitrary
  provider URLs, or provider request parameters.
- Metric-only forecast for the coming days using the free five-day /
  three-hour product. Request the full available horizon, not a single point
  or current-weather endpoint. The browser receives only our normalized shape;
  no extra daily aggregation endpoint/service or paid API is needed.
- Resolve a city query to the provider's best matching location, then show the
  resolved name, country, and coordinates so users can verify ambiguous names.
  No autocomplete or candidate-list endpoint. Users can refine the city/country
  or use known coordinates.

`Location` has exactly `name`, `countryCode`, `latitude`, and `longitude`.
`name` is a trimmed 1-100 character display string; `countryCode` is a valid
uppercase country code or `null` if unavailable. Coordinates are numbers
rounded to four decimal places by the backend, with negative zero normalized.
Use these canonical coordinates for returned forecasts and saved preferences;
do not independently round with different rules in the frontend.

`ForecastResponse`:

```json
{
  "location": {
    "name": "Stockholm",
    "countryCode": "SE",
    "latitude": 59.3293,
    "longitude": 18.0686
  },
  "units": "metric",
  "fetchedAt": "2026-10-07T18:30:00Z",
  "timezoneOffsetSeconds": 7200,
  "forecast": [
    {
      "forecastAt": "2026-10-07T21:00:00Z",
      "temperatureC": 12.4,
      "condition": {"code": "cloudy", "description": "Overcast clouds"}
    },
    {
      "forecastAt": "2026-10-08T00:00:00Z",
      "temperatureC": 11.2,
      "condition": {"code": "rain", "description": "Light rain"}
    }
  ]
}
```

The example abbreviates the array; a real success returns all available future
three-hour forecast points across the five-day horizon, normally about 40,
not just the two shown. The horizon may touch six local calendar dates with
partial first/last days; do not promise five complete daily summaries.

All fields are required; nullable only where stated. `units` is exactly
`"metric"`. `fetchedAt` is the backend's successful retrieval time, not an
observation time or the age of the provider's forecast model.
`timezoneOffsetSeconds` is the location's provider-supplied integer UTC offset
in seconds, from -43200 to 50400; use it to display/group the forecast in the
selected city's local time rather than the browser's timezone. It is a supplied
fixed offset, not an inferred IANA timezone or a DST-transition guarantee.

`forecast` is a nonempty array of exactly `{forecastAt, temperatureC, condition}`
objects, sorted by strictly increasing unique UTC `forecastAt` timestamps.
Each timestamp is the forecast's valid time, never an observation timestamp.
Temperature is a finite Celsius number. `condition.code` is one of `clear`, `cloudy`, `rain`,
`drizzle`, `thunderstorm`, `snow`, `mist`, `other`; `description` is nonempty
plain text, at most 200 characters. The backend owns provider-code mapping.
Missing/empty forecast data or malformed required fields produce an explicit
provider error; do not silently drop invalid entries or fabricate days/zero
values. No provider icon URL, raw field names, or raw payload is returned.

Every search and saved-item selection triggers a new backend request and a
fresh OpenWeather forecast fetch. Do not introduce a caching layer or use a
saved snapshot as the weather endpoint's fresh response. The UI may retain a previous result only if clearly labeled
as previous with its retrieval time and the new lookup's failure.

### Saved forecast selections

A preference is a user-selected forecast point, saved as a minimal snapshot.
PostgreSQL stores its ID, owning user ID, city/location, selected forecast
date/time, temperature in Celsius, weather description, and creation timestamp.
Keep the location so reopening can fetch a fresh multi-day forecast.
Ownership is derived from the authenticated session; no client-submitted user
ID is accepted or exposed in the preference response. Do not store raw
OpenWeather responses, whole forecast arrays, ranking, custom labels, or
automatically collected lookup history.

`ForecastSnapshot` has exactly `forecastAt`, `temperatureC`, and `description`.
`forecastAt` is the selected point's valid date/time as a UTC RFC 3339 timestamp,
not the save time. Temperature is a finite Celsius number; description is
nonempty plain text, at most 200 characters. Metric units are fixed by this
contract, so no units column or unit-selection field is needed.

`Preference` has exactly `id`, `location`, `snapshot`, and `createdAt`:

```json
{
  "id": "pref_example",
  "location": {
    "name": "Stockholm",
    "countryCode": "SE",
    "latitude": 59.3293,
    "longitude": 18.0686
  },
  "snapshot": {
    "forecastAt": "2026-10-08T00:00:00Z",
    "temperatureC": 11.2,
    "description": "Light rain"
  },
  "createdAt": "2026-10-07T18:35:00Z"
}
```

Save request example:

```json
{
  "location": {
    "name": "Stockholm",
    "countryCode": "SE",
    "latitude": 59.3293,
    "longitude": 18.0686
  },
  "snapshot": {
    "forecastAt": "2026-10-08T00:00:00Z",
    "temperatureC": 11.2,
    "description": "Light rain"
  }
}
```

| Method / route | Auth | Request | Success | Endpoint-specific errors |
| --- | --- | --- | --- | --- |
| `GET /api/v1/preferences` | Required | No body/query | `200 {"preferences":[Preference]}`; empty array when none | `401 UNAUTHENTICATED` |
| `POST /api/v1/preferences` | Required + CSRF | `{"location":Location,"snapshot":ForecastSnapshot}` | `201 {"preference":Preference}` if new; `200` with same shape if already saved | `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED` |
| `DELETE /api/v1/preferences/{preferenceId}` | Required + CSRF | Nonempty opaque path ID; no body/query | `204`, no body | `401 UNAUTHENTICATED`, `404 PREFERENCE_NOT_FOUND` |

The bracketed type names in this table describe objects, not literal JSON
strings. Use the exact object fields shown above. `createdAt` is assigned by the
backend on insertion; clients cannot supply IDs, ownership, or creation times.
Lists sort by `createdAt` ascending, then `id` ascending for ties.
After login, the frontend loads the current user's list. No pagination or preference-count cap
is proposed for the initial small application; revisit with the human owner
if expected volume requires a cap or pagination.

Validate submitted location fields and canonicalize coordinates server-side
as above. Names are untrusted display text, not identity or authorization.
The frontend submits the returned location and the selected forecast point,
mapping its `condition.description` to `snapshot.description`. Validate the
snapshot's exact fields, types, timestamp, and bounds on the backend, as well
as the location; never accept a raw provider object. This is a saved
user-submitted selection, not independently attested provider evidence.
No signing scheme or second provider call is needed to save it. Saving and
listing/deleting remain available during OpenWeather outages.

Enforce uniqueness atomically on user + canonical latitude/longitude +
selected `forecastAt`, including concurrent requests. Different forecast times
for the same city may be saved separately. A duplicate returns the existing
record without changing its location, snapshot, or creation time. Another
user's identical selection is a different preference.
Keep saved snapshots unchanged even after their forecast time passes or the
provider forecast changes; they are explicitly labeled saved data, not a
forecast cache. Scope deletion by user + preference ID and return the
same `404` for absent and not-owned records. Selecting any saved item calls
`GET /api/v1/weather` with its coordinates; the backend must fetch a fresh
multi-day forecast from OpenWeather again. Listing preferences alone does not
fetch forecasts. The fresh response never overwrites the saved snapshot.
There is no extra preference-forecast route or update endpoint.

## Implementation acceptance

Before code, review the proposed policies/limits above and pending items in
the [planning record](../ai/10-application-foundation.md). Implementers must
verify exact routes, shapes, statuses, headers, ownership, concurrency,
snapshot persistence/validation, distinct forecast-time saves, multi-day
normalization, new provider calls on repeated saved-item selection,
provider failure behavior, and session/CSRF lifecycle using controlled fixtures.
No runtime, transport, load, security, or provider compatibility has been tested
by this documentation session.
