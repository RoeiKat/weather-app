# Final deployment and continuous-delivery automation

- **Date:** 2026-10-08.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Human decision: PENDING REVIEW**
- **Scope authorization:** The current user explicitly authorized repository
  changes, tests, Azure inspection/mutation and completion of the existing
  deployment. This supersedes the historical documentation-only implementation
  restriction for this task, but does not authorize architectural redesign.

## Prompt

**Faithful summary of the original prompt, not a verbatim transcript:** Take over
final deployment, diagnose the failed Terraform post-apply backend release from
actual repository/GitHub/Azure evidence before editing, fix the smallest cause
and deliver the usable application through the existing Front Door hostname.
Preserve Sweden Central, React/TypeScript/Tailwind on Storage, Front Door
Standard without a custom domain, Node/TypeScript/Express on multiple-revision
Consumption ACA with minimum two replicas, ACR Basic, managed-identity Key Vault
access, Front Door IPv4 restrictions plus application FDID checks, private
PostgreSQL with Entra/PgBouncer, the existing migration Job and Terraform remote
state. Do not add services or expose credentials. Automate main backend image
build/digest/migration/candidate/promotion/rollback retention, frontend
build/upload/smoke and validated exact-plan infrastructure apply using OIDC and
pinned actions. Serialize production mutations without cancelling an active
deployment. Remove normal manual digest/bootstrap-image/plan-ID/attempt/migration/
promotion/frontend coordination. Test changes, exercise live acceptance and
record investigation, commands, root causes, results, delivery flow and limits.

**Faithful summary of the follow-up prompt:** Production is already usable.
Stop repeating candidate smoke blindly, inspect the exact response/assertion,
distinguish status/header/cache/override/propagation issues, preserve production
and origin security, fix and validate candidate promotion and subsequent main
delivery, then finish this record. No intermediate manual Azure testing.

## Evidence and root causes

Initial worktree: main at `8b1ebf8`; existing untracked
`infra/review-plan.json` was preserved. The failed Terraform workflow was
[run 37795888645](https://github.com/RoeiKat/weather-app/actions/runs/37795888645).
Its post-apply error was exactly:
`Timed out waiting for two ready replicas of weatherroeidev-api--bootstrap`.
Terraform had created the API successfully. The release script checked the
serving bootstrap **before selecting/creating a candidate**, so its summary said
“not created”; that was not an ACR publish or candidate-create failure.

Azure showed bootstrap `Provisioned`, `Unhealthy`, `ActivationFailed`, two running
containers but neither ready. Sanitized application events reported database/
readiness failures. A read-only `SELECT 1` inside the actual API replica using
its managed identity reproduced SQLSTATE **08P01**:
`unsupported startup parameter: statement_timeout`.
Managed PgBouncer rejected the startup timeout fields sent by node-postgres.
Key Vault/ACR references and identities were present; the failure was not a
missing OpenWeather credential. Do not replace that evidence with speculation.

After the database configuration fix, effective timeout values through PgBouncer
were verified as `statement=5s`, `lock=3s`, `idle=10s`; bootstrap became Healthy
with two ready replicas and public health/session succeeded.

A subsequent real candidate revealed a separate routing defect:
`candidate---app` was used as the Front Door origin instead of ACA's
`app---candidate` hostname. Exact smoke responses were:

| Check | Expected | Observed before edge correction propagated |
| --- | --- | --- |
| HTTP status | 200 | **404**, ACA unavailable HTML document |
| Target marker | candidate | candidate |
| API Cache-Control | no-store | absent because response was ACA's 404 |
| Front Door cache | no private caching | CONFIG_NOCACHE |

The override rule was executing; the target marker alone did not prove a healthy
candidate. The 404 was not a successful health response or a cached API result.
Terraform corrected both candidate origin hostname and Host header. The edge
subsequently returned **200**, `no-store`, `candidate`, `CONFIG_NOCACHE` and
`{"status":"ok"}`. Retrying the same generic assertion obscured this distinction;
the follow-up stopped the active poll. No origin restriction was relaxed.

The candidate had already been promoted by the stopped process. ARM then omitted
the previous **unlabelled zero-weight** traffic entry, while that revision stayed
active and ready. The old exact-array-length confirmation could keep polling
after a successful promotion. Traffic confirmation now accepts this documented
live serialization behavior while still requiring exact meaningful named
weights/labels and total 100%; rollback readiness is checked independently.
Production and candidate smoke and two ready replicas for both serving and
retained bootstrap were verified after stopping the process.

The first frontend run encountered a transient GitHub OIDC-token-fetch failure;
one automated failed-job rerun authenticated successfully with OIDC. It uploaded
the build, then failed the smoke assertion requiring Cache-Control on a missing
static asset. Storage website 404s omit blob cache metadata. The validator now
requires a real static 404 without immutable cache directives; private API and
unknown-navigation errors still require no-store. This exception is explicit,
tested and limited to anonymous static errors. It does not cache authenticated
responses or bypass Front Door. The public frontend was functional despite the
original overly strict smoke result.

The automatic-delivery investigation found another precise contract mismatch:
`/api/v1/not-a-route` returns **400**, `no-store`, JSON `VALIDATION_ERROR` by the
existing backend's deliberate unsupported-route/method handler. The frontend
delivery validator incorrectly expected 404 for this API route as well as
static missing files. The smallest fix preserves backend behavior and requires
the actual 400 error envelope and no-store; it still rejects 200, HTML fallbacks,
incorrect error codes and cacheable private errors. No application route changed.

## Investigation, tools and live actions

- Git status/log/branch/remote; repository contract, requirements, ADR index,
  application/deployment docs, all workflows and delivery scripts.
- GitHub Actions run/job/log APIs; GitHub REST via existing Git credential-manager
  authentication kept only in process memory. No token was printed or committed.
- Azure CLI account/group/resource inventory, Terraform state list and selected
  remote-backend metadata; ACA app/revision/replica/template/traffic/identity/
  secret-reference configuration; sanitized console/system events.
- ACR manifest inspection by exact digest; PostgreSQL parameter inspection;
  scoped RBAC inspection; Front Door origin/routes/rules via ARM REST; Storage
  website discovery and public HTTP checks; migration Job secret-name inspection.
- Read-only API-replica exec using a base64-encoded **nonsecret diagnostic**
  (`SELECT 1`, then current timeout settings). No credential/key value retrieval.
- Terraform 1.16.5 fmt/validate/test/plan/show/apply. Plans and apply logs were
  retained locally without exposing full state/inputs. Recovery changed the
  timeout/pooler settings, then candidate origin. An observed monitor-plan
  difference was only Windows CRLF versus LF in the existing KQL text.
- Real migration execution with the supplied immutable backend digest; candidate
  creation, readiness validation and controlled promotion attempts. Failed
  pre-promotion attempts kept production serving; the later successful promotion
  retained the prior ready revision.
- Frontend workflow dispatch/rerun used existing OIDC CI permissions rather than
  adding a human Storage role or enabling account keys.
- Migrated stable Terraform input metadata to a masked GitHub environment
  secret with PyNaCl sealed-box encryption. PyNaCl was installed only in session
  tooling after a missing-package failure; no application dependency was added.
  Removed manual digest and service-tag fields from that secret; the plan helper
  derives them from live Azure.
- Restricted the existing assignment environment to main and protected main
  against force push/deletion, without adding a manual deployment approval gate.

## Implementation and delivery flow

See [the current deployment runbook](../deployment.md) and
[production workflow](../../.github/workflows/production.yml).

Changes: PgBouncer compatibility plus equal server defaults; correct candidate
hostname; explicit smoke assertion diagnostics; ARM-aware traffic confirmation;
bounded readiness/candidate validation; previous-revision retention and older
revision deactivation; static-404 assertion correction; live-derived platform
inputs; cumulative path detection; one main delivery workflow with independently
validated artifacts and a serialized mutator; same-run manual Terraform apply
without plan IDs; expanded regression tests and related deployment docs.

Normal main delivery validates affected surfaces, then holds the shared production
mutation lock while applying infrastructure (if changed), publishing/migrating/
validating/promoting the tested immutable backend (if changed), then deploying
and smoke-testing the frontend (if changed). No application-only image deployment
edits Terraform. OIDC and SHA-pinned actions remain. Existing rollback/diagnostic
dispatches remain; first-creation SQL/bootstrap is disaster recovery only.
Failed/superseded changes accumulate from the last successful main delivery;
obsolete queued commits are rejected before production mutation.

## Validation recorded so far

- Backend lint/typecheck/build: passed. Node backend tests: **91/91 passed**.
- Frontend lint/typecheck/build with `/api/v1`: passed. Unit tests: **54/54**.
  Existing Playwright production-build fixture suite: **35/35** across five
  viewports; those browser tests mock the API, not live Azure.
- Delivery script tests: **54/54 passed** at the last completed run, including
  unhealthy previous revision, migration/promotion failure, rollback,
  service-tag/input handling, static-404 behavior, exact candidate digest,
  ARM traffic pruning and superseded-revision deactivation.
- Terraform fmt/validate: passed; mocked Terraform tests **3/3 passed**.
- Pinned-action YAML validation: local actionlint passed; external shellcheck/
  pyflakes were disabled because those tools were not part of this environment.
- Docker production image built locally; compiled runtime and migration modules
  loaded successfully inside its non-root runtime container.
- Live Front Door API test: health, anonymous session, synthetic registration,
  login, authenticated session, Stockholm forecast, preference save/list, fresh
  coordinates lookup, deletion and logout **all passed**. Password/session/CSRF
  values existed only in memory and were not printed. One synthetic account
  remained because there is no account-deletion API; its preference was removed
  and session revoked.
- Canonical public frontend and assets loaded; production and candidate health/
  anonymous-session smoke passed. Direct ACA canonical access returned **403**.
- Migration Job currently had **no temporary-sql-admin secret**; current shell
  and inspected local environment files had no temporary SQL token assignment.
  A limited tracked-file private-key/JWT pattern check found zero matches; this
  is not a claim of a comprehensive historic secret audit.

## Remaining evidence / limitations

Main workflow execution, subsequent automatic release and final Azure metrics
will be appended after verification; local validation is not a claim that CI
has run. Front Door control-plane `deploymentStatus` reported `NotStarted`
despite functional data-plane routing, so bounded endpoint checks are necessary
for edge propagation. One attempted projected access-log query returned no
rows and is not evidence of healthy probes. Provider/API health does not prove
regional disaster recovery, database restore/failover or an application SLA.
No disaster-recovery SQL bootstrap, retained-schema rollback drill, or external
dependency security audit is claimed. The existing broad disposable-assignment
OIDC role union and historical nonblocking image scanning remain limitations;
they were not expanded to bypass deployment protections.

**Human decision: PENDING REVIEW**
