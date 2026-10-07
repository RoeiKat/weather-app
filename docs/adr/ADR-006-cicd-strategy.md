# ADR-006: CI/CD strategy and ownership

## Status

**Accepted**.

- Human decision owner: Requesting user.
- Approval date: 2026-10-07.
- Approval reference: Explicit instruction to accept ADR-006, recorded in the
  [CI/CD investigation's human acceptance entry](../ai/06-cicd-strategy-evaluation.md#human-acceptance-2026-10-07).
- Accepted scope: GitHub Actions, federated Azure authentication, three focused
  workflow responsibilities, infrastructure/release ownership, and the release
  safety/security principles below.
- This acceptance authorizes the decision documentation, not workflow YAML,
  application/Terraform implementation, Azure provisioning, or recurring spend.

## Context

The small weather application is hosted in a GitHub repository.
[ADR-001](ADR-001-compute-platform.md) selects Azure Container Apps as compute.
The delivery design assumes a React/TypeScript frontend, Node.js/TypeScript
backend packaged as a Docker/OCI image, Azure Container Registry (ACR),
PostgreSQL, and Terraform-owned reproducible infrastructure.

Delivery must provide reliable validation, traceable artifacts, safe revision
promotion, and recoverable releases without enterprise platform overhead.
Terraform and application delivery touch the same Container App but must not
compete over its configuration. Database schema changes need release-aware
ownership and cannot be treated as infrastructure provisioning.

Frontend hosting and deployment remain undecided. This ADR does not select
Static Web Apps, App Service, or any other frontend service. Region, networking,
database configuration, exact identity permissions, and implementation sizing
remain subject to their own decisions and validation.

## Requirements

[Requirements](../requirements.md): D-02/D-03, S-02, A-01, F-04,
N-02/N-04/N-05; private PostgreSQL and release resilience under AS-08/AS-05.

## Options considered

- **GitHub Actions: selected**, for application delivery and separately
  governed Terraform execution in the existing source repository.
- **Azure DevOps Pipelines: strongest rejected platform alternative**. It
  supports GitHub integration, workload identity federation, Container Apps
  deployment, Terraform, and approval controls. It adds another CI/CD platform,
  organization/project, service connections, permissions, and administrative
  surface without enough benefit for this GitHub-hosted project.
- Federated short-lived Azure identity versus stored client credentials:
  **OIDC federation selected**; long-lived Azure client secrets rejected for
  normal CI/CD authentication.

## Decision

Use **GitHub Actions** with **OpenID Connect (OIDC) / Microsoft Entra workload
identity federation** for Azure access. Organize delivery into three focused
workflows; exact filenames are implementation choices:

| Workflow | Responsibilities and expected triggers |
| --- | --- |
| CI / pull-request validation | PRs targeting protected `main`: lint, tests, TypeScript checks and production builds for frontend/backend, relevant backend image validation, and Terraform fmt/validate where applicable. No privileged production deployment, cloud/state credentials, or production secrets for untrusted PR code. Reuse validation for the exact trusted release commit. |
| Infrastructure / Terraform | Infrastructure changes: PR fmt/validate without privileged state access; authenticated plan for reviewed trusted code; separately protected apply of the reviewed plan. Manual dispatch supports reviewed infrastructure recovery/drift inspection. |
| Backend build and deployment | Relevant changes merged to protected `main`: validate, build/version/publish the backend image, then perform protected target-environment deployment. Manual dispatch supports approved promotion, retry, or rollback of a retained artifact/revision. |

Do not create extra workflow layers, deployment branches, GitOps controllers,
or a mandatory permanent dev/staging/prod topology without demonstrated value.
Frontend CI remains hosting-neutral; a frontend deployment workflow is deferred
until hosting is selected.

### Authentication strategy

GitHub Actions exchanges its OIDC token through `azure/login` for short-lived
Azure access using an explicitly trusted Entra application/service principal
or federated user-assigned managed identity. Normal CI/CD must not use
long-lived Azure client secrets.

Restrict issuer, audience, and the actual repository/branch or protected
environment subject. Verify this repository's current subject format rather
than copying a legacy example. Environment-subject trust must also have branch
restrictions; it does not independently limit deployment to `main`.

Grant `id-token: write` only to Azure-authenticated jobs. Use minimal
`GITHUB_TOKEN` permissions and separate least-privilege boundaries for image
publication, target-environment release, Terraform planning/apply, and runtime
access. OIDC does not replace RBAC or make trusted deployment code harmless.
Configure provider and state-backend federation explicitly.

Use Container Apps managed identity for ACR image pulls where appropriate,
with mode-correct pull-only registry permissions. Do not use registry admin
credentials as the normal release/runtime mechanism.

### Terraform boundary

**Terraform owns:**

- Azure infrastructure and supporting resources, including networking/DNS,
  infrastructure identities/RBAC, database infrastructure, and monitoring/state
  resources.
- Declarative platform configuration belonging to infrastructure: ingress
  security, registry identity, resource sizing/scaling, probes/ports, normal
  runtime configuration and secret references, and revision mode.
- Provisioning/configuration of supporting migration execution resources,
  not executing application migrations.

**CI/CD owns:**

- Application validation/build, Docker/OCI image build and publication.
- Application release/deployment, release image digest/revision identity,
  candidate validation, revision promotion/traffic allocation, activation/
  deactivation, and release rollback.
- Application migration orchestration and release evidence.

Define the boundary at property level. Seed initial resources with an approved
bootstrap artifact, then exclude only explicitly CI-owned release fields from
Terraform reconciliation using supported provider/API mechanisms. Never hide
all template/ingress changes or let release automation rewrite infrastructure
configuration. A later Terraform plan must not undo a release or rollback.
Infrastructure updates can themselves create revisions and need coordinated
readiness/acceptance checks.

Keep plan separate from apply. Production apply is protected with an approval
gate; apply the exact saved plan reviewed for the target commit/environment,
not a silently regenerated production change. Changed inputs/state or a stale
plan require a new review. Do not apply infrastructure on every app release or
run credentialed plans against unreviewed PR code.

Protect remote state with restricted access, encryption, locking, recovery
controls, and environment separation. Saved plans can contain secrets:
protect their storage/handoff and approval summaries, especially in a public
repository. Ordinary public artifacts and short retention alone do not protect
sensitive plans.

### Backend deployment and rollback model

1. Validate the trusted release commit; build and scan an OCI image. Tag it
   with traceable commit/build identity and retain the resulting digest.
   Deploy by digest, never mutable `latest`; promote the same artifact rather
   than rebuilding for each environment.
2. Acquire the protected target-environment gate before migration or runtime
   mutation, and serialize the migration/deployment/verification sequence.
3. Record the current known-good revision, digest, and traffic allocation.
   Run any required compatible migration once before application cutover.
4. In multiple revision mode, deploy a candidate while main-endpoint traffic
   stays on the named known-good revision. Wait for successful provisioning,
   startup/readiness, and required ready capacity using bounded checks.
5. Smoke-test the candidate through an authorized path, preserving ingress
   and authentication controls. A listening port or accepted update command
   is not release acceptance.
6. Promote traffic only after validation. Verify the normal endpoint and
   observe the release over a bounded stabilization window. Preserve the
   previous good revision and image for the agreed rollback window; keep it
   ready during stabilization, then deactivate it if appropriate to limit cost.

Candidate failure before promotion leaves known-good traffic unchanged. A
post-promotion failure may restore traffic to the recorded healthy compatible
revision. Manual rollback uses the same controlled recovery path. If inactive,
reactivate and verify readiness first; if purged, deploy its retained exact
digest rather than rebuild old source.

Revision rollback does not restore application-scope secrets/ingress,
infrastructure, or PostgreSQL schema. If the previous revision is incompatible
or recovery fails, report failure explicitly and use reviewed roll-forward or
data recovery; do not claim successful rollback. First deployment has no
previous good revision. Preserve sanitized failure diagnostics and alert the
operator. Serialize release, rollback, and conflicting infrastructure mutation;
do not cancel an in-progress migration to deploy a newer commit.

### Database migration ownership

Database migrations are **versioned application/release responsibilities,
not Terraform-owned**. No Terraform SQL provisioners or migration side effects
during plan/apply.

Application maintainers own migration review, compatibility tests, history,
and recovery instructions. CI/CD executes them serially with database locking/
history, once per target release rather than on every replica startup.
They must remain compatible with rolling/mixed-version deployment and follow
expand/contract where backward compatibility requires it.

Use separate bounded migration database privileges, not the normal API role.
The runner must have reviewed private PostgreSQL connectivity; the
[investigation](../ai/06-cicd-strategy-evaluation.md#database-migration-ownership-and-execution)
recommends a manual Container Apps Job invoked by CI using the approved release
artifact. Its concrete configuration and authentication remain implementation
validation items. Do not expose PostgreSQL temporarily for hosted-runner access.
Wait for migration completion, not just start acceptance. Failure stops
promotion; do not blindly retry partial migrations or automatically run
down-migrations during image rollback.

## Rationale

GitHub Actions keeps source review, validation, deployment history, and workflow
administration together. Official documentation supports federated Azure access
and Container Apps deployment; Azure DevOps has no unique capability required
here. Three focused workflows expose distinct trust/ownership boundaries
without creating an enterprise delivery platform.

Immutable artifacts, readiness plus smoke validation, controlled traffic
promotion, and retained known-good revisions provide practical release safety.
Federation removes routine long-lived Azure credential management, while
explicit Terraform/migration boundaries prevent competing writers and unsafe
schema changes. Detailed evidence and trade-offs are preserved in the
[CI/CD investigation](../ai/06-cicd-strategy-evaluation.md).

## Consequences

- Azure manages the platform, but the team owns application/container maintenance,
  tests, migrations, release verification, rollback, telemetry, and response.
- Production deployment and infrastructure apply have protected approval paths.
  Reviewer availability and GitHub plan/visibility must support the intended
  controls; manual dispatch alone is not independent approval.
- Local/disposable CI data and any deployed nonproduction environment stay
  separate from production data, secrets, identities, and state. A revision
  label is not a separate security environment. Exact environment count/layout
  is deferred; avoid unnecessary permanently provisioned environments.
- Retained artifacts/revisions, overlapping release capacity, migration Jobs,
  and logs have costs. Deactivated revisions may need startup time on rollback.
- Frontend hosting/deployment, exact filenames, migration tooling, provider
  versions, identity scopes, secret store, thresholds, and retention remain
  implementation choices. Acceptance is not proof of working releases or HA.

### Implementation validation

- Verify actual OIDC subject/trust, least-privilege Azure roles, federation for
  provider/backend, managed-identity registry pulls, and denied untrusted-PR access.
- Confirm branch/environment protections, reviewer availability, plan/visibility
  limitations, and an approved gate implementation before production automation.
- Pin provider/API versions and prove Terraform detects infrastructure drift
  without reverting image/traffic changes after deployment or rollback.
- Test failed image pulls/startup/readiness, authorized candidate smoke access,
  promotion, first-release failure, warm/cold known-good recovery, and explicit
  handling when rollback itself fails.
- Test migration serialization, direct private connectivity/DNS, privileges,
  reruns/partial failure, and old/new code compatibility. Verify schema changes
  do not invalidate the retained rollback target.
- Define and measure probe/smoke/observation thresholds, release-overlap replica
  and database connection budgets, rollback time, artifact retention, and
  observability/incident ownership.
- Verify exact-plan approval/handoff, sensitive state/plan protection, remote
  locking, concurrent infrastructure/release behavior, and partial-apply recovery.

No demonstrated technical blocker prevents this strategy's acceptance.
Account-level approval/federation access and the checks above remain prerequisites
to a secure implemented system, not reasons for indefinite platform research.

## Security impact

- Protect `main` with required checks/review and restrictions on direct writes,
  force pushes, and bypass; require review of workflow/IaC/migration changes.
- Protect production environments, restrict deploying branches, and require
  approval where appropriate. Prevent self-review when another authorized human
  is available; document solo-operator approval limitations.
- Isolate untrusted PRs from production secrets, Azure identities, privileged
  artifacts/caches, and internal networks. Do not use privileged PR checkout
  patterns to bypass this isolation.
- Use least-privilege federated Azure identities and scoped runtime managed
  identities. App write/Job start permissions can execute code using runtime
  credentials; treat them as high-trust release permissions.
- Pin third-party actions to verified full commit SHAs; maintain reviewed
  lockfiles/base-image versions and dependency/image checks.
- Protect Terraform state, saved plans, deployment artifacts, and runtime
  secrets. No secrets in browser assets, images, source, AI records, or logs.
- Trace commits/builds/digests to migration executions, revisions, approvals,
  traffic changes, and outcomes. Use deployment summaries, Azure operation/
  revision logs, metrics, and failure alerts with privacy-aware retention.

## Cost impact

Runner minutes/storage, ACR image retention, scanning, migration execution,
release-overlap capacity, state/plan storage, logs, and any nonproduction
resources need budgeting. Standard hosted runners reduce runner maintenance.
GitHub allowances and protection features depend on visibility/plan; do not
assume every control is free. No spend or permanent extra environment is approved.

## References

- [Requirements](../requirements.md)
- [Compute](ADR-001-compute-platform.md) and [network security](ADR-005-network-security.md)
- [CI/CD evaluation, comparison, official sources, and human approval](../ai/06-cicd-strategy-evaluation.md)
- [GitHub OIDC with Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)
- [GitHub environment protection and availability](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Container Apps revisions](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
- [Container Apps revision-based blue/green deployment](https://learn.microsoft.com/en-us/azure/container-apps/blue-green-deployment)
- [Azure DevOps workload identity federation](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/connect-to-azure?view=azure-devops)
- [AI documentation convention](../ai/README.md)
