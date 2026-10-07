# CI/CD strategy evaluation

- **Date / evidence retrieval:** 2026-10-07.
- **Author / AI tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user; approval authority as recorded in the project ADR process.
- **Related ADR:** [ADR-006: CI/CD strategy and ownership](../adr/ADR-006-cicd-strategy.md).
- **Related requirements:** D-02/D-03, N-02/N-04/N-05, S-02, A-01, F-04; assumptions AS-05/AS-08.
- **Final human decision:** **Accepted: GitHub Actions + OIDC / Microsoft Entra workload identity federation**, by the requesting user on 2026-10-07. [ADR-006](../adr/ADR-006-cicd-strategy.md) is Accepted; see the [human acceptance entry](#human-acceptance-2026-10-07). Implementation/provisioning remains unauthorized.

## Problem/question and investigation scope

Choose a secure, reasonably simple delivery strategy for a small GitHub-hosted
weather application using accepted Azure Container Apps compute. Compare GitHub
Actions with Azure DevOps Pipelines on actual project fit, not cloud branding.
Resolve the Terraform/application boundary and enough release/security details
to make ADR-006 next, without designing an enterprise delivery platform.

**Original investigation prompt (faithful summary, not a transcript):** Read project instructions,
requirements, architecture, accepted ADR-001, proposed ADR-002 through ADR-006,
and existing AI investigations. Assume React/TypeScript, Node.js/TypeScript,
backend OCI images, ACR, Container Apps, PostgreSQL, Terraform, and GitHub.
Evaluate PR checks, lint/tests/types/builds, image versioning/publishing,
revisions/readiness/rollback, Terraform plan/apply, application-owned migrations,
environments, secrets, OIDC, least privilege, protections, approvals,
traceability, failures, observability, cost, and workflow structure. Use current
official GitHub/Microsoft documentation. Save a concise engineering record;
do not modify any ADR, generate workflows/Terraform/application code, provision
resources, or select frontend hosting. No secrets or application personal data
were included; no redactions were needed.

The original no-ADR-edit instruction applied to the investigation phase.
The subsequent explicit acceptance request supersedes it for ADR-006 only;
the approval scope is recorded below.

### Project context read

- [Shared contract](../../AGENTS.md), [Copilot instructions](../../.github/copilot-instructions.md), and [requirements](../requirements.md).
- [Architecture alternatives](../architecture/alternatives.md), [frontend foundation](../design/README.md), [ADR process](../adr/README.md), and ADR-001 through ADR-006.
- [AI convention](README.md), [requirements investigation](01-requirements-analysis.md), [initial compute evaluation and decision history](02-compute-platform-evaluation.md), and [cost-effectiveness reassessment](03-cost-effectiveness-reassessment.md).

The concurrent [database investigation](04-database-architecture-evaluation.md)
and [entry-point investigation](05-global-entry-point-evaluation.md) appeared
during this session. Their summaries and delivery-related sections were
cross-checked: private migration connectivity, separate SQL roles, release
connection overlap, and origin-restricted smoke-test access are relevant here.
At investigation time, their Flexible Server/Entra and Front Door Standard
recommendations were **Pending**, not dependencies selected by this record.
Other sessions own those files; this session's acceptance update changes only
ADR-006 and this CI/CD investigation.

ADR-001 selects Container Apps, not a deployable configuration. Region,
database hosting, network/security configuration, frontend hosting, and entry
point remain unresolved. The current request supplies stack/registry assumptions
for this investigation, not approvals of those other ADRs. Preserve non-public
PostgreSQL, instance/AZ resilience, privacy, and explicit cost-benefit evaluation.

## Options considered

The capability columns below are grounded in the sources listed later.
Complexity, overhead, and suitability are architectural judgments.

| Criterion | GitHub Actions | Azure DevOps Pipelines |
| --- | --- | --- |
| Implementation complexity | Workflows, checks, environments, and source review in the existing repository. Lowest setup burden here. | YAML pipelines plus an Azure DevOps organization/project, repository connection, service connections, permissions, and environments. Useful capabilities, more setup here. |
| GitHub integration | Native PR checks, repository permissions, workflow review, deployment records, and run links. | Supports GitHub commits and PR validation; source need not move to Azure Repos. Separate user/permission administration remains. [S8] |
| OIDC / federation | GitHub OIDC exchanged through `azure/login`; no Azure client secret required. [S1/S2] | ARM service connections support workload identity federation using app registrations or managed identities; Microsoft recommends federation. [S7] |
| Container Apps support | Official deployment action can deploy an existing image; Azure CLI exposes revision/traffic controls. [S4/S11] | Built-in `AzureContainerApps@1` task supports existing images; Azure CLI can implement the same revision/traffic controls. [S6/S11] |
| Terraform workflow | Run the standard Terraform CLI with protected state, plan/apply jobs, federation, and approvals. No Terraform SaaS required. | Same CLI/state/gating model; service connections and approvals/checks integrate well. Neither platform makes unsafe Terraform code safe. |
| Secrets/security | Minimal `GITHUB_TOKEN`, scoped OIDC trust, environment protection, action pinning, isolated PR checks. [S1/S3/S9] | Scoped federated service connections, pipeline authorization, resource approvals/checks, secret variables or secret-store integration. [S7/S19] |
| Deploy/rollback experience | Explicit ready-revision checks, traffic switch, smoke tests, and rollback in release jobs; deployment history in GitHub. | Equivalent release logic with deployment jobs and environment history. Neither deployment wrapper alone proves application health or reverses schema changes. |
| Operational overhead | One source/delivery administration surface; standard hosted Linux runners initially. | Another control plane and permission/connection lifecycle. Justified if already required by a client, not by Azure hosting alone. |
| Cost | Standard hosted runners are free for public repositories; private repositories have plan-dependent allowances. Artifact/cache storage, larger runners, and excess usage need budgeting. [S14] | Microsoft-hosted free tier must be enabled; private-project allocation is one parallel job, 1,800 minutes/month, maximum 60 minutes/job. Paid capacity and agent operations may add cost. Do not assume automatic free capacity. [S15] |
| Small assignment fit | **Preferred:** all required controls without a second delivery platform. | Technically sound alternative, but no demonstrated benefit offsets extra administration here. |

**Cost judgment:** Both can support modest assignment usage without large
runner spend, subject to actual entitlements. No measured job-duration forecast
or account billing inspection was performed. ACR storage, release-overlap
replicas, migration jobs, logs, state storage, and any extra cloud environment
are shared Azure costs, not reasons to choose one pipeline provider. Standard
hosted runners avoid maintaining an always-on private runner.

## Verified findings

1. **Credentialless Azure access is supported by both platforms.** GitHub
   documents OIDC with Azure federation and job permission `id-token: write`.
   This permission permits requesting a token, not modifying Azure resources;
   Azure RBAC determines resource access. Azure DevOps likewise recommends
   federated ARM service connections. [S1/S7]
2. **Both can deploy prebuilt Container Apps images.** Therefore building an
   image once and deploying the same digest is practical without allowing the
   deployment action/task to provision infrastructure. Quickstart examples
   using registry admin credentials are not security recommendations for this
   project. [S4/S6]
3. **Revision behavior is explicit.** Image/template changes create revisions;
   ingress traffic, labels, registry configuration, and secrets are
   application-scope settings, not revision snapshots. Single revision mode
   keeps old traffic until the replacement is provisioned, scaled, and passes
   startup/readiness checks. Multiple revision mode permits controlled traffic
   allocation and reactivation of retained revisions. [S5/S11]
4. **Readiness is not release acceptance.** Microsoft documents HTTP/TCP
   probes and says to wait for readiness before shifting traffic in multiple
   revision mode. A listening TCP port does not prove database compatibility,
   authorization, or user journeys. Smoke tests and bounded deployment waits
   are still application responsibilities. [S10]
5. **Revision-based blue/green is documented.** Two revisions within one app
   can provide candidate testing and traffic-switch rollback; this does not
   require duplicate full infrastructure stacks. [S12]
6. **Registry pulls need not use passwords.** Container Apps supports managed
   identity for ACR pulls. ACR roles depend on its permissions mode:
   `AcrPush`/`AcrPull` for classic registry RBAC, or Repository Writer/Reader
   with optional repository conditions for ABAC mode. [S13/S16]
7. **Migrations have an in-Azure execution path.** Manual Container Apps Jobs
   run finite tasks in the same environment, sharing networking/logging, and
   can be started through an API. Thus a hosted CI runner need not directly
   connect to private PostgreSQL. [S17]
8. **Approval features depend on repository visibility and plan.** Required
   environment reviewers on GitHub Free/Pro/Team are available only for public
   repositories. Private-repository environments alone do not imply required
   reviewer support. Preventing self-review needs another human. [S3]
9. **State is sensitive infrastructure data.** Microsoft documents Azure Blob
   remote state, locking, encryption at rest, and the possibility of secrets
   in state. Its access-key tutorial must not be copied as justification for
   long-lived CI credentials. [S18]
10. **Deployment telemetry is available.** Container Apps exposes system and
    console logs, metrics, Log Analytics, and alerts. These capabilities still
    need configured collection, retention, and response ownership. [S20]

### Two current-documentation security details

- GitHub now documents immutable OIDC subjects containing owner/repository IDs
  for repositories created after July 15, 2026, or renamed/transferred after
  that date. Older repositories can retain the previous subject format.
  Configure Entra federation against this repository's actual subject; do not
  blindly copy a legacy `repo:owner/name:environment:production` example.
  No actual subject or repository creation metadata was inspected. [S1/S2]
- Container Apps Jobs Operator/Contributor include wildcard actions that can
  expose secrets. Even narrowly granting job start permits execution-template
  overrides and use of the job's secrets/available managed identities.
  A migration-job starter is therefore a trusted release identity, not an
  innocuous scheduler permission. [S17]

## Recommended responsibility boundary

Ownership is **property-level**, because Terraform and delivery touch the same
Container App resource. RBAC scope alone does not enforce that distinction.

| Terraform: infrastructure provisioning/configuration | CI/CD: application build/test/release/deployment |
| --- | --- |
| Resource groups, ACR, Container Apps environment/app shell, PostgreSQL infrastructure, networking/DNS, identities/RBAC, secret-store resources, monitoring resources, remote state. | Lint, tests, type checks, frontend/backend builds, backend image construction/scanning/publication, version metadata, deployment verification and recovery. |
| Desired CPU/memory, scaling/minimums/limits, probes/ports, normal runtime configuration and secret references, registry pull identity, revision mode, ingress security settings. | Backend image digest, release revision suffix, candidate label, traffic weights, revision activation/deactivation, and release execution records. |
| Provision the manual migration Job, connectivity, resources, retry/timeout policy, identity, and secret references. | Select the approved release image/command in a per-execution override, start the migration, await success, and coordinate schema compatibility. |
| Infrastructure changes follow plan/review/apply. They can create revisions and require coordinated release verification. | Never create missing infrastructure, change networking/scaling/secrets/settings opportunistically, or run Terraform apply as part of every application release. |

**Prevent competing writers:** Seed app creation with an explicitly approved,
digest-pinned bootstrap image and explicit initial traffic configuration. After
creation, narrowly exclude only CI-owned image/revision/traffic/label fields
from Terraform reconciliation using supported provider lifecycle/property
management. Do not ignore the entire template or all ingress: that would also
hide Terraform-owned probes, scaling, resources, and security drift.
Confirm precise field support against the pinned provider/API before coding.
If necessary, use a narrowly scoped AzAPI resource/update rather than broaden
the ignored surface. Resource replacement must seed the recorded approved
release, not a stale placeholder, then pass release verification.

Keep application pipelines to image/revision/traffic operations against existing
resources, preferably Azure CLI for clarity. Do not use broad app YAML exports
or action defaults that overwrite configuration or create resources. A subsequent
Terraform plan must show no attempt to undo a release or rollback, while still
detecting drift in infrastructure-owned fields. This is a mandatory
implementation acceptance check, not a verified provider configuration.

**Database migrations are never Terraform-owned.** No SQL provisioners,
`local-exec` migration commands, schema resources, or migration side effects
during plan/apply. Terraform database provisioning is not application data recovery.

## Sensible workflow structure and triggers

Recommend **three small workflows**, with jobs rather than further workflow
fragmentation. Names below are design suggestions only; no files are generated.

| Proposed workflow | Triggers and responsibilities |
| --- | --- |
| `ci.yml` | `pull_request` targeting protected `main`, plus `workflow_call` for trusted release validation. Read-only, no Azure identity or production secrets. Required aggregate CI check runs on all PRs; inexpensive documentation-only handling is allowed without leaving required checks permanently skipped. |
| `deploy-backend.yml` | `push` to protected `main` affecting backend/shared dependencies, lockfiles, Docker inputs, migrations, or release workflows. Invoke the reusable CI checks against that exact merged commit, then build/publish/deploy. `workflow_dispatch` supports explicit promotion/retry/rollback of an existing approved digest/revision, using the protected-main workflow definition. No privileged `workflow_run` artifact handoff. |
| `infrastructure.yml` | PR infrastructure changes: fmt/init-without-backend/validate only. Infrastructure changes on protected `main`: authenticated plan, then approval-gated apply. Manual dispatch permits reviewed plan/apply or drift inspection on protected `main`. No applies from PRs or ordinary app-only commits. |

This avoids a race between a separate CI completion event and privileged
deployment, and avoids duplicating check definitions. Release validation of the
merged commit is deliberate: a successful PR merge-ref check does not establish
that the final branch commit/image passed. If frontend-only changes need
post-merge CI before hosting is selected, run `ci.yml` on those `main` pushes
without backend deployment; maintain disjoint trigger filters.

Two workflows (application CI/release plus infrastructure) would also work with
strict job-level permissions. Three are preferred for visible untrusted-CI,
release, and infrastructure boundaries and clear rerun/rollback entry points,
not because more files improve security. No separate rollback workflow,
release-management service, GitOps controller, deployment branches, or broad
reusable-workflow framework is warranted.

### PR and trusted-release checks

- Use supported pinned Node/tool versions and lockfile-based installation.
  Run repository-standard lint and automated tests for frontend and backend.
  Add unit tests plus PostgreSQL integration tests using a disposable CI
  database and synthetic fixtures, not a production connection.
- Run TypeScript checking for both projects and actual production builds.
  A frontend bundler completing is not necessarily a full TypeScript check.
  Test authentication/authorization, preference isolation, provider failures,
  and migration compatibility as required by the existing project instructions.
- Build the backend Docker image on relevant PRs without pushing or logging
  into Azure; verify startup/health where practical. Scan dependencies and the
  deployable image; define blocking severity and reviewed exceptions before
  enabling the gate. Keep results sanitized.
- Frontend CI produces a service-neutral static build artifact. No frontend
  deploy step or Azure hosting assumption is included.
- Fail the required check on any required lint/test/type/build failure; publish
  sanitized diagnostics even when a job fails. Do not use success-shaped
  fallbacks or blanket `continue-on-error`.

### Image identity and traceability

Build the trusted release image once; promote the identical digest if a second
environment is introduced. Use a tag such as
`sha-<full-commit>-run-<run-id>-<attempt>` so retries/base-image rebuilds cannot
silently replace an earlier image for the same commit. Deploy
`registry/backend@sha256:<digest>`, never `latest`. An optional human release
version is another alias, not a new build. Unique tags are an operational policy,
not intrinsically immutable registry objects. [S4/S21]

Record commit, workflow run/attempt, image digest, OCI source/revision labels,
test/scan result, migration version/execution ID, target environment, candidate
revision, previous good revision/digest, timestamps, approver, and final outcome.
Retain active and known-good images/revisions beyond the agreed rollback window;
do not let image cleanup delete a still-referenced digest. An inactive revision
may need to pull/start again, and platform history is finite. SBOM/attestation
is useful if inexpensive, but a signing infrastructure is not an assignment
prerequisite.

## Backend release, readiness, rollback, and failures

Recommend **multiple revision mode with a simple 0% -> 100% cutover**, not a
percentage-canary analysis system. Single revision mode is simpler and has
documented readiness-gated automatic cutover, but deactivates the old revision
and provides less control for pre-traffic acceptance tests. The small extra
traffic-switch logic is justified by ADR-001's release/rollback rationale.
Use ordinary revision labels/direct revision access; do not depend on the
separate preview deployment-label revision mode. [S5/S10/S12]

1. Validate the merged commit, build/scan, and push the image. Publishing alone
   is not a successful deployment. Verify the stored digest.
2. Acquire the protected target-environment gate **before any migration or
   runtime mutation**. Serialize the entire migration/deployment/verification
   sequence for that environment.
3. Read and record the currently serving known-good revision and traffic
   weights. Verify its image is retained. First deployment has no previous
   revision: failures must be reported without claiming rollback succeeded.
4. Run only the required backward-compatible migration through the manual Job;
   await its execution result with a timeout. Failure stops the release while
   old traffic remains unchanged.
5. Create the candidate from the intended current Terraform-owned configuration
   with the new digest and a unique valid revision suffix. Keep public app
   traffic explicitly at 100% on the named old revision, not `latestRevision`.
6. Await successful provisioning and healthy startup/readiness with bounded
   polling. Verify ready replica capacity consistent with configured release
   requirements; account for overlapping connection pools and replica costs.
   A returned update command or created revision is not success.
7. Smoke-test the candidate-specific URL/label, using synthetic data and
   authentication where appropriate. Zero main-endpoint traffic does not make
   that URL private: retain normal authorization and reviewed ingress controls.
   If an eventual edge/origin policy blocks hosted-runner access, use a reviewed
   in-environment test path, such as a finite smoke-test Job, rather than
   temporarily opening ingress or disabling origin validation.
   Test startup, database/schema compatibility, login/preferences, and safe
   OpenWeather degradation without making provider availability a global
   readiness dependency.
8. Switch 100% traffic to the verified candidate; smoke-test the normal endpoint
   and observe errors/latency/restarts over a bounded stabilization window.
   Record success only after these checks. Retain the previous revision ready
   during that window, then deactivate it to avoid indefinite duplicate costs.

Readiness should reflect ability to serve required API work, including bounded
database/schema checks where appropriate. Liveness should avoid restart storms
on database/provider outages. Startup accounts for process initialization,
**not schema migration execution**. Define probe timings, observation windows,
capacity thresholds, and rollback time targets during implementation; none
are presented as measured now.

**Rollback:** Before cutover, candidate failure leaves the old revision serving;
collect diagnostics and deactivate the failed candidate. After cutover, a
failed bounded acceptance check should attempt traffic restoration to the
recorded previous revision. A manual dispatch provides the same operation for
later regressions. If inactive, reactivate the known-good revision, wait for
readiness, switch traffic, and verify the public endpoint. If it was purged,
redeploy its retained exact digest against compatible current configuration.
Do not rebuild old source and call it the same artifact.

Automatic rollback is conditional on an available healthy, schema-compatible
target. If restoration fails, the workflow remains failed, alerts the operator,
and reports both the original and recovery errors. App-level secrets/ingress,
Terraform changes, and PostgreSQL schema are not restored by revision rollback.
Use reviewed roll-forward or database recovery when image rollback is unsafe.

Serialize application releases, rollback, and infrastructure mutation using a
shared environment mutation concurrency group across workflows. Do not cancel
in-progress mutation jobs when a newer commit arrives; cancellation mid-migration
is unsafe. CI-only runs may cancel superseded checks. GitHub's default pending
run replacement and non-guaranteed ordering mean a release must recheck that
its digest/commit is still the intended target before mutation; use the supported
queue option if retaining every pending request is necessary. [S22]

## Terraform plan/apply placement

Run both in GitHub Actions' dedicated infrastructure workflow, not manually as
the normal delivery path and not inside backend deployment.

- Every relevant PR runs `terraform fmt -check -recursive`,
  `terraform init -backend=false`, and `terraform validate`, with pinned
  Terraform/provider versions and committed provider lockfile. Validation is
  not a live cloud plan.
- **Never give unreviewed PR code cloud/state credentials**, including apparently
  internal PRs: Terraform providers/modules/data sources can execute code.
  No automatic authenticated plans for forks. For this assignment, the live
  plan occurs after review/merge on protected `main`; optional pre-merge cloud
  planning needs an explicit trusted-code review gate, not merely an actor check.
- After merge, create a fresh saved plan for the exact reviewed commit and
  environment, repeating fmt/validate on that commit before planning. Handle
  Terraform detailed exit codes correctly: changes are not
  a command failure. Review creates/updates/deletes/replacements, especially
  database, state, network, and identity changes.
- Apply only that saved plan after protected-environment approval. Tie approval
  to the commit and plan identity/checksum, not just a workflow title. If the
  commit, inputs, state, or relevant deployment configuration changes, regenerate
  and reapprove; never silently apply a different plan.
- Share the environment mutation lock across plan/apply and releases; use remote
  state locking as well. Preserve state recovery evidence after failed apply;
  do not automatically retry a potentially destructive or partially completed
  operation. Plan/reconcile again before continuing.
- Use Azure Blob remote state, separate state keys/access boundaries per
  environment, encryption, no anonymous access, least-privilege Entra data-plane
  access, locking, and recoverable versioning/backup policy. Configure federation
  for both Azure provider **and backend**; `azure/login` alone is not proof both
  use the intended identity. Avoid storage account keys/SAS in CI.
  AzureRM's current authentication guide documents provider OIDC explicitly.
  For the backend, combine OIDC with Entra blob authentication rather than
  OIDC followed by storage-key retrieval; this distinction is documented in
  Terraform's official versioned backend source. Recheck the pinned version.
  [S23/S24]
- Treat saved plans/state as sensitive. Never commit them, put raw plan JSON in
  public PR comments, or upload plaintext sensitive plans as ordinary public
  repository artifacts. Public-repository plan handoff needs a restricted
  encrypted Azure storage location accessed via federation, or an appropriately
  protected encrypted handoff. Short retention alone does not provide privacy.
  Approval summaries must be deliberately sanitized.
- Bootstrap state storage and federation through a one-time approved operator
  procedure, then bring reproducible resources under Terraform. Do not give
  routine workflows subscription Owner simply to bootstrap themselves.

Routine app releases never invoke apply. Infra changes that create revisions
must preserve the approved image/traffic and run relevant readiness/acceptance
checks. Infrastructure recovery normally means a reviewed corrective plan,
not blindly applying an older configuration that might destroy data.

## Database migration ownership and execution

Application maintainers own versioned migrations in source control, review,
compatibility tests, and recovery instructions. CI/CD orchestrates **one
serialized migration execution per target release**, with a migration history
table and database lock to prevent duplicate/concurrent application. No migration
on every replica startup. A workflow rerun checks recorded migration state.

Recommend a Terraform-provisioned **manual Container Apps Job** in the private
database-connected environment, using the release image's migration command.
CI starts an execution with the exact approved digest and waits for its terminal
success; start acceptance alone is not migration success. The hosted runner
accesses Azure's control plane, not PostgreSQL. Validate private DNS, direct
database connection needs, authentication, timeouts, and Job logging before use.
No permanent self-hosted runner or temporary public DB firewall hole is needed
for this pattern. [S17]

Use a separate limited DDL-capable database role/identity for migrations; the
normal API role should not alter schemas. Secret storage/Entra PostgreSQL
authentication remains coordinated with ADR-005 and the database decision.
The migration Job needs only its own necessary data/secrets, never the API's
OpenWeather credentials or infrastructure privileges.

Use expand/contract: apply additive changes compatible with the old serving
revision, deploy the new app, and defer destructive cleanup until the rollback
window closes. Where supported, use transactions; handle nontransactional
operations with explicit recovery steps. No blind automatic migration retries
or automatic down-migrations on image rollback. Review irreversible changes,
backup/restore readiness, and mixed-version behavior before approving release.

## Environments, authentication, and necessary controls

### Environment separation without unnecessary spend

Use local development and disposable CI PostgreSQL as nonproduction. A small
assignment can start with **one deployed demonstration target**, governed as
production, plus an optional inexpensive/on-demand Azure `dev` target if
end-to-end promotion testing warrants it. A permanent dev/staging/prod trio is
not required. If dev exists, deploy there automatically and promote the same
tested digest to production after approval.

Each deployed environment has separate GitHub environment configuration,
deployment identity, Terraform state, app/Job resources, secrets, and database
access/data boundaries; use resource groups as the basic Azure separation.
Shared ACR can be acceptable with scoped permissions and retained digests.
Nonproduction never uses production accounts/data/DB credentials. A revision
label is not a separate security environment. Production HA is not waived
because development capacity is cheaper.

### GitHub -> Azure authentication and least privilege

Use **OIDC / Microsoft Entra workload identity federation** through the official
`azure/login` action. Prefer a federated Entra app/service principal for each
required permission boundary; a federated user-assigned managed identity is
also supported, not a different security principle. No Azure client secret,
certificate, publish profile, registry admin password, or backend storage key
is required. Client/tenant/subscription IDs are configuration identifiers, not
authentication secrets. [S1/S4]

Validate issuer `https://token.actions.githubusercontent.com`, audience
`api://AzureADTokenExchange`, and the actual exact repository/branch or
environment subject. Environment subjects do not by themselves restrict
branches: combine them with explicit protected-main environment restrictions.
Do not trust arbitrary branches, repositories, or the PR subject.
Grant `id-token: write` only to jobs that need Azure; default `contents: read`,
and add only necessary deployment-record/artifact permissions. No OIDC or
secret inheritance into untrusted CI. [S1/S2/S3/S9]

| Identity boundary | Recommended effective access |
| --- | --- |
| Image publisher, trusted main only | Push/read the backend repository in ACR; no Container Apps, PostgreSQL, Terraform state, or RBAC administration. |
| Backend release identity per deployed environment | Update only its existing app's release surface, inspect revisions/health, change traffic, and start/read its migration Job executions. No infrastructure role assignment, state access, registry deletion, or database admin access. |
| Terraform planner | Necessary resource reads and restricted backend access/locking; no resource mutation. State access is still sensitive and backend locking may require blob writes. |
| Terraform applier | Necessary environment-scoped infrastructure writes and backend access. RBAC/federated-identity changes require explicitly scoped authorization or a separate approved operator step, not subscription Owner. |
| Runtime identities | ACR pull only for app/Job; separately bounded access to their necessary runtime secrets/data. No CI deployment or infrastructure permissions. |

Inspect the actual role definitions. Container App write permission can deploy
arbitrary code using its runtime identity, and Job start permission can likewise
use migration credentials. These are high-trust roles even without
`listSecrets`. A small custom role is justified when built-ins grant unnecessary
delete/secret/wildcard permissions; do not claim Azure RBAC can restrict an app
write to just its image field. Pipeline review and narrow commands enforce the
remaining ownership boundary. ACR mode-specific roles and exact provider/backend
permissions must be verified rather than guessed. [S16/S17]

### Repository, supply-chain, and secret controls

- Protect `main`: require successful CI, reviewed changes, and no force pushes;
  restrict bypass/direct writes. Require designated review of workflow,
  Terraform, Docker/dependency, and migration changes. Use CODEOWNERS where
  useful, not as a substitute for enforced review.
- Require production deployment and infrastructure-apply approval; restrict
  permitted environment branches explicitly to `main`, and disable approval
  bypass where supported. Prevent self-review if another authorized reviewer
  is available. For a solo assignment, record that approval is operator intent,
  not independent separation of duties.
- Check actual GitHub visibility/plan before promising reviewer gates. If
  unavailable, a restricted operator-triggered manual workflow plus protected
  branch is a weaker documented fallback, not equivalent enforced approval.
  Upgrade/change the approved control approach if independent approval is
  mandatory; do not quietly omit it. [S3]
- Isolate forks/untrusted PRs on disposable hosted runners, without secrets,
  production network access, or write tokens. Avoid `pull_request_target` with
  PR checkout and privileged processing of PR artifacts/caches. [S9]
- Pin third-party actions to verified full commit SHAs; review updates, pin
  runtime/base images and dependency lockfiles, and maintain base-image rebuilds.
  Quote/validate dispatch inputs and avoid interpolating untrusted PR text into
  shell scripts. [S9]
- Keep runtime OpenWeather/DB secrets out of GitHub builds, images, frontend
  assets, Terraform outputs, and AI records. Deliver them via the reviewed
  Azure runtime secret mechanism with managed identity where supported.
  The exact store is ADR-005's decision, not selected here.
- Keep unavoidable CI secrets environment-scoped, rotate/revoke them, sanitize
  logs and diagnostics, and inspect failure paths; masking is not guaranteed
  for transformed values. Protect plan/state/scan artifacts and use deliberate
  retention. OIDC removes long-lived Azure credentials, not all application
  secrets or the need to secure trusted workflow code.

## Deployment observability

Use GitHub run summaries and deployment records for intent/outcome/approvals,
and Azure Activity Log plus Container Apps revision/system/console logs for
resource operations, startup, image-pull, and probe failures. Correlate commit,
digest, revision, run, migration execution, and environment. Emit structured
application logs without passwords, tokens, precise personal locations, or
connection strings.

Observe ready replicas, restarts, HTTP error rate/latency, database connection
pressure, and migration status. Use a small dashboard and failure notification
to the named operator; define retention and low-volume alerts before relying
on them. A green workflow must mean the verified release is serving, not just
that a control-plane command returned successfully. Full tracing/APM and
automated SLO-driven canary analysis are optional, not prerequisites. [S20]

## Rejected alternatives and uncertainties

**Investigation-stage rejected recommendations:** The platform rejection and
security/ownership principles are now human-approved within the scope below;
the remaining implementation trade-offs are not separately approved selections.

- Azure DevOps merely because Azure hosts the app: both providers meet the
  technical requirements; extra control-plane overhead lacks project value.
  Reconsider if a client mandates it or supplies existing governance/tooling.
- Long-lived Azure credentials, registry admin passwords, unreviewed-PR cloud
  plans, Terraform-owned migrations, mutable deployment tags, or rebuild-based
  rollback: unnecessary risk or weak traceability.
- Single revision automatic cutover as the preferred release mode: simpler,
  but less control over pre-traffic smoke tests and retained-revision rollback.
- Applying infrastructure on every application deploy, broad config exports,
  or ignoring whole Terraform resource blocks: competing ownership/drift risk.
- Permanent private runners, mandatory three-cloud-environment promotion,
  deployment branches, GitOps, preview deployment labels, and automated
  percentage-canary platforms: no demonstrated assignment benefit.

**Uncertainties / implementation prerequisites:**

- Repository visibility, GitHub plan, reviewer availability, Azure tenant
  federation/bootstrap permission, exact OIDC subject, and actual RBAC scopes
  were not inspected. Approval feasibility must be confirmed.
- Region/database/network decisions must supply private Job connectivity and
  an appropriate runtime secret/data authentication mechanism. Additional
  registry/state network restrictions could require a runner access solution;
  do not assume hosted runners can reach private data-plane endpoints.
- Pin and verify Terraform provider/API support for narrow release-field
  exclusions, label/traffic retention, and backend/provider federation.
- Migration library/ORM, DB identity, irreversible-change procedure, rollback
  window, probe/smoke thresholds, deployment timeouts, capacity/connection
  budgets, and alert/incident owner remain implementation choices.
- No application, workflows, Terraform, Azure resources, billing accounts,
  migrations, runtime tests, or rollback drills exist or were executed for this
  investigation. Verified claims are documentation capabilities, not observed
  system behavior. Test failed image pulls/readiness, failed migrations,
  concurrent releases, traffic rollback, and Terraform non-reversion after a
  release when implementation is authorized.

These are normal implementation prerequisites, **not genuine technical
blockers to accepting ADR-006's platform/ownership strategy**. Frontend hosting,
exact region, ORM, and detailed observability choices need not block that ADR.
An unavailable mandatory approval mechanism or inability to establish
federation would be a real governance/access blocker if confirmed; neither was
established here. Do not describe the deployable system as approved or verified.

## Final recommendation for ADR-006

1. **Platform:** Select GitHub Actions, with three small CI, infrastructure,
   and backend-release workflows. Azure DevOps is a capable but unjustified
   extra platform for this GitHub-based assignment.
2. **Azure authentication:** GitHub OIDC -> Entra workload identity federation
   -> short-lived Azure tokens, scoped by actual repository subject, protected
   environment, and least-privilege RBAC. No long-lived Azure credentials.
3. **Triggers:** PR validation; trusted-main backend changes for build/publish
   and gated release; trusted-main infrastructure changes for plan and gated
   apply; protected manual dispatch for rollback/promotion/recovery/drift.
4. **Deploy/rollback:** Publish a uniquely tagged image, deploy its digest as
   a zero-main-traffic candidate revision, gate on readiness and smoke tests,
   switch traffic, and verify. Restore a retained known-good ready revision
   on failure; preserve compatible schema and exact artifacts.
5. **Terraform:** Dedicated workflow; unprivileged PR fmt/validate, live plan
   after trusted merge, review/approval of the exact saved plan before apply.
   Secure federated remote state and narrow property ownership.
6. **Migrations:** Application-owned versioned migrations, run once under
   serialization/DB locking through a private-connected manual Container Apps
   Job using the release artifact, before cutover; expand/contract, not
   Terraform or automatic down-migrations.
7. **Security:** Protected branch/environments, approvals where supported,
   PR isolation, scoped identities/tokens, managed-identity ACR pulls, reviewed
   pinned dependencies/actions, protected state/plans/secrets, serialized
   mutations, traceable artifacts, explicit failures, and deployment telemetry.
8. **Blockers:** No demonstrated technical blocker to accepting this scoped
   strategy. Confirm account-level approval/federation feasibility and record
   remaining implementation validations without extending research indefinitely.

### Human acceptance: 2026-10-07

- **Human decision owner / date:** Requesting user, 2026-10-07.
- **Approval reference:** Explicit follow-up instruction: "Accept ADR-006."
  The user selected GitHub Actions and GitHub Actions -> Azure authentication
  through OIDC / Microsoft Entra workload identity federation, and expressly
  superseded the earlier prohibition on modifying ADR-006.
- **Prompt / scope (faithful summary):** Update only ADR-006 and this AI record.
  Record Accepted status, three focused workflow responsibilities, immutable
  image/revision validation and rollback, separately reviewed Terraform
  plan/apply, application-owned compatible serialized migrations, necessary
  security controls, and Azure DevOps as the strongest rejected platform.
  Preserve evidence/sources, defer frontend deployment and exact workflow
  filenames, and inspect/validate the owned-file changes. Do not generate
  workflows, application code, Terraform, or modify any other repository file;
  do not stage or commit.
- **Selected strategy:** **GitHub Actions + OIDC / Microsoft Entra workload
  identity federation**, with no long-lived Azure client secrets for normal
  CI/CD authentication.
- **Accepted responsibilities:** Three focused workflows: CI/PR validation,
  infrastructure/Terraform, and backend build/deployment. Terraform owns Azure
  infrastructure, networking, identities, supporting resources, and declarative
  infrastructure platform configuration. CI/CD owns application validation,
  builds/images/publication, releases, Container Apps revision promotion, and
  release rollback. Migrations are versioned, serialized application/release
  responsibilities, never Terraform-owned, with rolling compatibility and
  expand/contract where required.
- **Accepted safeguards:** Candidate readiness/smoke validation before traffic
  promotion; retained known-good rollback artifacts/revisions; separate
  reviewed-plan apply and production approval; protected main/production,
  least-privilege identities, federation, managed-identity ACR pulls where
  appropriate, pinned actions, protected state/artifacts/plans, traceable
  versions, and deployment observability.
- **Strongest rejected platform:** **Azure DevOps Pipelines**. It is capable
  of meeting the requirements but adds another delivery platform and
  administrative surface without enough benefit here. Azure hosting alone is
  not a reason to choose it.
- **Deferred / not authorized:** Exact workflow filenames/YAML, frontend
  hosting/deployment, account-specific identity permissions and approval setup,
  migration tooling/runner configuration, Terraform provider/state/plan storage
  configuration, detailed topology/sizing/thresholds, provisioning, recurring
  spend, and application/infrastructure implementation. The manual Container
  Apps Job remains the recommended migration path subject to validation, not
  a generated or verified runner.
- **Validation status:** Official-source investigation is preserved above.
  Acceptance records a human decision, not successful OIDC, build, Terraform,
  migration, deployment, rollback, or HA tests. The implementation checks remain
  required before claiming operational readiness.

**Final human decision: Accepted - GitHub Actions + OIDC. Related ADR: ADR-006.**
ADR-006 was updated at the user's explicit direction; no other ADR was modified
by this session.

## Official evidence

Retrieved on 2026-10-07. Claims above use GitHub/Microsoft documentation;
architecture and workflow structure are recommendations, not provider mandates.
Pages can change; recheck configuration-sensitive claims during implementation.

- **[S1]** [GitHub: OIDC in Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)
- **[S2]** [GitHub: OIDC claims, subjects, and immutable subject rollout](https://docs.github.com/en/actions/reference/security/oidc)
- **[S3]** [GitHub: deployment/environment protection and plan limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- **[S4]** [Microsoft: Container Apps with GitHub Actions](https://learn.microsoft.com/en-us/azure/container-apps/github-actions)
- **[S5]** [Microsoft: Container Apps revisions, scope, readiness, and retention](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
- **[S6]** [Microsoft: Container Apps with Azure Pipelines](https://learn.microsoft.com/en-us/azure/container-apps/azure-pipelines)
- **[S7]** [Microsoft: federated Azure Resource Manager service connections](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/connect-to-azure?view=azure-devops)
- **[S8]** [Microsoft: Azure Pipelines integration with GitHub](https://learn.microsoft.com/en-us/azure/devops/pipelines/repos/github?view=azure-devops)
- **[S9]** [GitHub: secure workflow use, tokens, PR checkout, and action pinning](https://docs.github.com/en/actions/reference/security/secure-use)
- **[S10]** [Microsoft: Container Apps health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- **[S11]** [Microsoft: managing revisions and images](https://learn.microsoft.com/en-us/azure/container-apps/revisions-manage)
- **[S12]** [Microsoft: revision-based blue/green deployment](https://learn.microsoft.com/en-us/azure/container-apps/blue-green-deployment)
- **[S13]** [Microsoft: managed-identity ACR image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
- **[S14]** [GitHub: Actions billing and storage](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- **[S15]** [Microsoft: Azure Pipelines parallel-job allowances](https://learn.microsoft.com/en-us/azure/devops/pipelines/licensing/concurrent-jobs?view=azure-devops)
- **[S16]** [Microsoft: ACR permissions modes and recommended roles](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-rbac-built-in-roles-overview)
- **[S17]** [Microsoft: Container Apps Jobs, execution overrides, and permission risks](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- **[S18]** [Microsoft: Terraform remote state in Azure Storage](https://learn.microsoft.com/en-us/azure/developer/terraform/store-state-in-azure-storage)
- **[S19]** [Microsoft: Azure Pipelines approvals and checks](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/approvals?view=azure-devops)
- **[S20]** [Microsoft: Container Apps observability](https://learn.microsoft.com/en-us/azure/container-apps/observability)
- **[S21]** [Microsoft: unique image tags, digests, and rebuild identity](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-image-tag-version)
- **[S22]** [GitHub: workflow/job concurrency and queue behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- **[S23]** [HashiCorp: current AzureRM provider OIDC guide source](https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/guides/service_principal_oidc.html.markdown)
- **[S24]** [HashiCorp: Terraform 1.9.8 Azure backend authentication source](https://raw.githubusercontent.com/hashicorp/terraform/v1.9.8/website/docs/language/backend/azurerm.mdx) (supplementary versioned evidence, not a version selection)

### Verification limitations and documentation checks

Research accessed public documentation only; Azure tools were used for
documentation-oriented capability discovery, not tenant inspection or deployment.
HashiCorp's current documentation pages returned title-only content to the fetch
tool; its current AzureRM provider OIDC guide source was successfully retrieved.
Supplementary official Terraform 1.9.8 source documentation confirmed saved
plan, shared-ownership, and backend OIDC/Entra authentication concepts, not current
provider property coverage. Exact provider/backend implementation remains a
stated validation prerequisite.
No links to inaccessible guessed source paths are used as evidence.

This record is the requested concise conversation/findings record, not a raw
transcript. Its filename follows the user's explicit request. The original
investigation created only this record and left ADRs unchanged. The subsequent
human-authorized acceptance update changes only this record and ADR-006, linking
the decision and approval evidence in both directions.
Local Markdown targets and source-reference definitions are checked, and the
acceptance diff is reviewed only for the two owned files. Concurrent sessions'
changes are not modified or cleaned up; no files are staged or committed.
