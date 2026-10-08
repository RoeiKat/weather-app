# First Azure apply remediation

- **Date:** 2026-10-08.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements/decisions:** N-04 and D-02 in
  [requirements](../requirements.md), [ADR-005](../adr/ADR-005-network-security.md),
  and the [Terraform implementation record](16-terraform-cicd-implementation.md).
- **Final human decision:** **Approved for re-plan, not yet applied**.
- **Approval reference:** The requesting user's explicit remediation instruction
  in this conversation on 2026-10-08, including the required decision status and
  "Do not apply anything to Azure." This approves the scoped local fixes and
  re-plan, not another apply.

## Conversation and scope

**Prompt (faithful summary, not a raw transcript):** Fix only the live failures
from the first Azure deployment. In the revision scheduled query alert, keep
`ContainerAppSystemLogs_CL` and the existing query unchanged and add
`skip_query_validation = true`. For the `deny_other_out` and `deny_private_in`
NSG rules, send singular `destination_port_range = "*"` rather than plural
`destination_port_ranges = ["*"]`. Remove the explicit outbound Allow rule
targeting `AzurePlatformDNS`, without replacing it with another DNS allow.
Preserve all other networking/security behavior. Change only
[networking](../../infra/networking.tf),
[monitoring](../../infra/monitoring.tf), relevant infrastructure tests, and this
record. Run Terraform fmt/validate/test, Node helper tests, and actionlint if
available. Record the three Azure errors, causes, fixes, and human decision
status. Do not apply anything to Azure or change unrelated files.

The error summaries below are based on the user's report, not independently
retrieved deployment logs. Raw Azure responses, error codes, and deployment
timestamps were not provided; none are invented here. No secrets, personal
data, resource identifiers, or credentials are reproduced.

## Three reported Azure errors and exact fixes

| # | Failing resource | Reported error / why it happened | Exact fix |
| --- | --- | --- | --- |
| 1 | `azurerm_monitor_scheduled_query_rules_alert_v2.revisions` | Scheduled query alert creation failed because `ContainerAppSystemLogs_CL` did not exist yet in the new workspace. Creation-time query validation tried to resolve a table before first log ingestion had created it. | Add `skip_query_validation = true` to this resource. Keep the existing table, complete KQL query, criteria, evaluation/window settings, severity, scope, and action group unchanged. |
| 2 | `azurerm_network_security_rule.database["deny_other_out"]` | Azure rejected the all-port rule sent as `destination_port_ranges = ["*"]`. The wildcard needs the singular destination-port field rather than the array field. | The shared rule resource now sets `destination_port_range = "*"` and omits `destination_port_ranges` by setting it to `null` for wildcard ports. Preserve Outbound/Deny, priority 200, protocol `*`, source `10.42.2.0/27`, destination `*`, and all-port coverage. |
| 3 | `azurerm_network_security_rule.database["deny_private_in"]` | Azure rejected the same wildcard array representation for the inbound deny rule. It used the same shared plural-port assignment as the outbound rule. | Use the same singular wildcard fix. Preserve Inbound/Deny, priority 200, protocol `*`, source `*`, destination `10.42.2.0/27`, and all-port coverage. |

The exact shared port assignment is:

```hcl
destination_port_range  = contains(each.value.ports, "*") ? "*" : null
destination_port_ranges = contains(each.value.ports, "*") ? null : each.value.ports
```

Concrete-port rules retain their existing plural port lists. Both deny rules
remain present and retain the same filtering semantics; no deny was weakened
or turned into an allow.

## Additional required DNS correction

Remove the `dns` entry from `local.database_rules`: it explicitly allowed
outbound traffic from `10.42.2.0/27` to `AzurePlatformDNS` on port 53 at priority
130. Do not replace it with another DNS allow rule.

Azure-provided DNS is normally exempt from NSG filtering unless explicitly
targeted using its platform service tag. Microsoft documents `AzurePlatformDNS`
as a tag for overriding/blocking this default infrastructure communication.
An explicit Allow targeting that tag is not required to preserve the default
DNS path. Removing it leaves that exemption intact while the generic outbound
deny continues to restrict other traffic. This is a separate requested
correction, not an invented fourth Azure error.

**Verified source (2026-10-08):**
[Azure network security groups overview, Azure platform considerations](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#azure-platform-considerations).
Official documentation was retrieved using the Azure documentation tool;
no live Azure resources were inspected or modified.

## What was accepted, rejected, and preserved

- **Accepted:** Only the three requested remediation changes and directly
  related regression assertions in the existing
  [Terraform tests](../../infra/tests/assignment.tftest.hcl).
- **Rejected/out of scope:** Renaming the log table, rewriting the query,
  disabling the alert, weakening/removing either deny rule, adding a replacement
  DNS allow, broader infrastructure changes, and an Azure apply.
- **Preserved:** All seven remaining database NSG rules, including their names,
  priorities, directions, access, protocols, address prefixes, source ports,
  and destination-port coverage. Workload SQL/PgBouncer, HA SQL, regional
  Storage, and Entra permissions are unchanged. VNet/subnets, delegations,
  Storage service endpoint, private DNS/link, and NSG association are unchanged.

## Verification and limitations

Local checks completed using Terraform **1.16.5**, the configured AzureRM
**5.8.0**, and the already available tools; no dependencies were installed.

| Check | Command | Result |
| --- | --- | --- |
| Scoped formatting | `terraform -chdir=infra fmt networking.tf monitoring.tf tests\assignment.tftest.hcl` | Passed; only scoped Terraform files were eligible for formatting. |
| Recursive format check | `terraform -chdir=infra fmt -check -recursive` | Passed. |
| Configuration validation | `terraform -chdir=infra validate -no-color` | Passed. |
| Terraform tests | `terraform -chdir=infra test -no-color` | **3 passed, 0 failed**, using the mocked AzureRM provider and plan-only runs. |
| Node helpers | `node --test .\infra\test\delivery.test.mjs` | **25 passed, 0 failed**; controlled fixtures/mocks, no live Azure operations. The editor test runner discovered no tests, so the existing direct Node command was used. |
| Workflow lint | `.\infra\.tools\actionlint\actionlint.exe -no-color` | Passed with available actionlint **1.7.12**; workflows unchanged. |
| Whitespace/scope | `git diff --check` and worktree status | Passed; changes restricted to the requested two Terraform files, relevant Terraform test file, and this record. |

The new mocked plan test checks that first-deployment query validation is
skipped, the complete existing KQL is unchanged, no DNS rule or replacement was
introduced, both wildcard rules use only the singular field, and every
remaining NSG rule retains its prior semantics.

Local checks do not prove successful Azure provisioning, live DNS resolution,
log ingestion, or alert delivery. Skipping query validation does not create the
table or prove the query works before ingestion. No real Azure plan, apply,
resource mutation, migration, or deployment was performed in this remediation.

## Follow-up

Prepare and review a fresh plan against the partially deployed state; do not
reuse the failed deployment's saved plan. Another apply requires separate human
approval. After an approved apply, verify Azure acceptance of the corrected
rules, private DNS/database connectivity, system-log ingestion and table
creation, and revision-alert evaluation/delivery. These live checks remain
unverified.

## Second live apply: PgBouncer remediation (2026-10-08)

- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Final human decision:** **Approved for re-plan, not yet applied**.
- **Approval reference:** The requesting user's explicit follow-up instruction
  in this conversation on 2026-10-08, reporting exactly four PgBouncer errors
  from the complete second apply log and directing removal of custom tuning.
  The user explicitly prohibited another Azure apply.

### Conversation and four reported live failures

**Prompt (faithful summary):** Keep `pgbouncer.enabled = true`,
`require_secure_transport = on`, and `ssl_min_protocol_version = TLSv1.2`.
Remove Terraform management of `pgbouncer.default_pool_size`,
`pgbouncer.max_client_conn`, `pgbouncer.min_pool_size`, `pgbouncer.pool_mode`,
and `pgbouncer.reserve_pool_size`. Azure defaults, including transaction
pooling, are acceptable for this small assignment; application connection
pools remain bounded. Prefer this simplification over additional dependency
ordering or premature tuning without measured workload. Preserve PostgreSQL
SKU, HA, networking, authentication, storage, TLS, and architecture. Run local
Terraform and existing helper/actionlint checks, document the failures and
decision, and do not apply anything to Azure.

The user reported that the **complete second live apply log contained exactly
four errors, all PgBouncer-related**:

| # | Parameter | Reported failure and cause |
| --- | --- | --- |
| 1 | `pgbouncer.reserve_pool_size` | Azure PostgreSQL Flexible Server rejected this unsupported parameter on PostgreSQL 17. Remove it rather than substituting another tuning parameter. |
| 2 | `pgbouncer.max_client_conn` | Configuration failed because PgBouncer was not yet enabled. |
| 3 | `pgbouncer.min_pool_size` | Configuration failed because PgBouncer was not yet enabled. |
| 4 | `pgbouncer.pool_mode` | Configuration failed because PgBouncer was not yet enabled. |

These are faithful summaries of human-supplied live evidence. The assistant
did not retrieve or independently inspect the apply log; no raw error codes,
resource identifiers, or sensitive values are invented or reproduced.

The configuration resource used one `for_each` map for enablement and tuning.
Its instances depended on the server but not on one another, so Terraform could
configure tuning concurrently with `pgbouncer.enabled`. This raced Azure's
enablement prerequisite. Additional sequencing could address that race, but
would not make the unsupported PG17 reserve parameter valid and is unnecessary
when the assignment accepts Azure defaults.

### Accepted simplification and preserved behavior

The [database configuration](../../infra/database.tf) now manages exactly:

```hcl
"require_secure_transport" = "on"
"ssl_min_protocol_version" = "TLSv1.2"
"pgbouncer.enabled"        = "true"
```

All five requested tuning entries were removed. `pgbouncer.default_pool_size`
was removed as part of the approved defaults decision, not because the user
reported a fifth error. No replacement parameter, resource split, extra
dependency, delay, or workaround was added.

**Accepted:** Rely on Azure-managed PgBouncer defaults, including transaction
pooling, rather than tune without workload measurements. PgBouncer remains
enabled and both explicit TLS settings are unchanged. The API still uses port
6432 with pool maximum 5; migrations use direct port 5432 with pool maximum 1.
No application-side connection settings changed.

**Rejected/out of scope:** Additional PgBouncer dependency complexity, custom
pool tuning, changes to PostgreSQL version/SKU, HA, networking, authentication,
storage, TLS, architecture, or an Azure apply. Existing policy-tag lifecycle
ignores and the earlier alert/NSG/DNS fixes remain intact.

Official [Azure PostgreSQL PgBouncer guidance](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-pgbouncer)
was retrieved through the Azure documentation tool on 2026-10-08. It documents
`transaction` as the default pooling mode and says tuning parameters are
exposed only after `pgbouncer.enabled` is true. This supports the defaults and
enablement reasoning; the unsupported reserve parameter on PG17 is evidenced
by the reported live failure, not an independently queried parameter catalog.

### Local verification and remaining live checks

Using existing Terraform **1.16.5**, configured AzureRM **5.8.0**, Node, and
actionlint **1.7.12**:

- `terraform -chdir=infra fmt database.tf tests\assignment.tftest.hcl`: passed.
- `terraform -chdir=infra fmt -check -recursive`: passed.
- `terraform -chdir=infra validate -no-color`: passed.
- `terraform -chdir=infra test -no-color`: **3 passed, 0 failed**, with mocked
  AzureRM and plan-only runs.
- `node --test .\infra\test\delivery.test.mjs`: **26 passed, 0 failed**.
- `.\infra\.tools\actionlint\actionlint.exe -no-color`: passed.
- Whitespace, documentation-link/status, and changed-file scope checks: passed.

The [Terraform regressions](../../infra/tests/assignment.tftest.hcl) now assert
the exact three managed parameter keys and values, preventing reintroduction
of custom PgBouncer tuning while retaining TLS. They also check the actual
planned API and migration Job environment values retain pool bounds 5 and 1.
Only the database file, relevant Terraform tests, and this record changed.
No dependencies were installed, and workflows and helper code were unchanged.

No real Azure plan, apply, resource mutation, or deployment was performed in
this follow-up. Local tests do not prove successful live enablement or current
server defaults. Prepare and review a fresh plan against the partially deployed
state, including removal/reset of any tuning configuration that succeeded
before the failure. After a separately approved apply, verify PgBouncer
enablement, Azure-managed defaults/transaction pooling, and API/database
connectivity. Do not reuse the failed saved plan or infer apply authorization
from this remediation.

## Windows Azure CLI wrapper and delivery mocks (2026-10-08)

- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Approval reference:** The requesting user's explicit follow-up instruction
  in this conversation on 2026-10-08 to preserve the working Windows CLI fix,
  extract a small command-construction helper, fix cross-platform mocks, retain
  all scenarios/assertions, and pass all 26 delivery tests.
- **Final human decision:** Approved for scoped helper/test refactoring.
  No Azure mutation authorized; infrastructure approval remains
  **Approved for re-plan, not yet applied**.

**Prompt (faithful summary):** The Windows fix invokes Azure CLI through
`cmd.exe` and works, but broke mocked delivery tests. Do not revert it. Support
mocking Linux's `az` executable and Windows's `cmd.exe /d /s /c az ...` through
one shared command-construction helper rather than duplicated platform parsing.
Run the existing delivery suite with all 26 tests passing and document the fix.
Do not run Azure mutations.

**Problem/cause:** The scenario mocks assumed `execFileSync` directly received
`az` with the Azure command at argument index zero. The working Windows wrapper
instead selects `ComSpec` (falling back to `cmd.exe`) and prefixes the arguments
with `/d`, `/s`, `/c`, and `az`. The executable assertion and command-position
checks therefore failed or misinterpreted the wrapper arguments. The user
reported successful live Windows CLI execution; that live result was not
repeated during this task.

**Accepted fix:**

- Extract `azureCommand` in the existing
  [Azure helper](../../infra/scripts/azure.mjs). It returns the executable and
  argument array: direct `az` on Linux, or the existing `ComSpec`/`cmd.exe`
  wrapper on Windows. Production `az()` uses that helper without changing its
  output flags, execution options, JSON parsing, or sanitized error handling.
- Use one `azureCliArgs` test helper in the existing
  [delivery tests](../../infra/test/delivery.test.mjs) to verify the selected
  executable, unwrap the shared prefix, and verify the JSON/error-output flags.
  All Azure command mocks use it; human SQL tests retain the separate mocked
  Terraform-output branch.
- Test both platform command shapes explicitly in the existing fingerprint
  test, including a synthetic custom `ComSpec` path containing spaces,
  preservation of JSON arguments containing spaces/quotes, and unchanged input
  arguments. All 26 existing test cases remain; none were added or removed.
- Preserve all release, bootstrap, rollback, failure, drift, token cleanup,
  and security assertions. The previous hard-coded executable assertion is now
  the equivalent platform-aware assertion in the shared mock helper.

**Rejected/out of scope:** Reverting the Windows wrapper, repeating
platform-specific argument parsing in every scenario, weakening scenario
assertions, changing delivery behavior, or running live Azure commands.

**Verification:** With existing Node **24.15.0**,
`node --test .\infra\test\delivery.test.mjs` passed:
**26 tests, 26 passed, 0 failed, 0 skipped, 0 cancelled**. The suite ran on
Windows; Linux command construction was tested explicitly, not by running the
suite on a Linux host. Whitespace, local documentation links/status, and
changed-file scope checks passed.

Only the Azure helper, delivery tests, and this record changed. The pre-existing
working Windows fix was retained. No dependencies were installed. Terraform
validation was not rerun for this JavaScript-only fix. Infrastructure settings
were unchanged, and no live Azure command/mutation was executed. Release/admin
messages in test output describe mocked fixtures, not real deployments.
