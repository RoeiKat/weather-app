# Azure policy tag drift after the partial first apply

- **Date:** 2026-10-08.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements/decisions:** N-04 and D-02 in
  [requirements](../requirements.md), and the
  [first-apply remediation](17-first-apply-remediation.md).
- **Final human decision:** **Approved for re-plan; not yet applied.**
- **Approval reference:** The requesting user's explicit follow-up instruction
  in this conversation on 2026-10-08, reporting the inspected live plan and
  authorizing only the two tag-key lifecycle ignores. The user explicitly
  prohibited `terraform apply`.

## Conversation and live evidence

**Prompt (faithful summary):** The new Terraform plan after the partial Azure
apply contained **31 create, 16 update, and 22 no-op** actions. The user inspected
every update and confirmed that all 16 changed exactly one top-level attribute:
`tags`. This subscription automatically injects `created_By` and `created_Date`.
For every tag-defining Terraform-managed resource in the main infrastructure
root that can receive these tags, add or merge lifecycle ignores for only those
two map keys. Do not ignore the whole tag map, stop managing the project's
`application`, `environment`, or `managed_by` tags, create duplicate lifecycle
blocks, change other resource settings, or alter architecture. Run local
Terraform formatting/validation/tests, existing Node tests, and available
actionlint; document the evidence and approval status. Do not apply.

The live partial apply and the user's subsequent plan inspection proved that
Azure injects these tags in this subscription. This is human-supplied live
evidence, not a new live check performed by the assistant. Raw plan/state data,
tag values, resource identifiers, and credentials are not reproduced. The
specific subscription policy assignments were not independently inspected.

Terraform previously compared the complete configured tag map with the map
returned by Azure and planned to remove the two externally managed keys.
Ignoring only those keys resolves this ownership conflict without hiding drift
in Terraform-owned tags.

## Exact fix and scope

Every tagged resource block in the main [infra root](../../infra) now includes:

```hcl
lifecycle {
  ignore_changes = [
    tags["created_By"],
    tags["created_Date"],
  ]
}
```

For resources with existing lifecycle blocks, these entries were appended to
the existing `ignore_changes` list instead of adding another block.

| Main-root file | Tagged resource blocks covered |
| --- | --- |
| [main](../../infra/main.tf) | Resource group (1) |
| [networking](../../infra/networking.tf) | VNet, private DNS zone, database NSG (3) |
| [security](../../infra/security.tf) | API and migration identities, ACR, Key Vault (4) |
| [Container Apps](../../infra/container-apps.tf) | Environment, conditional API, migration Job (3) |
| [database](../../infra/database.tf) | PostgreSQL Flexible Server (1) |
| [frontend](../../infra/frontend.tf) | Storage account (1) |
| [Front Door](../../infra/front-door.tf) | Profile, endpoint, firewall policy (3) |
| [monitoring](../../infra/monitoring.tf) | Log Analytics, action group, metric alerts, resource-health alert, revision alert (5) |

This covers **21 resource blocks**, not 21 currently deployed instances:
the metric alerts use `for_each` and API creation is conditional. Untagged
resources and the separate state-bootstrap root were not changed.

**Preserved ownership and behavior:**

- The shared tag expression and each resource's `tags = local.tags` remain
  unchanged. Terraform still manages `application = "weather"`,
  `environment = "production"`, `managed_by = "terraform"`, and other configured
  tag keys except the two explicitly ignored external keys.
- PostgreSQL still ignores only its previously delegated zone and standby-zone
  fields in addition to the new policy tag keys.
- The API retains its existing image, revision-suffix, and traffic-weight
  ignores, plus its bootstrap-image precondition.
- The migration Job retains its existing image ignore.
- No resource settings outside these lifecycle lists changed. The previous
  first-apply alert/NSG/DNS remediation is preserved.

**Accepted:** The user's narrow ownership split and directly related tests.
**Rejected/out of scope:** `ignore_changes = [tags]`, `ignore_changes = all`,
additional ignored tag keys or resource settings, architecture changes,
subscription policy changes, state-root changes, and an apply.

## Verification

Local checks used existing Terraform **1.16.5**, configured AzureRM **5.8.0**,
Node, and actionlint **1.7.12**. No dependencies were installed.

- `terraform fmt` on only the eight changed main-root files and the changed
  Terraform test file: passed.
- `terraform -chdir=infra fmt -check -recursive`: passed.
- `terraform -chdir=infra validate -no-color`: passed.
- `terraform -chdir=infra test -no-color`: **3 passed, 0 failed**, using the
  mocked AzureRM provider and plan-only runs.
- `node --test .\infra\test\delivery.test.mjs`: **26 passed, 0 failed**.
- `.\infra\.tools\actionlint\actionlint.exe -no-color`: passed; workflows
  unchanged.
- Whitespace, documentation-link/status, and changed-file scope checks: passed.

The [Node regression](../../infra/test/delivery.test.mjs) enumerates tagged
resources only in the main root, checks all 21 blocks have exactly one lifecycle
block, and verifies the exact ignore entries, including preservation of the
pre-existing ignores. It rejects whole-map ignores, extra ignores, missing
policy keys, duplicate lifecycle blocks, and removal of shared managed tags.
The [mocked Terraform test](../../infra/tests/assignment.tftest.hcl) additionally
checks the three Terraform-owned tag values on every tagged resource instance
when the conditional API is enabled. Existing bootstrap, first-apply
compatibility, and helper behavior tests remain passing.

Official [Azure Policy modify-effect guidance](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-modify)
was retrieved through the Azure documentation tool on 2026-10-08. It confirms
that Azure Policy can add or update resource tags during creation/update;
it is supporting platform documentation, not independent verification of this
subscription's policy configuration.

## Limitations and follow-up

No real Azure plan, `terraform apply`, resource mutation, or deployment was
performed in this follow-up. Mocked tests and exact configuration checks do not
prove the next live plan's action counts.

Prepare and review a fresh plan against the partially deployed state. Confirm
that the two injected keys no longer cause tag-only updates and that changes
to Terraform-owned tags remain visible. Do not reuse the earlier saved plan.
Applying the reviewed plan still requires separate human approval.
