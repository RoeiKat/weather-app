# Application development contract

Status: **Planning reference; implementation is not authorized by this file.**

## Read first

Read the root [agent contract](../../AGENTS.md),
[project instructions](../../.github/copilot-instructions.md),
[requirements](../requirements.md), and the relevant individual
[ADRs](../adr/README.md). Some indexes and summaries retain historical proposal
labels; consult the individual ADR's current acceptance and scope. Do not
silently rewrite or reopen accepted decisions.

Both application agents must explicitly read this document before application
work. Its location under documentation does not automatically scope its rules
to future source directories.

## Shared boundaries

- Use React + TypeScript for the frontend and Node.js + TypeScript for the
  backend, with PostgreSQL persistence. Runtime versions, backend framework,
  database driver, migration tooling, and frontend hosting are not selected here.
- Keep one simple application with logical presentation, authentication,
  weather-provider, and persistence boundaries; do not introduce microservices,
  speculative features, or unnecessary libraries.
- The frontend communicates only with our backend for application data and
  authentication. Never call OpenWeather, PostgreSQL, Key Vault, or Azure
  management APIs from the browser.
- [OpenWeather (openweathermap.org)](https://openweathermap.org/) is the external
  weather-data provider. Only the backend may call it; the frontend must never
  call OpenWeather directly and uses only our `GET /api/v1/weather` endpoint
  for weather data.
- Keep the OpenWeather API key server-side, supplied through secure
  configuration and Key Vault-backed secret references in production under
  ADR-005. Never include it in frontend assets, responses, or logs.
- The backend normalizes OpenWeather responses into our API response contract.
  Do not expose raw OpenWeather response schemas or payloads to the frontend.
  OpenWeather-specific URLs, parameters, and response fields are backend
  implementation details, not frontend dependencies.
- Translate OpenWeather errors, rate limits, and timeouts into the contract's
  standard application error format and statuses; never pass upstream errors
  through unchanged.
- [API_CONTRACT.md](../backend/API_CONTRACT.md) is the source of truth for
  frontend/backend routes, methods, requests, responses, status codes, and
  authentication behavior. Neither agent may independently change them.
  Propose a coordinated contract change, obtain human approval, update the
  reference first, then update both consumers and their tests together.
- Use the [design specification](../design/DESIGN_SYSTEM.md) for frontend work.
  Obtain human approval of the proposed design before UI implementation.
- Respect accepted Container Apps, Sweden Central, private PostgreSQL,
  Front Door, network/identity, and delivery boundaries. Application work must
  not modify Terraform, infrastructure, workflows, or ADRs without explicit scope.

## Authentication, validation, and security

- Follow the contract's opaque server-side cookie sessions and CSRF protocol.
  Session state must survive replica/revision changes; do not use process-local
  sessions as production persistence. Never put credentials in browser storage.
- Store only adaptive, salted password hashes in PostgreSQL using a maintained
  library; review algorithm/parameters before implementation. Never truncate
  passwords, implement cryptography, or confuse end-user login with Entra
  workload/database authentication.
- Validate all requests on the backend, including types, lengths, coordinates,
  content type, and allowed fields. Frontend validation assists users but is not
  a security boundary. Use parameterized SQL and atomic persistence operations.
- Derive ownership from the authenticated session, never a submitted user ID.
  Authorize every preference read/write/delete; do not disclose other users'
  records. Render provider/user text as text, not HTML.
- Enforce ADR-005's Front Door profile boundary before application work in
  deployed environments. Do not create public probe bypasses or trust arbitrary
  proxy headers. Keep TLS validation, least privilege, input limits, and
  backend abuse controls even when edge controls exist.
- Never commit or log passwords, session/CSRF tokens, hashes, provider keys,
  connection credentials, or sensitive bodies. Use sanitized diagnostic IDs
  and synthetic test data. Minimize stored account/location data; no lookup
  history, browser geolocation, or analytics by default.

## Errors, resilience, and verification

- Use the contract's explicit error envelope. Log sanitized unexpected failures
  through the eventual repository-standard logger; never swallow errors, return
  success-shaped fallbacks, or leak stack traces/SQL/provider internals.
- Bound provider calls and database work. OpenWeather failure must not disable
  registration, login, or saved-preference operations. Do not hold a database
  transaction during provider calls or password hashing.
- Do not publicly cache API/authentication/preference responses. Do not show
  old weather as a fresh successful lookup. Database pooling, safe reconnects,
  and versioned migrations must follow ADR-003/ADR-006.
- Once tooling exists, run the smallest relevant lint, type-check, build, and
  test commands; do not invent commands or install tooling for planning docs.
  Test API shapes/statuses, CSRF, session rotation/expiry/logout, password
  verification, validation, concurrent duplicates, cross-user isolation,
  persistence, and provider no-match/timeout/quota/invalid-data failures.
  Frontend tests must cover keyboard operation, responsive layouts, forms,
  loading/error/empty states, and expired sessions.
- Update directly related documentation and record significant AI assistance
  using the [AI convention](../ai/README.md). Report actual verification and
  remaining limitations; generated references are not human approval.
- Before starting implementation, resolve the explicit pending decisions in
  the contract and design record. Do not independently fill security or
  behavior gaps; bring them to the human owner.
