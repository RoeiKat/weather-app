# Architecture Decision Records

ADRs capture consequential choices, the requirements they address, evidence,
trade-offs, and human approval. Assignment constraints remain constraints even
while their implementation choices are unresolved.

## Workflow

1. Copy [the template](template.md) to `ADR-NNN-short-title.md`; use the next unused number.
2. Start **Proposed**. Describe context, options, missing evidence, impacts, and unresolved requirements. Decision may remain **TBD**.
3. Compare options and link verified sources, experiments, estimates, and any [AI record](../ai/README.md).
4. Request approval from the authorized human owner. Only then set **Accepted**, recording approver, approval date, and durable approval reference.
5. Implement only the accepted scope; update related requirements and documentation.

Statuses: **Proposed**, **Accepted**, **Under Review**, **Rejected**,
**Superseded**. Under Review suspends a previously accepted decision at the
authorized human owner's direction; preserve approval history and document the
reason, date, and reopening reference. Renewed acceptance requires explicit
human approval. Open/TBD labels describe unresolved content, not acceptance.
AI-generated recommendations and silence are never approval.

Keep accepted records as history. A changed decision needs a new ADR linked to
the old one; mark the old record Superseded with its replacement. Never silently
rewrite an accepted decision. Minor factual clarifications should preserve
approval history.

## Initial records

ADR-001 is **Accepted: Azure Container Apps**, approved by the requesting user
on 2026-10-07 after the cost-effectiveness reassessment. At the user's explicit
direction, the reopened record was closed in place, preserving initial App
Service acceptance, reopening, deeper Container Apps/Functions Flex comparison,
and final approval. ADR-002 through ADR-006 remain **Proposed**, with **TBD**
decisions; exact compute sizing and implementation validation remain Open.

| Record | Scope |
| --- | --- |
| [ADR-001](ADR-001-compute-platform.md) | Compute platform; Accepted: Azure Container Apps |
| [ADR-002](ADR-002-azure-region.md) | Exact European region and regional strategy |
| [ADR-003](ADR-003-database.md) | PostgreSQL hosting, availability, and recovery configuration |
| [ADR-004](ADR-004-global-entry-point.md) | Public/global entry and edge behavior |
| [ADR-005](ADR-005-network-security.md) | Network boundaries, secrets, and workload identity |
| [ADR-006](ADR-006-cicd-strategy.md) | Delivery tooling, permissions, and ownership |

Authentication, observability, or other significant choices may need additional
ADRs before implementation; the initial list is not exhaustive.
