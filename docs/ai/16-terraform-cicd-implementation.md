# Terraform and CI/CD implementation

- **Date:** 2026-10-07; updated for the user's disposable-assignment instructions.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Decision owner:** Requesting user.
- **Status:** Implemented and locally validated, **not deployed**. Existing image
  vulnerability findings are explicitly accepted for this temporary assignment;
  scanning is report-only, not a release blocker.
- **Authorization:** Writes only under `infra/**`, `.github/workflows/**` and
  this record. No application, contract, requirements, ADR or final-review edits.
  No Azure resources created, Terraform apply, staging or commits performed.

This record supersedes the earlier custom-domain, five-CI-identity,
weekly-plan, protected-state and blocking-image-scan implementation instructions.
The accepted single-region architecture is unchanged. Temporary deletion
settings and the shared CI principal are explicit user-approved implementation
refinements, not production recommendations.

## Evidence and architecture mapping

Read before implementation: [requirements](../requirements.md), all six accepted
ADRs, [final review](../architecture/final-architecture-review.md),
[application guidance](../app/AGENTS.md), [API contract](../backend/API_CONTRACT.md),
both package manifests, backend Dockerfile/ignore, frontend production settings,
Compose and actual configuration, HTTP/readiness/database/migration code.
No contradiction requiring an ADR or application change was found.

| Decision | Preserved implementation |
| --- | --- |
| [ADR-001](../adr/ADR-001-compute-platform.md) | VNet-integrated, creation-time zone-redundant ACA environment, Consumption profile, Multiple revisions, minimum **2** API replicas; initial maximum 4, 0.5 vCPU/1 GiB. HTTP 3000, TCP startup/liveness 3000, actual database-backed readiness TCP 3001. |
| [ADR-002](../adr/ADR-002-azure-region.md) | **Sweden Central**, not an automatically selected alternate region. |
| [ADR-003](../adr/ADR-003-database.md) | PostgreSQL 17 Flexible Server, General Purpose `GP_Standard_D2ds_v5`, 32 GiB Premium SSD v2, 3000 IOPS/125 MB/s, ZoneRedundant primary/standby initially AZ 1/2, seven-day backups. Private delegated subnet/DNS, Entra-only authentication and TLS. Built-in transaction PgBouncer 6432; API pool 5. Migration direct port 5432, pool 1. |
| [ADR-004](../adr/ADR-004-global-entry-point.md) | Front Door **Standard**, default Azure-generated HTTPS endpoint, certificate-validated HTTPS origins, `/api` and `/api/*` to ACA; static routes to Storage. No custom domain or DNS verification required. |
| [ADR-005](../adr/ADR-005-network-security.md) | One VNet with separate ACA/PostgreSQL delegations; private PostgreSQL DNS/NSG; complete reviewed AzureFrontDoor.Backend IPv4 allowlist **plus exact application FDID**; separate API/migration identities, ACR managed-identity pull, Key Vault Standard/RBAC. |
| [ADR-006](../adr/ADR-006-cicd-strategy.md) | Unprivileged PR validation; protected exact-plan apply; OIDC; immutable digest releases; private manual migration Job; candidate validation, named traffic and rollback; narrow Terraform/release property ownership. Assignment uses one CI principal with a role union. |
| [Final frontend selection](../architecture/final-architecture-review.md#final-frontend-hosting-decision) | Dedicated Standard StorageV2/Hot/**ZRS** static website behind existing Front Door; production `VITE_API_BASE_URL=/api/v1`. No frontend Docker runtime. |

Supporting resources: application resource group, ACR **Basic** with admin
disabled and legacy registry RBAC mode; two runtime UAMIs; Key Vault; regional
Log Analytics; incident email action group; modest PostgreSQL CPU/storage/
resource-health and Front Door origin-health/revision-failure alerts; vault
audit and Front Door health-probe diagnostics. No additional service was added
for this simplification.

VNet is `10.42.0.0/16`, ACA subnet `10.42.0.0/23`, PostgreSQL subnet
`10.42.2.0/27`. The database NSG permits workload SQL, intra-subnet HA, regional
Storage, Entra and platform DNS dependencies. **An ACA subnet NSG does not
protect public ACA ingress** in this environment model. The public origin is
restricted by ACA source rules and application FDID validation instead.

The Standard-compatible custom WAF is associated with the **Front Door endpoint**
and starts in Detection. API responses are not statically cached. Known SPA
navigation paths are rewritten; unrelated URLs retain a real 404. Hashed assets
use immutable caching, with index/navigation no-store. No routine purge is
needed with assets-first/index-last publishing.

Minimum replicas provide redundancy, not proven surviving capacity. Cross-AZ
PostgreSQL HA does not provide regional disaster recovery. Front Door improves
ingress/transport, not geographic locality of database-backed execution. No
new SLA, capacity, latency, failover-time or multi-region claim is made.

## Files and ownership

The main Terraform root consists of [providers](../../infra/providers.tf),
[variables](../../infra/variables.tf), [main](../../infra/main.tf),
[networking](../../infra/networking.tf), [database](../../infra/database.tf),
[security](../../infra/security.tf), [Container Apps](../../infra/container-apps.tf),
[frontend](../../infra/frontend.tf), [Front Door](../../infra/front-door.tf),
[monitoring](../../infra/monitoring.tf) and [outputs](../../infra/outputs.tf).
The small [state root](../../infra/state/main.tf) provisions private ZRS state,
private plans/diagnostics containers, role assignments and a read-only
subscription discovery role. Keep **its own state local and protected**, not
inside the account it will destroy.

Terraform owns infrastructure, normal platform environment, ingress/probes/
scaling, identities, secret references, Job command and supporting resources.
Initial CI authorization is a human bootstrap prerequisite.

CI owns application artifacts, execution image overrides, API release image,
revision suffix/labels, activation and named traffic. API lifecycle ignores
**only** image, revision suffix and traffic allocation; Job ignores **only**
image. No whole-template/ingress ignore or Terraform-run SQL migration exists.

The first core apply has `bootstrap_image = null`: all supporting infrastructure
and the idle manual migration Job exist, but no public API or secret-scoped API
grant is created. The Job is seeded with a digest-pinned public Node image,
**never run directly**. Every CI/human execution overrides it with the actual
backend ACR digest. This avoids a fake application image or fake OpenWeather
secret. A second reviewed apply uses the prepared backend digest to create the
real API. Keep that non-null input afterward; image updates remain ignored.
Setting it back to null would intentionally remove the API, not pause releases.

Before API creation, Front Door uses the deterministic app/environment origin
hostname; after creation it uses ACA's actual FQDN. Core bootstrap endpoints are
not an already healthy application and can legitimately return unavailable/
not-found responses until both artifacts have been deployed.

## Workflows

Application CI remains automatic on PR/push. Terraform plan/apply and both
application deployment workflows are manual; backend/frontend deployment use
`workflow_dispatch` only so infrastructure bootstrap cannot trigger premature
application deployment. Their existing manual operations are unchanged.

| Workflow | Behavior |
| --- | --- |
| [Application CI](../../.github/workflows/application-ci.yml) | Path-filtered frontend/backend CI with actual `npm ci`, lint, typecheck, test and build scripts, without Azure credentials. |
| [Terraform](../../.github/workflows/terraform.yml) | PR fmt/init/validate, mocked bootstrap plans and helper tests; manual trusted-main plan/apply only. **No weekly schedule.** Private Azure Blob saved plans, hashes, input/commit/run provenance, 24-hour expiration, release fingerprints and exact-plan approval. |
| [Backend](../../.github/workflows/backend-deploy.yml) | Actual backend Dockerfile, traceable commit/run/attempt tag, ACR digest, managed-identity pulls, report-only Trivy. `publish` prepares the first artifact; `bootstrap` can reuse `prepared_image` and only runs migrations; normal `deploy` validates and promotes a candidate; `rollback` requires schema compatibility. |
| [Frontend](../../.github/workflows/frontend-deploy.yml) | Actual frontend scripts, `/api/v1` production build, validated public artifact manifest, Entra-authenticated blob upload, checksummed assets first/index last, canonical smoke and verified retained-artifact rollback. |

All cloud jobs use protected GitHub environment **`assignment`**, `main`-only
deployment branches and the same OIDC identity. Mutating jobs share
`weather-production-mutation`, `cancel-in-progress: false`; GitHub concurrency
is not a FIFO queue. Pause releases during human SQL administration or teardown.
PRs receive no production cloud/state access.

Normal backend releases retain the known-good revision at 100%, execute actual
`npm run migrate`, wait for the approved-digest candidate and at least two ready
replicas, smoke through the same Front Door with the candidate selector, then
promote named traffic. Post-promotion checks restore/verify previous traffic on
failure. There are no automatic down migrations. Retained rollback requires
explicit schema compatibility. The first API has no previous revision to roll
back to; fix its configuration through another reviewed plan if bootstrap fails.

The fingerprint distinguishes missing resource groups/API/Job from Azure errors.
Missing resources are explicit snapshot values; authentication/network/
enumeration failures still fail closed. Creating resources or changing release
fields invalidates the earlier plan. Saved-plan JSON inspection runs in the
initialized Terraform root, not an uninitialized repository-root provider context.
Core-only post-apply verification requires Terraform's explicit `api_created=false`
output and the actual Job. An expected but missing API fails; it is never
silently accepted as core-only. Read-only platform smoke checks wait boundedly
for first-origin/edge propagation.

Trivy uses `--exit-code 0`; reporting failures produce a warning and do not block
this assignment. Earlier local results were 60 HIGH and 4 CRITICAL package
findings; these are **accepted findings, not remediated findings**. Application
dependencies were not modified. Production should restore a vulnerability gate
and resolve accepted risks before a real launch.

## One CI identity, two workload identities, no client secret

Use one existing/bootstrapped Entra application and service principal:

- `AZURE_CLIENT_ID`: application client ID.
- `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
- Terraform `ci_principal_id`: **service principal object ID**, not client ID.
- Federation issuer `https://token.actions.githubusercontent.com`, audience
  `api://AzureADTokenExchange`, exact repository/environment subject
  `repo:RoeiKat/weather-app:environment:assignment`.

Require a human approval on the environment and restrict deployments to `main`.
For this one-developer assignment, do not enable a self-approval prohibition
that makes the only approver unable to deploy. Repository admins must configure
the approval gate before using apply. Ordinary code/PR checks remain unprivileged.

CI role union:

- Human-bootstrap **Contributor** and **Role Based Access Control Administrator**
  on the application resource group only; no subscription Owner.
- State-root private-container **Storage Blob Data Contributor** on tfstate,
  tfplans and tfdiagnostics.
- State-root subscription discovery role: subscription/location/provider/
  service-tag/role-definition reads only, no write or application data access.
- Main-root **AcrPush** on the one registry.
- Main-root **Storage Blob Data Contributor** on the frontend account. Account
  scope is needed by the same principal for Terraform static-website service
  properties, not merely delivery's `$web` blobs.

Contributor already covers ACA release operations; no redundant custom release
role or extra CI identity is required. The role union is intentionally high
trust, not isolation between Terraform/release jobs. Protect the one identity
and workflow code accordingly. The CI identity receives no Key Vault secret
data-plane role and is not an Entra SQL administrator.

The API UAMI has ACR pull and access to the **one** `openweather` secret. The
migration UAMI has ACR pull and distinct private SQL DDL privileges. Runtime
roles are non-admin and separate; API has table DML, not schema/migration-history
write. Local password-based development remains untouched.

OpenWeather is populated by the human after core infrastructure, outside
Terraform. Only the vault/secret URI enters configuration. No secret values in
Terraform, committed tfvars, frontend variables or GitHub repository secrets.

## Deploy once: short sequence and explicit bootstrap

**Run provisioning commands below only after human approval of Azure cost,
permissions and quota. They were not run during implementation.** Use a globally
unique lowercase prefix of 6-16 characters. Check Sweden Central quota/two-zone
allocation, required provider registrations and CIDR conflicts first. Do not
silently change region, remove HA or make SQL public if a prerequisite fails.

Sequence:

**Azure login -> state bootstrap -> one OIDC principal/protected environment ->
core plan/apply -> real Key Vault secret and first ACR artifact -> private human
SQL principal setup -> CI migrations -> private runtime grants -> API plan/apply
-> frontend deployment -> generated HTTPS URL -> teardown.**

The extra API apply is required because the actual production backend validates
its real secret/database settings at startup. It avoids dummy application code,
an insecure temporary API or Terraform executing migrations.

### 1. Human login and local state bootstrap

Install Terraform 1.16.5, Node 24 and current Azure CLI with the Container Apps
extension. From repository root, use a human login, not the CI principal:

```powershell
az login
az account set --subscription <subscription-id>
$env:ARM_SUBSCRIPTION_ID = "<subscription-id>"
$env:ARM_TENANT_ID = "<tenant-id>"
$env:ARM_USE_CLI = "true"
$env:ARM_USE_OIDC = "false"
$env:ARM_USE_AZUREAD = "true"
terraform -chdir=infra\state init
terraform -chdir=infra\state plan -var="name=<prefix>" -out=bootstrap.tfplan
# Human approval, then:
terraform -chdir=infra\state apply bootstrap.tfplan
terraform -chdir=infra\state output backend
```

The bootstrap operator must be able to create its resource group/storage and
manage RBAC, including the narrow subscription discovery role in step 2.
Bootstrap grants this human blob access to the state account. Keep the local
bootstrap state secure/backed up until teardown; it is ignored by Git. Retain
the same human account for future bootstrap-root refresh/destroy.

### 2. Configure one OIDC principal and initial CI permissions

Create one Entra app/SP, **without a client secret**, and its single federated
credential using the exact issuer/audience/subject above. Create the GitHub
`assignment` environment, approvals and `main` deployment restriction.
Record the three Azure variables and the SP object ID.

Re-plan/apply the small state root with `ci_principal_id=<SP-object-id>` to grant
the CI container/discovery roles. Reuse `name=<prefix>` and review the plan.

To avoid subscription-wide CI write/RBAC privileges, the human creates just the
application resource group and grants CI its two group-scoped platform roles:

```powershell
$rg = "<prefix>-prod"
$sub = "<subscription-id>"
$ci = "<SP-object-id>"
az group create --name $rg --location swedencentral --output none
$scope = "/subscriptions/$sub/resourceGroups/$rg"
az role assignment create --assignee-object-id $ci --assignee-principal-type ServicePrincipal `
  --role Contributor --scope $scope --output none
az role assignment create --assignee-object-id $ci --assignee-principal-type ServicePrincipal `
  --role "Role Based Access Control Administrator" --scope $scope --output none
```

This one resource-group bootstrap is imported into the **main** Terraform root
below, so main destroy will remove it. It is not a third Terraform environment.

Prepare nonsecret `TERRAFORM_INPUTS_JSON` in GitHub environment variables, and
the same inputs in ignored local tfvars for import/administration/destroy:

```json
{
  "subscription_id": "<subscription-id>",
  "tenant_id": "<tenant-id>",
  "name": "<prefix>",
  "ci_principal_id": "<SP-object-id>",
  "entra_admin_object_id": "<human-user-object-id>",
  "entra_admin_name": "<human-UPN>",
  "entra_admin_type": "User",
  "alert_email": "<approved-email>",
  "bootstrap_image": null,
  "frontdoor_backend_ipv4": ["<reviewed-current-CIDR>"],
  "frontdoor_service_tag_change_number": "<current-change-number>",
  "tags": { "purpose": "temporary-assignment" }
}
```

The placeholders are not deployable values. Obtain the complete current service
tag data with `az network list-service-tags --location swedencentral --output json`
and use the [fail-closed prefix helper](../../infra/scripts/frontdoor-prefixes.mjs);
do not use the documentation/test CIDR in a real environment.

```powershell
New-Item -ItemType Directory -Force infra\validation-output | Out-Null
az network list-service-tags --location swedencentral --output json |
  Out-File -Encoding ascii infra\validation-output\service-tags.json
node infra\scripts\frontdoor-prefixes.mjs infra\validation-output\service-tags.json `
  infra\validation-output\reviewed-candidate.tfvars.json
```

Review and copy both candidate fields into the GitHub JSON and local inputs.
The helper refuses empty/unsafe source sets and an already existing output file.

Initialize main remote state using the state output, CLI authentication for
the human, and import the new group:

```powershell
terraform -chdir=infra init -reconfigure `
  -backend-config="storage_account_name=<prefix>state" `
  -backend-config="resource_group_name=<prefix>-state" `
  -backend-config="container_name=tfstate" -backend-config="key=production.tfstate" `
  -backend-config="use_oidc=false" -backend-config="use_cli=true"
terraform -chdir=infra import azurerm_resource_group.app $scope
```

Local tfvars must already be populated for import. Commit no tfvars or state.
CI initializes its own clean checkout with OIDC; local CLI backend overrides
do not change committed federation settings.

### 3. Core infrastructure through reviewed workflows

Set `TF_STATE_ACCOUNT`, `TF_STATE_RESOURCE_GROUP`, `AZURE_RESOURCE_GROUP`,
`ACA_APP_NAME=<prefix>-api`, `MIGRATION_JOB_NAME=<prefix>-migrate` and inputs.
Dispatch Terraform `plan` on the trusted main commit. Review the exact private
`tfplans/<run>/<attempt>/production.tfplan` and metadata using authorized blob
access and `terraform -chdir=infra show <downloaded-plan>`.
Dispatch `apply` with that run/attempt, approve the environment, and keep the
same commit/inputs. Plan drift/age/hash checks must pass.

No API readiness/smoke is falsely claimed during this core apply. Obtain
`terraform -chdir=infra output -json deployment` and `output -raw public_url`.
Set GitHub environment `PUBLIC_URL` **from that exact generated output**, plus
`ACR_NAME`, `ACR_LOGIN_SERVER` and `FRONTEND_STORAGE_ACCOUNT` from deployment
outputs. There is no hostname, DNS-validation or custom-domain configuration.
Normal application `ALLOWED_ORIGINS` is derived from the same endpoint in Terraform.

### 4. Populate the secret and publish the first backend artifact

The human needs **Key Vault Secrets Officer** on this assignment vault to
populate `openweather`; grant it with approved Azure access, not to CI.
Use a securely created local secret file (outside Git), never a literal API key
in committed files or printed logs:

```powershell
az keyvault secret set --vault-name <prefix>-kv --name openweather `
  --file <secure-local-secret-file> --output none
```

Remove the local secret file securely according to the workstation policy.
Do not delete the vault secret before the API demonstration.

Dispatch backend `operation=publish`. It validates the backend, builds
`backend/Dockerfile`, reports scan findings and pushes a unique immutable ACR
artifact. Copy the resulting **digest**, not a mutable tag, from its summary.
This operation neither migrates nor deploys the API.

### 5. Private SQL bootstrap using the existing Job

No permanent VM, hosted-runner private DB connection, extra managed identity
or public PostgreSQL rule is needed. The human administrator uses the existing
private migration Job with a temporary execution override:

```powershell
# Keep Terraform CLI-auth backend initialized and the human Azure login active.
$env:AZURE_SUBSCRIPTION_ID = "<subscription-id>"
$env:AZURE_RESOURCE_GROUP = "<prefix>-prod"
$env:MIGRATION_JOB_NAME = "<prefix>-migrate"
$env:ACR_LOGIN_SERVER = "<prefix>acr.azurecr.io"
$env:RELEASE_IMAGE = "<the-published-weather-backend@sha256-digest>"
$env:PGADMIN_NAME = "<same-human-UPN-as-entra_admin_name>"
node infra\scripts\database-admin.mjs principals
```

[Human SQL helper](../../infra/scripts/database-admin.mjs) reads Terraform's
nonsecret database bootstrap outputs, verifies the matching private host,
obtains the logged-in human's short-lived Entra SQL token, stores it transiently
as a Job secret and executes the actual [principal SQL](../../infra/scripts/bootstrap-database.sql)
over direct port 5432/TLS from inside the existing VNet.
It waits for token attachment to finish provisioning before starting the Job,
then removes the temporary Job secret in `finally`, including failure paths.
Removal is reported successful only after a read-back confirms provisioning
has succeeded and the secret is absent (`null`/omitted is Azure's empty shape).
The start override uses only the documented execution-template fields, not
the full Job template returned by GET.
If Azure rejects cleanup, an explicit token-removal error stops the operation;
remove `temporary-sql-admin` with authorized human access before any further
workflow/plan. The helper does not silently claim cleanup succeeded.
No token is put in GitHub, Terraform, receipt files or container command text.
On Windows, the helper resolves the installed CLI's companion `python.exe`
and invokes the same CLI module as `az.cmd`, without `cmd.exe`. REST bodies
use temporary `@path` JSON files on all platforms; `@{path}` is not valid file
syntax. Sanitized errors identify the failing operation and provider diagnostic.
See the [bootstrap remediation record](19-windows-azure-cli-rest-bootstrap-remediation.md);
human review of that remediation and approval for its next live command are
pending.
Do not run another workflow or Terraform plan while this human operation runs.
The override uses human SQL credentials; **it does not make the migration UAMI
an administrator** or change its normal template/identity.

Principal setup is a once-only human bootstrap, not an application migration.
If it partially fails, inspect role mapping/permissions before retrying, rather
than blindly recreating existing principals. Workload role elevation is checked.
Human membership of the migration-owned role permits the later table grants.

Dispatch backend `operation=bootstrap`, with `prepared_image` equal to the same
published digest. This reuses the artifact, runs **actual `npm run migrate`**
with the migration UAMI, and records **prepared-not-deployed**. Job executions
are overlap-checked; application migrations also use their existing transaction,
advisory lock and checksums. No API traffic exists or is promoted yet.

After migrations, from the same human CLI context:

```powershell
node infra\scripts\database-admin.mjs grants
```

This executes [runtime grants](../../infra/scripts/grant-runtime.sql) as the
migration-table owner: DML on users/sessions/preferences/rate_limits for the API,
no access to schema_migrations. A failed admin operation fails explicitly;
do not proceed on success-shaped fallback or missing permissions.

### 6. Create the actual API and publish the frontend

Set `bootstrap_image` in **both** reviewed GitHub JSON and local tfvars to the
same prepared digest. Run a fresh reviewed Terraform plan/apply. The real API
now has a populated vault secret, ACR artifact and initialized private SQL
permissions. The workflow verifies actual readiness and canonical health/session
smokes after apply. Keep the bootstrap digest non-null for later Terraform use.

Dispatch frontend deployment, using the production relative `/api/v1` build.
Test the generated `https://<endpoint-generated-name>.z01.azurefd.net` output:
SPA navigation, login/register/session/CSRF, weather requests, static/API 404s,
no-store API responses, and rejection of direct/bad-FDID origin traffic.
Ordinary subsequent backend `deploy` uses migrations-before-candidate promotion,
not another Terraform image update.

## Complete temporary teardown

Disable/pause mutating workflows first, keep the bootstrap local state and
main input values, and log in as the authorized human. Human destroy needs
application control-plane/RBAC permissions and frontend Storage Blob Data
Contributor for static-website refresh/delete, in addition to its state blob
access. Grant these narrowly if the operator does not already have them.
Review the destroy plan before approval; deployment budget persists until deletion.

**Final order:**

1. **Destroy the main application Terraform root.**

   ```powershell
   terraform -chdir=infra plan -destroy -out=destroy.tfplan
   # Human approval, then:
   terraform -chdir=infra apply destroy.tfplan
   ```

   Retain the non-null bootstrap image and all original inputs while destroying.
   No PostgreSQL/Key Vault destroy guard or resource lock prevents this.
   Registry artifact write locks do not lock the registry ARM resource; artifact
   deletion is not separately disabled by this implementation.

2. **Destroy the Terraform-state/bootstrap root.**

   ```powershell
   terraform -chdir=infra\state plan -destroy -var="name=<prefix>" `
     -var="ci_principal_id=<SP-object-id>" -out=destroy.tfplan
   # Human approval, then:
   terraform -chdir=infra\state apply destroy.tfplan
   ```

   This removes state storage/private plans/diagnostics, discovery RBAC and its
   resource group. There is **no state prevent_destroy**. Its own local state
   remains accessible throughout deletion. Do not put that bootstrap state in
   the account being destroyed.

3. **Verify both resource groups are gone.**

   ```powershell
   az group exists --name <prefix>-prod
   az group exists --name <prefix>-state
   ```

   Both must return `false`; investigate any failure or remaining resources.
   Stop mutating workflows after teardown. The manually created, non-billable
   Entra app/SP/federated credential can also be deleted by its owner if no
   longer needed. Do not delete another project's identity.

Key Vault has **purge protection false**, normal soft-delete enabled and minimum
**7-day** retention. Provider automatic purge on destroy is explicitly false.
A successfully destroyed vault can therefore remain in Azure's deleted-vault
recovery list until retention expires or an authorized human explicitly purges
it. This is normal soft-delete, not an active resource group or a destroy lock;
name reuse may require waiting or authorized purge. Storage blob/container
soft-delete retention is also seven days; neither enables a Terraform deletion
guard. Small Azure usage may still be billed while resources exist.

**Real production must restore** PostgreSQL/Key Vault/state deletion protection,
Key Vault purge protection and production-reviewed retention/recovery controls.
Also restore stronger separation of CI privilege boundaries and a blocking
vulnerability policy. Do not copy this disposable lifecycle policy into production.

## Validation and remaining live checks

Local validation for this update:

- Terraform **1.16.5** and locked AzureRM **5.8.0**, recursive fmt/fmt-check.
- Backend-free init/validate for main and state roots, no Azure plan/apply.
- **2 mocked-provider plan tests**: no-image/no-secret core, followed by actual
  digest/API configuration; generated public URL, default routes, actual
  readiness/min replicas, allowed origin and HA preservation.
- **25 Node helper tests**: prior promotion/recovery/rollback/propagation regressions;
  missing group/API/Job fingerprints; stale/altered/expired plan rejection;
  core apply, first migration-only preparation/failure/overlap, human-only SQL
  rendering and temporary token removal on success/failure, explicit cleanup
  failure, and rejection of unexpectedly missing provisioned resources.
- All four workflows pass **actionlint 1.7.12**.
- Whitespace and allowed-write-scope checks, including untracked files.

Previously verified unchanged application assumptions: actual backend Dockerfile
built; frontend lint/typecheck/54 tests/build and backend lint/typecheck/91 tests/
build passed. Backend container tests required a non-root runner because their
embedded PostgreSQL refuses root; application code was not changed.

Not yet verified against a live subscription: permissions/role propagation,
provider registrations/quota/AZ allocation, supported storage/HA configuration,
initial Key Vault secret resolution, ACR pull, public-origin ACL capacity and
behavior, endpoint WAF association, FDID/default-domain routing, Node root TLS
trust, Entra SQL role creation/membership/grants, private DNS/PgBouncer,
candidate propagation/smokes, frontend headers/browser behavior, alerts,
rollback/HA recovery and actual two-root destruction/billing termination.
Mocked plans and local tests prove configuration/helper logic, **not** successful
Azure provisioning or complete live teardown. Provision only with explicit
human approval and stop/report a real architecture/application conflict rather
than weaken controls to bypass it.
