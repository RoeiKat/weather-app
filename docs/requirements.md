# Requirements baseline

Status: **Open baseline with documented human-confirmed project assumptions**.
Explicit assignment requirements, implied requirements, project assumptions,
proposed safeguards, and open decisions are distinct below. Confirmation of a
planning assumption is not approval of an Azure service, configuration, or ADR.
No numeric target or service SKU has been agreed.

## Functional requirements (explicit assignment)

| ID | Requirement |
| --- | --- |
| F-01 | Users can register and log in. |
| F-02 | Retrieve weather data from the OpenWeather API. |
| F-03 | Users can save relevant city/location preferences. |
| F-04 | Persist application data in PostgreSQL. |

Weather products, search behavior, location identifiers, units, and preference
limits remain Open.

## Non-functional requirements (explicit assignment)

| ID | Requirement |
| --- | --- |
| N-01 | Small internet-facing weather application hosted on Microsoft Azure. |
| N-02 | Prefer PaaS and managed services over IaaS. |
| N-03 | Low latency for geographically distributed users is important. |
| N-04 | AI usage throughout the project must be documented. |
| N-05 | The solution must leverage cloud services to achieve the best possible cost-benefit ratio. |

Performance thresholds, supported clients, and traffic estimates are TBD.
N-05 is an explicit requirement, clarified by the requesting user on 2026-10-07,
not merely a secondary consideration or project assumption. Evaluate
cost-effectiveness alongside HA, latency, security, and operational suitability;
the lowest infrastructure price alone does not establish the best cost-benefit
ratio. No explicit budget ceiling was provided. AS-06 describes the comparison
scope, not the source of the cost-effectiveness requirement. "Small" is not a
measured capacity requirement.

## Security requirements

### Explicit assignment

| ID | Requirement |
| --- | --- |
| S-01 | Securely hash passwords; never store them in plaintext. |
| S-02 | Privacy and security are important. |

### Proposed safeguards (not assignment quotations)

- S-P01: Server-side authentication and per-user authorization; validate inputs and parameterize database queries.
- S-P02: Protect secrets and personal data; use TLS, least privilege, sanitized telemetry, and appropriate session and abuse controls.
- S-P03: Minimize collected location/account data; define retention, deletion, and external-provider disclosures.
- S-P04: Evaluate managed secret storage, workload identity, and restricted database/origin access.

These are engineering proposals; concrete mechanisms require review. European
hosting alone does not establish GDPR compliance or guarantee all data remains
in Europe. The current project assumptions on data minimization (AS-07) and
non-public PostgreSQL access (AS-08) do not select their implementation mechanisms.

## Availability requirements

### Explicit assignment

| ID | Requirement |
| --- | --- |
| A-01 | High availability is important. |
| A-02 | The application must be accessible from the public internet. |

### Proposed evaluation scope

- A-P01: Assess compute and database redundancy, dependency failures, safe releases, backups, and tested recovery.
- A-P02: Define measurable availability SLO, recovery time objective (RTO), recovery point objective (RPO), and incident ownership.

Numeric targets and the concrete redundancy topology are TBD. Under the current
project assumption AS-05, HA covers application instance and Availability Zone
failures; regional disaster recovery is not currently required. This is a scope
interpretation of A-01, not an explicit assignment statement or a claim that HA
is implemented. Backups and tested data recovery still need evaluation.
Public access applies to the application, not its database or internal services;
AS-08 calls for non-public PostgreSQL access. OpenWeather outages and quota
exhaustion must be included in availability analysis, with graceful degradation
under AS-09 rather than whole-application failure.

## Deployment requirements

### Explicit assignment

| ID | Requirement |
| --- | --- |
| D-01 | Deploy in a European Azure region; exact region is TBD. |
| D-02 | Infrastructure must be reproducible using Terraform. |
| D-03 | Application deployment should eventually use CI/CD. |

### Working direction (unapproved)

| Topic | Current candidate/direction | Decision record |
| --- | --- | --- |
| Compute | Under Review; prior App Service acceptance reopened; no replacement selected | [ADR-001](adr/ADR-001-compute-platform.md) |
| Region | European region; no exact selection | [ADR-002](adr/ADR-002-azure-region.md) |
| Database hosting | PostgreSQL Flexible Server leading | [ADR-003](adr/ADR-003-database.md) |
| Global entry | Azure Front Door under consideration | [ADR-004](adr/ADR-004-global-entry-point.md) |
| Secrets/networking | Consider Key Vault and Managed Identity; topology Open | [ADR-005](adr/ADR-005-network-security.md) |
| Delivery | Terraform infrastructure ownership given; GitHub Actions proposed for application build/test/deploy | [ADR-006](adr/ADR-006-cicd-strategy.md) |
| Observability | Consider Azure Monitor and Application Insights | Open; record selection before implementation |

## Implied requirements (derived, not assignment quotations)

These describe consequences of the explicit requirements, not selected services
or approved implementation mechanisms.

| ID | Implied requirement | Related explicit requirements |
| --- | --- | --- |
| I-01 | Associate saved preferences with the authenticated user and enforce per-user authorization; login alone does not establish permission to access another user's data. | F-01, F-03, S-02 |
| I-02 | Establish trusted credential ownership and secure password verification. Local versus delegated identity remains TBD; F-04 does not require local password storage. | F-01, F-04, S-01, S-02 |
| I-03 | Protect privileged provider credentials from browsers and telemetry. A trusted intermediary does not imply a separate integration service. | F-02, S-02 |
| I-04 | Define necessary account/location data and its lifecycle before persistence design; account-linked location preferences can be personal data. | F-03, F-04, S-02 |
| I-05 | Assess availability per user journey across compute, PostgreSQL, identity, networking, OpenWeather, and releases. Platform management or a provider SLA does not establish application HA. | F-01 through F-04, A-01 |
| I-06 | Define observable failure paths, recovery procedures, and incident ownership appropriate to agreed failure coverage. | A-01, S-02 |
| I-07 | Evaluate end-to-end latency across user geographies, application, database, and provider calls. Edge routing or static caching does not eliminate dynamic origin latency. | N-03, F-02, F-04 |
| I-08 | Distinguish public application ingress from protected operations, database, origin, and administrative access; review abuse and trust boundaries. | A-02, F-01, S-02 |
| I-09 | Retain responsibility for application security, resilience, configuration, releases, and recovery verification when using managed services. | N-02, A-01, S-02 |
| I-10 | Coordinate Terraform, application releases, and versioned schema migrations without competing configuration owners; infrastructure reproduction alone does not restore application data. | D-02, D-03, F-04, A-01 |
| I-11 | Document significant AI assistance without sensitive data, distinguishing recommendations, verified evidence, and human approval. | N-04, S-02 |
| I-12 | Compare cloud-service options using equivalent workload, HA, security, and latency assumptions, dated representative pricing, and total operational cost; justify benefits as well as spend before accepting the architecture. | N-05, N-02, N-03, A-01, S-02 |

## Project assumptions (not assignment requirements)

AS-04 through AS-10 are current project assumptions explicitly confirmed by the
requesting user on 2026-10-07; see the
[requirements analysis AI record](ai/01-requirements-analysis.md). They guide
planning but do not accept an ADR or approve a service/topology. AS-01 through
AS-03 remain unapproved planning assumptions; related repository security rules
still apply. No language, framework, authentication provider, hosting tier,
environment layout, numeric target, or budget ceiling is selected.

| ID | Current assumption | Status | Related requirements |
| --- | --- | --- | --- |
| AS-01 | Start with a single small application/team; no demonstrated need for microservices or Kubernetes. Team size and workload still need validation; "small" does not justify omitting HA or security. | Unapproved; validate | N-01, N-02, A-01, S-02 |
| AS-02 | PostgreSQL will store account-related data and saved preferences; schema, identity ownership, and other retained data are TBD. Do not assume local password storage, precise coordinates, or lookup history. | Unapproved; validate | F-01, F-03, F-04, S-01, S-02 |
| AS-03 | Weather-provider access will be server-side so API credentials are not delivered to browsers. This does not by itself ensure privacy or require a separate service. | Unapproved planning assumption; trusted-server credential boundary required by repository guidance | F-02, N-03, S-02 |
| AS-04 | The application will initially use a single primary European Azure region. Exact region and intra-region redundancy configuration are TBD. | Human-confirmed project assumption | D-01, A-01, N-03 |
| AS-05 | High availability means resilience to application instance and Availability Zone failures; regional disaster recovery is not currently required. End-to-end dependency behavior, backups, data recovery, and numeric SLO/RTO/RPO remain TBD. | Human-confirmed project assumption | A-01, F-04; A-P01, A-P02 |
| AS-06 | For the explicit cost-effectiveness requirement N-05, compare redundancy, database, networking, telemetry, backups, and operational effort, not just base compute. No explicit budget ceiling was provided. | Human-confirmed comparison scope; cost-effectiveness itself is explicit under N-05 | N-01, N-02, N-05, A-01, D-01 |
| AS-07 | The application should minimize retained personal/location data. Necessary fields, precision, retention, deletion, and provider disclosures remain TBD. | Human-confirmed project assumption | F-01, F-03, F-04, S-02; S-P03 |
| AS-08 | PostgreSQL should not be publicly exposed in the final architecture. Private connectivity, DNS, administrative access, and deployment/migration connectivity remain TBD; no network service is selected. | Human-confirmed project assumption | F-04, A-02, S-02; S-P04 |
| AS-09 | OpenWeather failures should be handled gracefully rather than causing the entire application to fail. Exact degraded UX, timeout/retry behavior, caching permissions, and acceptable freshness remain TBD; failures must not be hidden as successes. | Human-confirmed project assumption | F-02, A-01, N-03, S-02 |
| AS-10 | Global latency should be improved where practical, but dynamic requests may still reach the European origin. This does not waive N-03; user geographies, measurable targets, and evidence of acceptable performance remain TBD. | Human-confirmed project assumption | N-03, D-01, F-02, F-04 |

These assumptions do not contradict the explicit baseline, but measurable
targets may require revisiting them. In particular, single-region deployment
does not protect against regional outages; zone resilience has a cost floor;
private database access requires workable operational paths; and caching trades
freshness for latency/quota resilience while requiring privacy and provider-term
review.

## Open decisions and clarification risks

All concrete mechanisms and targets below remain **TBD** unless covered by a
human-confirmed project assumption above.

| Topic | Decision or clarification needed | Related requirements |
| --- | --- | --- |
| Approval and operations | Who may approve architecture, security trade-offs, and recurring spend? Who owns monitoring, incidents, credential rotation, restore, and verification? | A-01, S-02, N-04 |
| Workload, cost, and latency | Define traffic/concurrency, supported clients, geographic distribution, latency percentiles/targets, and cost-benefit evaluation criteria. Obtain equivalent HA pricing and total operational cost evidence for N-05. No numeric target or budget ceiling is provided; evaluate whether AS-04/AS-10 meet N-03. | N-01, N-03, N-05, A-01; AS-04, AS-06, AS-10 |
| Availability and recovery | Define SLO measurement by user journey, maintenance policy, recovery scenarios, RTO/RPO, and manual/automatic recovery. AS-05 sets current instance/zone scope and excludes a regional DR requirement; backups, corruption recovery, and restore tests remain in evaluation scope. | A-01, F-01 through F-04; A-P01, A-P02, AS-05 |
| Region and residency | Select a European region with suitable service, zone, capacity, and legal support. Clarify whether backups, telemetry, edge processing, and external-provider data must remain in Europe; hosting alone does not establish compliance. | D-01, S-02, N-03; AS-04 |
| Identity and sessions | Decide local versus delegated identity, credential ownership, account identifiers, password policy/hashing parameters, recovery, email verification, MFA, session lifetime/revocation, and account deletion. Separate end-user, workload, and deployment identities. | F-01, S-01, S-02 |
| Data and privacy | Define minimum fields, location precision, units, preference limits, retention/deletion, backup aging, provider disclosures, and applicable privacy obligations. Include logs, traces, artifacts, Terraform state, and AI records in sensitive-data review. | F-03, F-04, S-02, N-04, D-02; AS-07 |
| OpenWeather | Select product/plan, search behavior, freshness, quota, caching terms, attribution, timeout/retry policy, and degraded UX. Clarify which user journeys remain available during provider outages without presenting stale or failed results as current successes. | F-02, F-03, N-03, A-01; AS-09 |
| PostgreSQL | Decide hosting, version, sizing, zone-failure resilience, backups/retention, restore, upgrade, pooling, and failover behavior. Test connection recovery and safe retries; replication is not a substitute for recoverable backups. | F-04, N-02, N-03, A-01; AS-05, AS-08 |
| Network and security boundaries | Define public/protected routes, origin bypass restrictions, non-public database access, secrets/workload identity, TLS, abuse controls, outbound provider access, DNS, and administrative/CI/migration connectivity. Strong isolation must not make deployment or recovery unworkable. | A-02, S-02, D-02, D-03; AS-08 |
| Platform and observability | Select application stack, compute, entry behavior, minimum capacity, scaling, health checks, and telemetry only after comparison against agreed workload, HA, privacy, latency, and explicit cost-effectiveness criteria. ADR-001 is Under Review; no replacement compute is selected. Existing "leading" candidates are hypotheses, not selected services. | N-01 through N-03, N-05, A-01, S-02, D-01 |
| Infrastructure and delivery ownership | Decide Terraform state/bootstrap and protection, plan/apply permissions, CI provider, release identities, environments, artifacts, approvals, drift handling, and property-level ownership. Terraform owns infrastructure; application automation must not independently overwrite the same configuration. | D-02, D-03, S-02, A-01 |
| Releases and migration | Define CI/CD adoption timing, compatible schema migration execution, release gates, rollback/roll-forward, and recovery artifacts. Application rollback does not automatically undo database changes. | D-03, F-04, A-01 |
| Frontend and acceptance | Define and approve frontend design, accessibility target, user journeys, and loading/error/privacy states before UI implementation; these are repository planning obligations, not new assignment quotations. | F-01 through F-03, S-02 |

Resolve architecture questions through [ADRs](adr/README.md); compare candidates
in [alternatives](architecture/alternatives.md). Implementation remains out of
scope for this foundation.
