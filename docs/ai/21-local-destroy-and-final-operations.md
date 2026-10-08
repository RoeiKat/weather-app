# Local destroy and final repository operations

- **Date:** 2026-10-08.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Human decision: PENDING REVIEW**
- **Authorization:** The prompt below authorizes local operations tooling,
  documentation, read-only Azure inspection, Terraform destroy planning and
  final Git operations. It does **not** authorize live destruction, a new
  production deployment, architectural changes or provisioning.

## Full prompt

The following is the complete task prompt, verbatim. No secret values were
provided in it; no redactions were necessary.

```text
You are performing the FINAL repository operations task for this Azure DevOps home assignment.

The application is already deployed and working end-to-end.

DO NOT redesign, redeploy, or improve the application architecture.
DO NOT start another production deployment.
DO NOT perform the real destructive teardown.

Your scope is ONLY:

1. finalize the previous deployment evidence/documentation,
2. clean temporary local artifacts,
3. implement a safe ONE-COMMAND local Azure/Terraform teardown,
4. document and test that teardown WITHOUT actually destroying the live environment.

======================================================================
CURRENT VERIFIED STATE
======================================================================

Public application:

https://weatherroeidev-public-d4e7a2bxgxefe6cf.z03.azurefd.net

Successful complete main deployment:

GitHub Actions run:
37804785806

Commit deployed by that run:
771d800

Latest pushed repository commit reported by previous session:
f166bcd

Verified:

- Azure Front Door public application works end-to-end.
- Infrastructure deployment succeeded.
- Backend migration succeeded.
- Candidate revision validation succeeded.
- Candidate promotion succeeded.
- Previous healthy revision remains available for rollback.
- Frontend deployment succeeded.
- Direct ACA access remains blocked with HTTP 403 even when supplying the expected FDID header.
- GitHub Actions uses OIDC.
- Normal push-to-main delivery is considered READY.

An earlier run:
37804008843

successfully migrated/promoted backend but failed overall on a frontend smoke assertion that was subsequently fixed.

The optional backend-only path-filter verification was interrupted.
DO NOT resume it.
The successful complete main delivery is sufficient evidence for this assignment.

======================================================================
FIRST: FINALIZE SESSION 1 EVIDENCE
======================================================================

Inspect current working tree first.

Known previous state:

- docs/ai/20-final-deployment-and-cd-automation.md
  was modified but not committed.
- infra/review-plan.json
  was an untracked temporary review artifact.

Do this first:

1. Inspect docs/ai/20-final-deployment-and-cd-automation.md.
2. Append the final successful deployment result:
   - successful run 37804785806
   - infrastructure/backend/frontend all succeeded
   - candidate validation and promotion succeeded
   - Front Door checks succeeded
   - direct ACA access remains blocked
   - normal main delivery is ready
   - optional backend-only verification was not completed and is NOT required
3. Keep:
   Human decision: PENDING REVIEW
4. Do not fabricate evidence not actually observed.
5. Remove temporary generated review artifacts if they are not supposed to be committed:
   - review-plan.json
   - review.tfplan
   - runtime auto tfvars
   - transient plan files / diagnostics
6. Ensure .gitignore protects those generated files appropriately.

Do not change the production deployment to gather more evidence.

======================================================================
MAIN TASK: ONE-COMMAND LOCAL DESTROY
======================================================================

I want to be able to open this repository in VS Code, authenticate with Azure CLI, and run ONE simple local command to tear the assignment down safely.

Prefer an interface such as:

npm run infra:destroy

If the repository structure makes PowerShell cleaner, an implementation such as:

pwsh ./infra/scripts/destroy.ps1

is acceptable, but expose a convenient root-level command where reasonable.

I DO NOT want to:

- download Terraform state manually
- copy values from GitHub Environment variables
- enter GitHub run IDs
- enter image digests
- trigger GitHub Actions
- manually delete Azure resource groups
- manually destroy both Terraform roots
- paste secrets
- manually reconstruct terraform.tfvars

The script must automate the correct sequence.

======================================================================
CURRENT TERRAFORM STATE ARCHITECTURE
======================================================================

Main application Terraform root:

infra/

Remote backend:

resource group:
weatherroeidev-state

storage account:
weatherroeidevstate

container:
tfstate

key:
production.tfstate

State bootstrap Terraform root:

infra/state/

IMPORTANT DESTROY ORDER:

1. Initialize and destroy infra/ using the existing remote production state.
2. Verify the production application resources/resource group are removed.
3. ONLY THEN destroy infra/state/.
4. Never delete the state storage/resource group before the main root has successfully finished destruction.

The application production resource group is:

weatherroeidev-prod

======================================================================
DESTROY TOOL REQUIREMENTS
======================================================================

The local destroy command must:

1. Use the locally authenticated Azure CLI user.

2. Never require:
   - Azure client secrets
   - GitHub secrets
   - long-lived credentials
   - OpenWeather secret value

3. Verify the active Azure subscription before doing anything destructive.

Use the repository's intended subscription/configuration as the expected value.

If the active subscription is wrong:
- stop immediately
- show a useful error
- do not mutate anything.

4. Show a concise preview before destruction:

- subscription
- application resource group
- Terraform state resource group
- state storage account
- state key
- public application name / relevant Terraform roots

5. Require ONE explicit human destructive confirmation.

A force/non-interactive flag may be supported, for example:

npm run infra:destroy -- --force

but normal execution should ask for confirmation.

Do not require multiple confirmations.

6. Automatically initialize the main Terraform backend.

Equivalent backend settings:

storage_account_name = weatherroeidevstate
resource_group_name  = weatherroeidev-state
container_name       = tfstate
key                  = production.tfstate

7. Automatically provide all Terraform variables/config needed for destroy.

Do not depend on GitHub Actions environment variables being present locally.

If necessary, introduce a committed NON-SECRET configuration file containing stable assignment configuration.

Allowed in repository:
- Azure subscription ID
- tenant ID
- resource names
- region
- object IDs
- service tag CIDRs
- email/config metadata
- other non-secret Terraform inputs

NOT allowed:
- passwords
- tokens
- OpenWeather API key value
- Azure access tokens
- GitHub token
- database password

Prefer deriving values from Terraform state/Azure where practical instead of duplicating them.

8. Run a destroy plan first.

The script should surface a concise summary such as resource count / important targets.

Then after the single confirmation:

terraform destroy

or an equivalent saved destroy-plan/apply mechanism.

It does NOT need the elaborate GitHub protected-plan ceremony for local teardown.

Keep this understandable.

9. Do not delete unrelated Azure resources.

The script must be narrowly scoped to this assignment.

10. After main destruction succeeds:

verify that the application resource group or Terraform-managed application resources are gone.

Only then proceed to:

infra/state/

11. Destroy the state-bootstrap root.

This should remove:

- assignment Terraform state storage resources
- associated state resource group
- other resources owned by infra/state

ONLY after the main state is no longer needed.

12. Handle assignment-specific resources that exist outside Terraform ownership.

Inspect the repository and Azure ownership model.

Examples may include:

- GitHub OIDC Entra application/service principal
- manual federated credential
- manual RBAC assignments
- manually populated Key Vault secret

Do NOT blindly delete identity objects.

Instead:

- determine which are Terraform-owned,
- determine which were manually created specifically for this assignment,
- document anything left behind.

If a safe optional cleanup flag makes sense, you may add one, but the primary destroy operation must never accidentally remove unrelated tenant identities.

13. Handle Azure soft-delete behavior sensibly.

Do not add complicated purge logic unless genuinely required.

Report soft-deleted resources where relevant.

======================================================================
STATUS COMMAND
======================================================================

Also implement:

npm run infra:status

or equivalent.

It must be READ-ONLY.

Show:

- active Azure subscription
- whether weatherroeidev-prod exists
- whether weatherroeidev-state exists
- whether remote Terraform state can be accessed
- Container App existence/status
- Front Door endpoint existence
- PostgreSQL server existence
- state storage account existence

Do not display secret values.

======================================================================
DEVELOPER EXPERIENCE
======================================================================

The final desired usage should be approximately:

Deploy:

git push origin main

Destroy:

npm run infra:destroy

Status:

npm run infra:status

I want this to be explainable in an interview in a few sentences.

Do not introduce a large CLI framework.

Prefer:
- small Node script, OR
- small PowerShell script,
based on what fits the existing repository best.

Existing infrastructure scripts are Node .mjs files, so reuse existing helpers if that keeps the implementation smaller and cross-platform.

======================================================================
VALIDATION — DO NOT DESTROY LIVE AZURE
======================================================================

YOU MUST NOT ACTUALLY DESTROY THE CURRENT LIVE ASSIGNMENT.

You MAY perform:

- read-only Azure CLI calls
- terraform init
- terraform validate
- terraform plan -destroy
- terraform state inspection
- dry-run execution
- script unit tests
- Node tests
- PowerShell parsing tests
- npm script validation

You MUST NOT execute the final destructive apply/destroy.

If the script normally asks for confirmation, do not approve it yourself.

The live application must still work when you finish.

======================================================================
CI/CD
======================================================================

The main CI/CD flow is already working.

Do not redesign it.

Inspect only if needed to ensure your local destroy tooling does not conflict with it.

Normal main delivery already successfully performs:

backend:
test/build
→ immutable ACR image
→ migration
→ candidate revision
→ Front Door candidate validation
→ promotion
→ rollback retention

frontend:
test/build
→ Storage static website
→ Front Door
→ public smoke validation

infrastructure:
Terraform automation through the production workflow

GitHub authentication:
OIDC

Do not reintroduce:
- manual digest copying
- bootstrap_image editing for routine releases
- manual plan run IDs
- manual migration operation
- manual candidate promotion

======================================================================
DOCUMENTATION
======================================================================

Create:

docs/ai/21-local-destroy-and-final-operations.md

It must contain:

- this full prompt
- files inspected
- implementation decisions
- commands/tools used
- destroy design
- safety controls
- validation performed
- dry-run / destroy-plan result
- resources intentionally outside Terraform ownership
- exact final usage
- Human decision: PENDING REVIEW

Also update the main repository README or deployment runbook with a SHORT section:

Deploy:
git push origin main

Status:
<exact status command>

Destroy:
<exact destroy command>

Do not bloat the README.

======================================================================
TESTS
======================================================================

Run all relevant tests for the files you modify.

At minimum:

- Terraform fmt check
- Terraform validate
- existing Terraform tests where relevant
- delivery/script Node tests
- destroy/status script tests
- a real read-only status check
- a real terraform destroy PLAN against the current live state

The destroy plan is specifically useful: verify that it targets the expected assignment resources and does not unexpectedly target unrelated resources.

DO NOT APPLY IT.

======================================================================
GIT FINALIZATION
======================================================================

At the end:

1. Inspect git diff carefully.
2. Ensure no secret values were introduced.
3. Ensure temporary Terraform/review files are ignored/deleted.
4. Commit the final operations/documentation changes.
5. Push them to main ONLY IF doing so will not trigger destructive behavior.

A push to main may run the normal deployment pipeline.
That is okay if unavoidable, but do not make application changes solely to trigger another deployment.

Do not start or wait indefinitely for another deployment workflow merely because documentation/tooling was pushed.

======================================================================
STOP CONDITION
======================================================================

When these are true:

- docs/ai/20 is finalized
- temporary review artifacts are cleaned
- local status works
- local destroy tooling is implemented
- destroy plan has been safely inspected
- no live destruction occurred
- docs/ai/21 exists
- README/runbook usage is updated
- no secrets are committed

STOP.

Do not look for additional improvements.

At the end report ONLY:

1. exact status command
2. exact destroy command
3. what destroy removes and in what order
4. confirmation that live Azure was NOT destroyed
5. destroy-plan summary
6. files changed
7. tests/results
8. resources intentionally left outside Terraform cleanup
9. final git status / commit
10. confirmation that no secrets were committed
```

## Files and evidence inspected

- [Repository contract](../../AGENTS.md), [requirements](../requirements.md),
  [alternatives](../architecture/alternatives.md), [ADR index](../adr/README.md)
  and [AI documentation convention](README.md).
- [Previous deployment evidence](20-final-deployment-and-cd-automation.md),
  [infrastructure/delivery ownership record](16-terraform-cicd-implementation.md),
  [first-apply remediation](17-first-apply-remediation.md),
  [Windows CLI remediation](19-windows-azure-cli-rest-bootstrap-remediation.md)
  and [deployment runbook](../deployment.md).
- [Root ignore rules](../../.gitignore), [infrastructure ignore rules](../../infra/.gitignore),
  [main root](../../infra/main.tf), [provider/backend](../../infra/providers.tf),
  [variables](../../infra/variables.tf), [outputs](../../infra/outputs.tf),
  [bootstrap root](../../infra/state/main.tf), [Container Apps](../../infra/container-apps.tf),
  [database](../../infra/database.tf), [security](../../infra/security.tf),
  [Front Door](../../infra/front-door.tf), [monitoring](../../infra/monitoring.tf).
- [Azure helper](../../infra/scripts/azure.mjs),
  [Terraform planning helper](../../infra/scripts/terraform-plan.mjs),
  [delivery change detection](../../infra/scripts/delivery-changes.mjs),
  [delivery tests](../../infra/test/delivery.test.mjs) and
  [production workflow](../../.github/workflows/production.yml).
- Selected nonsecret metadata from the local backend cache and bootstrap state;
  remote production state inspected in process memory or a deleted temporary
  file, never printed wholesale. Azure account/resource/RBAC/Entra metadata.
  No OpenWeather key, SQL password, access token or Key Vault secret value read.

## Initial tree, evidence finalization and cleanup

Initial main was `f166bcd`; the only reported dirty tracked file was AI record
20, with untracked `infra/review-plan.json`. Existing edits in record 20 were
preserved and its successful `37804785806` / `771d800` completion appended from
the user's verified deployment handoff. Infrastructure, migration, candidate
validation/promotion, frontend, Front Door and blocked direct ACA access are
recorded as handoff evidence, **not** new tests of all those operations.
Main delivery is READY. Optional backend-only verification was not completed,
is not required and was not resumed.

Deleted the named temporary review JSON/plan and the two old bootstrap/access
plans. No runtime auto-tfvars or transient diagnostics were present to remove.
Preserved local bootstrap state/backups, Terraform locks, installed tools and
provider caches: these are not disposable review evidence. New ignore rules
cover review/plan JSON, binary plans and local retry metadata. Runtime tfvars
and Terraform state were already ignored.

Unrelated untracked README/architecture-image work appeared during execution.
It was not edited, removed, staged or included in this operations commit.

## Implementation decisions and destroy design

1. Add a dependency-free root [package manifest](../../package.json), small
   [Node operations script](../../operations/local.mjs), nonsecret
   [assignment configuration](../../operations/config.json) and
   [Node tests](../../operations/local.test.mjs). Reuse the existing shell-free,
   Windows-compatible Azure CLI helper and its sanitized error handling.
   No framework, npm dependency, provisioning or application change.
2. Put local tooling outside the Terraform/delivery-script path filters.
   The existing workflow and change detector are **unchanged**. Unit tests
   verify these new paths select no delivery surfaces. A final cumulative
   check nevertheless found an older backend README change since the last
   successful delivery; the Git finalization safeguard below prevents that
   previous optional backend-only work from being resumed by this push.
3. Pin expected subscription `ef76d6ca-367f-4c96-b8a7-c176d747855d` and tenant
   `3d16c4fe-57a6-4332-b56d-3a89bbd4c960` from the authenticated assignment
   context and existing bootstrap state. Configuration contains only names
   and object identifiers; no passwords, keys, personal email or tokens.
4. Initialize isolated copies of the two existing Terraform roots. Main uses
   the exact production remote backend with CLI/Entra authentication, explicitly
   disabling its CI OIDC backend setting locally. Environment cleanup removes
   inherited ARM credentials, TF variables/arguments/workspaces and CI tokens
   from Terraform subprocesses. Existing working backend configuration and
   any unrelated local tfvars are not altered or consumed.
5. Pull main state automatically; derive required nonsecret variables including
   current immutable image, ingress prefixes/change number, SQL administrator
   metadata, alert configuration and compute allocation from resource state.
   No GitHub environment values, run IDs, digests or secrets must be supplied.
   A restricted, ignored input snapshot supports local retries after partial
   main destruction; a fresh successful dry run removes its new snapshot.
6. Bootstrap owns **local** state. Use the existing ignored bootstrap state;
   if absent on a fresh clone, discover exactly scoped bootstrap resources/RBAC
   and import their ownership automatically into local state. Imports read
   Azure and update only local Terraform state, not Azure resources. A local
   recovery manifest allows an interrupted import sequence to resume.
   Existing ownership is compared against live discovery before initial
   teardown; missing imports are recovered and conflicting IDs block execution.
   Neither bootstrap state nor its recovery metadata is stored in the account
   that will be destroyed.
7. Validate and save **delete-only** plans for both roots before confirmation.
   Show counts and important Terraform target addresses, never complete state
   or plan JSON. Apply those exact binary plans, not an unreviewed re-plan.
8. Require the single phrase `DESTROY weatherroeidev`. Non-terminal execution
   fails unless the human explicitly supplies `--force`. `--dry-run` returns
   before confirmation/application; it cannot be combined with `--force`.
9. Apply main first. Any apply failure, changed Azure context or remaining
   `weatherroeidev-prod` group blocks bootstrap deletion. After successful
   main apply and verified group absence, retain a local receipt for bootstrap
   retry. Verify bootstrap inventory again, then apply bootstrap and require
   `weatherroeidev-state` to be absent. Retry receipts do not bypass group,
   subscription, ownership or confirmation checks.
10. Clean temporary working roots/plans in a `finally` block. Preserve bootstrap
    state and recovery snapshots after failures; remove successful teardown
    snapshots/receipt. Never manually delete an Azure group or tenant identity.

## Safety controls and operational limits

- Subscription **and tenant**, plus human-user authentication, checked before
  Azure planning and again before each destructive apply. Wrong subscription
  produces an actionable `az account set` error and cannot reach planning/apply.
- Explicit subscription/tenant in Terraform provider environment and main
  backend. No client secret, GitHub login/token or OpenWeather value required.
- Every planned managed action must be delete-only. Main IDs/RBAC scopes must
  stay inside the exact application group. Bootstrap addresses, resource IDs,
  principals and role scopes are restricted to the configured state resources.
  The only subscription-level exceptions are its precisely named discovery
  role definition and assignment to the known CI principal.
- Compare live group inventories to Terraform ownership before planning; an
  untracked resource blocks deletion of its containing group. No broad
  subscription resource deletion, identity deletion or automatic Key Vault purge.
- Terraform state locking and saved-plan lineage/serial checks remain active.
  Local execution **does not acquire GitHub's production concurrency lock**:
  wait for existing production deliveries to finish and do not push/dispatch
  during teardown. The local command neither starts nor cancels workflows.
- Operator needs existing assignment control-plane/RBAC delete permissions,
  frontend/state blob data permissions and discovery-role permissions. CLI
  authentication alone is not an authorization grant. Failures are explicit
  and nonzero; the tool does not grant itself permissions or hide access errors.
- Status uses account/group/resource reads, projected ACA provisioning/running
  status, remote blob **properties**, and the deleted-vault recovery list.
  It does not initialize Terraform, retrieve blob contents/access keys, read
  secrets or mutate Azure. An access error is not reported as resource absence.
- Soft-deleted Key Vault is reported by status and after successful teardown.
  Its retention is seven days; automatic provider purge is disabled. Name reuse
  can require retention expiry or separately authorized recovery/purge.
  Storage containers/blobs have seven-day retention while their account exists;
  deleting the account is not a promise of recoverable backups. Log Analytics
  can also retain a soft-deleted workspace under Azure's existing lifecycle;
  the script does not force-purge telemetry.

## Ownership outside Terraform

Read-only inspection found:

| Resource | Ownership and teardown outcome |
| --- | --- |
| GitHub OIDC Entra application `weatherroeidev-github-oidc` | Manually created; not in either Terraform root. Client ID `ba715c47-6668-40c5-b7b4-560662917611`, application object ID `4a3067c7-02f0-4a20-b29a-db93cebc7f64`. **Retained**; owner may review/delete separately after checking other consumers. |
| Its service principal | Object ID `fa9b7263-2d24-429b-b32d-c8b8607daf5b`. **Retained**, not a Terraform-managed workload identity. |
| Federated credential `github-assignment-immutable` | Manually created on that Entra application; issuer GitHub Actions, audience `api://AzureADTokenExchange`, observed subject `repo:RoeiKat@84272953/weather-app@1408831540:environment:assignment`. **Retained**, not replaced with the older name-based subject in historical docs. |
| Manual CI Contributor role | Observed at **subscription scope**, not application-group scope: assignment `efc2475b-7842-4179-9ae4-79a601ea78d4`. Not owned by either root; **retained** for authorized owner review/revocation. |
| Manual CI Role Based Access Control Administrator role | Also **subscription scope**: assignment `f05b57f7-458e-4728-baf9-c1b18617369c`. Not Terraform-owned; **retained**. The script does not mistake it for bootstrap's read-only discovery role. |
| Terraform CI discovery role/assignment and state blob roles | Owned by bootstrap and included in its 11-resource destroy plan; removed only after main succeeds. |
| Terraform workload identities, ACR roles, frontend blob role and one-secret Key Vault role | Owned by main and included in its destroy plan. Workload identities are removed with main, unlike the retained CI identity. |
| Human-populated `openweather` Key Vault secret | Value outside Terraform; never read. Deleting its Terraform-owned vault removes active access to this secret; it can remain recoverable with the soft-deleted vault. No separate key retrieval/deletion/purge is needed. |
| Database schema, SQL principals and assignment data | Application/bootstrap SQL ownership, not individual Terraform objects; removed when the Terraform-owned PostgreSQL server is deleted. No live SQL executed during this task. |
| Release-created ACA revisions, migration executions, registry images, frontend blobs | Delivery-owned data inside assignment Terraform resources; removed with their owning app/environment/job/registry/storage account, not via separate subscription-wide cleanup. |
| GitHub environment/settings/variables/secrets, workflows, run/artifact history | Outside Azure Terraform cleanup; **retained**. No GitHub secret values fetched. Do not use production delivery after teardown until intentionally restoring its prerequisites. |

The two broad manual subscription roles are an existing limitation, not added
permissions or an architectural improvement in this task. There is deliberately
no identity-cleanup flag that might remove shared tenant objects.

## Commands/tools used and validation

Tools: file glob/read/search, `apply_patch`, Git status/log/diff/check-ignore,
session task tracking, read-only Azure MCP subscription/resource inventories,
and Azure CLI through the existing helper. The VS Code test tool found no
registered Node tests, so the repository's native Node runner was used.

Commands actually executed:

```text
node --version
terraform version
npm run infra:test
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
terraform -chdir=infra test
terraform -chdir=infra\state validate
npm run infra:status
npm run infra:destroy -- --dry-run
node operations\local.mjs --help
node --check operations\local.mjs
node --check operations\local.test.mjs
```

The dry-run internally ran isolated `terraform init`, `state pull`, `validate`,
`plan -destroy` and `show -json` for both roots. It **never ran apply/destroy**.
Read-only Azure calls inspected account identity, resource groups/inventories,
blob properties, deleted vaults, selected main-state metadata, bootstrap
recovery discovery, CI RBAC and Entra application/federation metadata. Public
HTTPS GETs checked `/`, `/api/v1/health` and `/api/v1/auth/session`; response
session/credential values were not printed or saved.

Results:

- Node **73/73 passed**: 54 existing delivery tests plus 19 local operations
  tests. Covers subscription/tenant/human guards, inherited credential/argument
  isolation, flags, delete-only plans, unrelated ID/RBAC/group inventory
  rejection, nonsecret input derivation, 11-resource bootstrap recovery
  discovery and missing/conflicting ownership, one confirmation, force/dry-run, declined confirmation and
  failure ordering, receipt retry, read-only status/error handling, and existing
  delivery-path classification. Destructive orchestration is dependency-mocked;
  no real confirmation was approved.
- Terraform fmt, main validate and bootstrap validate **passed**; existing
  mocked Terraform tests **3/3 passed**.
- Real status: expected active user/subscription; both groups, state account,
  Front Door endpoint, PostgreSQL and ACA exist. ACA provisioning **Succeeded**,
  running **Running**; production remote state accessible (**246579 bytes**).
  No soft-deleted assignment vault at inspection time.
- Real main destroy plan: **70 delete-only resources**, including application
  group, API/environment/Job, Front Door/WAF/routing, registry, frontend
  storage/website, PostgreSQL/database/config/admin, vault, workload identities,
  network/DNS/NSG, monitoring and scoped roles.
- Real bootstrap destroy plan: **11 delete-only resources**: group, state
  account, three containers, operator blob role, three CI container blob roles,
  discovery role definition and its assignment.
- All inspected targets passed exact assignment-scope ownership checks. Live
  inventories contained no untracked resources that would be deleted with
  either group. **No creates, updates or unrelated targets accepted.**
- Recovery discovery independently matched the same **11** bootstrap imports
  using real read-only Azure metadata. Real imports were unnecessary because
  local bootstrap state exists; fresh-clone import execution is not claimed
  as a live exercise.
- Public frontend, health (`{"status":"ok"}`) and anonymous-session endpoint
  returned **HTTP 200 / no-store** after planning. No new registration,
  preference write, migration, promotion or deployment was performed.
- Generated plan workspaces and fresh dry-run input snapshot were removed.
  Existing local bootstrap state/backups remain protected and available.
- Repeated final-script dry-run and real status checks passed again with the
  same **70 + 11** delete counts and a running application. Node syntax/help,
  Git diff whitespace checks and **36 local documentation links** passed;
  pending-review markers were retained in both final AI records.
- Reviewed the scoped staged diff and scanned its eight files for private-key,
  JWT, GitHub-token, bearer-token and sensitive-literal patterns. No real
  credential values found; test credential strings are synthetic. This is a
  scoped check of this commit, not a comprehensive historical secret audit.

## Git finalization safeguard

The final cumulative comparison against deployed `771d800` found that prior
commit `f166bcd` changed `backend/README.md`. Although the **eight new operations
files** select no delivery surfaces, the unchanged detector would classify that
older documentation path as a pending backend release. A normal push could
therefore inadvertently resume the interrupted optional backend-only exercise.

Use **`[skip ci]` in this final operations commit message**. GitHub's
[official skip-workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
confirms that this skips push/pull-request-triggered runs for the marked commit.
It does not alter workflow logic, disable future main delivery, cancel existing
runs or authorize destruction. All relevant checks were run locally. No
workflow dispatch, rerun or application change was used to gather more evidence.
Main was fetched before commit and matched local HEAD with no divergence.
The commit and remote-head verification are reported in the final response;
unrelated untracked files are deliberately not part of it.

**Not verified:** actual destructive application, live deletion/soft-delete
completion, post-destroy recovery, or simultaneous GitHub/local teardown.
These require a future explicitly authorized human teardown. A successful
destroy plan does not prove delete permissions or provider deletion completion.

## Exact final usage

Prerequisites: Node 24, Terraform **1.16.5** and Azure CLI on PATH; authenticate
as the authorized human with `az login` and select the configured subscription.
No root dependency install or manual tfvars/state/GitHub coordination required.

```text
Deploy:  git push origin main
Status:  npm run infra:status
Destroy: npm run infra:destroy

Safe rehearsal:       npm run infra:destroy -- --dry-run
Authorized automation: npm run infra:destroy -- --force
Tests:                npm run infra:test
```

Interview summary: pushing main runs the existing OIDC delivery. Local status
only reads Azure. Local destroy validates the intended subscription, derives
inputs from state, shows delete-only plans and asks once; it removes the
application before verifying removal and deleting its state backend.

**Human decision: PENDING REVIEW**
