# Production deployment and recovery

Current live deployment: Sweden Central, Storage static website, Front Door
Standard, Container Apps Consumption (multiple revisions, minimum two replicas),
ACR Basic and private PostgreSQL Flexible Server with Entra and managed PgBouncer.
Public URL:
<https://weatherroeidev-public-d4e7a2bxgxefe6cf.z03.azurefd.net>.

## Normal delivery

[Production delivery](../.github/workflows/production.yml) runs on main pushes.
It compares changes against the last successful main delivery, not only the last
push, so failed or superseded queued deliveries do not lose pending changes.
Application, infrastructure and delivery-script validation precedes mutation.
Obsolete queued commits fail before touching production.

- Backend changes: lint, typecheck, tests, compile and Docker build; publish the
  tested image to ACR with a traceable locked tag; resolve its immutable digest;
  execute the existing migration Job with that same digest; create a named
  zero-production-traffic candidate; require two ready replicas; validate health
  and anonymous session through the existing Front Door candidate selector;
  promote named traffic; verify production; retain the previous active revision
  and deactivate older active revisions.
- Frontend changes: lint, typecheck, tests and `/api/v1` production build;
  checksum the artifact; upload immutable hashed assets before switching HTML;
  verify public navigation, bytes, MIME, security headers, assets and real 404s.
  Restore the previous index on failure when it exists; do not delete old assets.
- Infrastructure changes: Terraform 1.16.5 fmt, validate, mocked tests and delivery
  tests; initialize remote state; create and seal a private plan; verify its
  commit, input hash, image/traffic fingerprint and bytes; apply that exact plan
  automatically. Terraform-created revisions are validated/promoted if no
  backend release follows.

One `weather-production-mutation` concurrency group is shared with manual
Terraform/backend/frontend operations. In-progress mutation is never cancelled
by a newer push. GitHub may replace pending jobs; cumulative change detection
and the obsolete-commit check handle that case. No multi-service atomic release
is claimed: a backend may remain successfully released if the later frontend
release fails. Schema/API changes must remain backward compatible.

GitHub OIDC uses the existing `assignment` environment and Azure principal, not
client secrets. The environment accepts only main. Main is protected against
force pushes/deletion; there is no added manual approval requirement.
All workflow actions retain full commit-SHA pins.

## State and configuration ownership

Remote backend: resource group `weatherroeidev-state`, storage account
`weatherroeidevstate`, container `tfstate`, key `production.tfstate`.
Plans and diagnostic logs remain in protected `tfplans`/`tfdiagnostics`, not
public GitHub artifacts. Sanitized release receipts are retained in GitHub.

Stable platform inputs are the masked environment secret
`TERRAFORM_INPUTS_JSON`; resource names/OIDC identifiers remain environment
variables. Normal releases do not edit this JSON. The plan helper derives
`bootstrap_image` from the existing app and the complete current global
`AzureFrontDoor.Backend` IPv4 set from Azure's service-tag API, validating its
shape and failing closed. This updates an allowlist, not a broad public bypass.

Terraform owns platform configuration, identity, networks, probes and secrets.
Release scripts own only the deliberately ignored image, revision suffix and
named traffic state. Migration execution overrides do not rewrite the Job
template. Application-only releases do not run Terraform.

PgBouncer rejects client startup fields `statement_timeout`, `lock_timeout` and
`idle_in_transaction_session_timeout`. Terraform explicitly ignores these
fields at the pooler **and enforces identical PostgreSQL defaults**: 5 seconds,
3 seconds and 10 seconds respectively. The client query deadline remains
6 seconds. Live checks verified the effective values through port 6432.
Do not remove these defaults and merely ignore the startup fields.

## Candidate checks and caching

The ACA label hostname is `app---candidate.environment-domain`, not
`candidate---app.environment-domain`. Only GET health and anonymous-session
requests with `X-Weather-Release-Target: candidate` are overridden to this
origin by Front Door. The selector is removed before reaching the API; the
response target marker confirms the rule selected the candidate origin.
Candidate readiness, a no-store JSON response and the exact expected shape are
all required. A target header alone is not success.

The API's IPv4 ingress allowlist and exact `X-Azure-FDID` validation remain
unchanged. Neither direct ACA access nor a public health bypass is enabled.
Poll provisioning/readiness with deadlines; candidate edge checks have a
15-minute deadline for Front Door propagation and report actual status,
cache and target headers on failure. No indefinite retries.

ARM may omit unlabelled zero-weight traffic entries after promotion. Confirmation
compares meaningful named allocations/labels and verifies rollback readiness
separately; it does not wait forever for omitted serialization details.

HTML/navigation and API responses are no-store. Successful hashed assets are
immutable for one year. Storage website missing-asset responses are real,
anonymous HTML 404s and omit blob Cache-Control metadata; these may be negatively
cached by the static assets route, but must never be treated as immutable
successful assets. Unknown navigation and API errors must still be no-store.
The existing backend intentionally returns 400 `VALIDATION_ERROR` for an
unsupported API route/method; delivery verifies that JSON envelope instead of
incorrectly expecting a static 404 from the API.
Requests sent to Storage have credentials removed. Normal releases need no
Front Door purge: HTML is not cached and changed assets use new names.

## Manual operations and disaster recovery

- Production delivery `redeploy`: rebuild/redeploy current main without entering
  a digest. `diagnostics`: run validation without production mutation.
- Backend dispatch `deploy`: explicit current-main redeploy. `rollback` selects a
  retained revision and requires explicit schema-compatibility confirmation;
  database migrations are not reversed automatically.
- Frontend `rollback`: restore a verified successful frontend artifact. Normal
  artifact retention is 30 days.
- Terraform `plan`: diagnostic private plan. `apply`: create and apply the exact
  plan in the same validated main run; no run ID/attempt entry is required.
- Backend `publish`/`bootstrap`, state bootstrap and the private human SQL
  administrator helper remain disaster-recovery/first-creation operations only.
  The already-created database principals, schema and runtime grants are not
  bootstrapped by normal releases. Recreating them requires an authorized human
  Entra administrator; no administrator token is kept in CI.

Read the [final deployment evidence](ai/20-final-deployment-and-cd-automation.md)
for commands, live results and limitations. Earlier AI records describe prior
implementation states, not the current operational instructions.
