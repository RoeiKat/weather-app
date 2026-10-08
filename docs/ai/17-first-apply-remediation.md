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
