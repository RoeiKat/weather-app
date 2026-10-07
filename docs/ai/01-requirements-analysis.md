# Requirements analysis and current project assumptions

- **Date:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user; identity and broader architectural approval authority TBD.
- **Related requirements:** [Requirements baseline](../requirements.md), F-01 through F-04, N-01 through N-04, S-01/S-02, A-01/A-02, D-01 through D-03.
- **Related ADRs:** [Initial ADR index](../adr/README.md). All six ADRs remain Proposed/TBD and were not modified or accepted.

## Problem/question

Review the assignment as a senior Azure/DevOps architect, distinguish explicit
requirements from implications and assumptions, challenge current directions,
and identify unresolved decisions, risks, and trade-offs before implementation.
Then record the user's current planning assumptions without inventing targets,
selecting Azure services, or changing ADRs.

## Prompt used

**Faithful summary of the analysis request:** Read the repository contract,
Copilot instructions, and requirements. Perform a read-only architectural review
organized into explicitly required, implied, assumed, undecided, and risky or
unknown items, referencing requirement IDs. Pay particular attention to HA
versus DR, PaaS versus IaaS, privacy/minimization, public exposure, global latency,
authentication boundaries, PostgreSQL availability, Terraform, and CI/CD
ownership. Challenge assumptions, identify conflicts/trade-offs, avoid final
service recommendations, and end with prioritized next decisions.

**Faithful summary of the documentation update request:** Use the analysis to
update only the requirements baseline and create this AI-session record.
Preserve requirement IDs and distinguish explicit assignment requirements,
implied requirements, project assumptions, and open decisions. Do not promote
assumptions to assignment requirements or invent numeric SLO, latency, RTO, RPO,
traffic, or budget targets. Document the seven user-supplied assumptions listed
below. Explain intended sections before editing. Do not modify ADRs, select
Azure services, or create application/Terraform code.

These are summaries, not verbatim transcripts. No sensitive material was
included and no sensitive-content redactions were needed.

## Key AI findings

- HA and regional DR are distinct. Backups and reproducible infrastructure do
  not provide continuous availability; zone resilience does not cover a regional
  outage. End-to-end behavior and data recovery still require evaluation.
  **[A-01; A-P01/A-P02]**
- Public application access does not require public database, origin, or
  administrative access. Authentication, per-user authorization, workload
  identity, and deployment identity are separate boundaries.
  **[A-02, F-01/F-03, S-02]**
- Managed services reduce some operational responsibilities but do not establish
  application HA or remove security, release, and recovery responsibilities.
  **[N-02, A-01, S-02]**
- A European origin and global entry layer do not guarantee low dynamic latency
  worldwide or Europe-only processing. Targets and data flows need evidence.
  **[N-03, D-01, S-02]**
- PostgreSQL redundancy must be considered alongside compute. Failover,
  connection recovery, safe retries, backups, and restore compatibility matter.
  **[F-04, A-01]**
- Local password storage, precise coordinates, and lookup history are not
  established assignment requirements. Minimize data after identifying necessary
  features and identity ownership. **[F-01/F-03/F-04, S-01/S-02]**
- OpenWeather quota/outages can dominate availability and latency; graceful
  degradation needs an explicit freshness, caching, and failure contract.
  **[F-02, A-01, N-03]**
- Terraform, application configuration, migrations, and delivery need explicit
  ownership to avoid competing writers and unsafe releases.
  **[D-02/D-03, F-04, A-01]**
- Main tensions are HA versus cost, global latency versus single-region dynamic
  processing, isolation versus operational simplicity, and freshness versus
  provider quota/resilience. No hard requirement contradiction was established
  from the qualitative baseline. **[A-01, N-01/N-03, S-02, F-02, D-01]**

## What was verified

### Repository evidence

- Read [AGENTS.md](../../AGENTS.md),
  [Copilot instructions](../../.github/copilot-instructions.md), and
  [requirements](../requirements.md).
- Read [architecture alternatives](../architecture/alternatives.md), the
  [ADR index](../adr/README.md), all six initial proposed ADRs, the
  [AI convention](README.md), and the [frontend foundation](../design/README.md).
- The baseline contains explicit requirement IDs, proposed safeguards,
  unapproved assumptions AS-01 through AS-04, and unresolved qualitative targets.
  Named services are candidates, not accepted architecture.
- The repository guidance establishes documentation-only scope, Terraform
  infrastructure ownership, human architectural approval, trusted-server
  security boundaries, and frontend design approval before implementation.
- The worktree was clean immediately before this documentation update.

### External evidence and limits

The prior review consulted Microsoft's
[shared responsibility for reliability](https://learn.microsoft.com/azure/reliability/concept-shared-responsibility)
guidance on 2026-10-07. It supports the distinction between platform reliability,
optional reliability capabilities, and customer application responsibilities.
Only public architectural guidance was consulted; no tenant/resource inspection
was performed.

No service/SKU selection, current price, capacity/quota, region capability,
legal compliance, numeric target, or implemented runtime/failover behavior was
validated. This is documentation work, not a deployed-system verification.

## What the user accepted

The user explicitly authorized this two-file documentation update and supplied
the current assumptions AS-04 through AS-10 below. The user required stable
existing IDs, clear categorization, no invented numeric targets, and no ADR or
service selection.

This does not establish acceptance of every recommendation from the review.
AS-01 through AS-03 remain unapproved planning assumptions; existing repository
security instructions continue to apply independently.

## Final human assumptions/decisions

**Status: Confirmed as current project planning assumptions, not accepted ADRs.**
Confirmed by the requesting user on 2026-10-07 through the explicit documentation
update instruction summarized above; this record captures that approval scope.
The user-requested filename is used instead of the convention's dated filename.

| ID | Human-confirmed current assumption | Related requirements |
| --- | --- | --- |
| AS-04 | Initially use a single primary European Azure region. | D-01, A-01, N-03 |
| AS-05 | HA means resilience to application instance and Availability Zone failures; regional DR is not currently required. | A-01; A-P01/A-P02 |
| AS-06 | Consider and compare cost; no explicit budget ceiling was provided. | N-01/N-02, A-01, D-01 |
| AS-07 | Minimize retained personal/location data. | F-01/F-03/F-04, S-02 |
| AS-08 | PostgreSQL should not be publicly exposed in the final architecture. | F-04, A-02, S-02 |
| AS-09 | Handle OpenWeather failures gracefully rather than failing the entire application. | F-02, A-01, N-03, S-02 |
| AS-10 | Improve global latency where practical; dynamic requests may still reach the European origin. | N-03, D-01, F-02/F-04 |

No conflict with the qualitative explicit baseline was identified. These
assumptions do not waive the explicit requirements; future measurable targets
may require revisiting them. No architecture implementation is authorized by
this record.

## What remains undecided

- Numeric availability/latency targets, traffic, budget ceiling, maintenance
  policy, and scenario-specific RTO/RPO. **[A-01, N-01/N-03]**
- Exact European region, instance/zone topology, service configurations, and
  permitted processing locations for backups, telemetry, edge, and providers.
  **[D-01, A-01, S-02]**
- Identity/credential ownership, password parameters, verification/recovery,
  sessions, authorization mechanisms, and account deletion.
  **[F-01/F-03, S-01/S-02]**
- Necessary account/location fields, precision, retention, deletion, and
  external-provider disclosures. **[F-03/F-04, S-02]**
- OpenWeather product, quota, freshness, caching rights, retries, and degraded
  UX. **[F-02, A-01, N-03]**
- PostgreSQL hosting, sizing, HA, pooling, backup/restore, and private
  administrative/deployment/migration connectivity. **[F-04, A-01, S-02]**
- Compute/runtime, frontend design, entry/network mechanisms, observability,
  environments, CI provider, Terraform state/bootstrap, permissions, migration
  execution, rollback, and incident/approval ownership.
  **[N-02, D-02/D-03, A-01, S-02]**

Follow-up remains evidence-based comparison and human decisions before
implementation. Existing ADRs are deliberately unchanged; their regional and
network options must be reconciled with these current assumptions in a later,
explicitly authorized ADR update.
