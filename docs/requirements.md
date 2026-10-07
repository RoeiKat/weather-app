# Requirements baseline

Status: **Open baseline**. Assignment statements below are explicit constraints;
proposals and assumptions are not approved architecture. No numeric target or
service SKU has been agreed.

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

Performance thresholds, supported clients, traffic estimates, and cost ceiling
are TBD. "Small" is not a measured capacity requirement.

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
in Europe.

## Availability requirements

### Explicit assignment

| ID | Requirement |
| --- | --- |
| A-01 | High availability is important. |
| A-02 | The application must be accessible from the public internet. |

### Proposed evaluation scope

- A-P01: Assess compute and database redundancy, dependency failures, safe releases, backups, and tested recovery.
- A-P02: Define measurable availability SLO, recovery time objective (RTO), recovery point objective (RPO), and incident ownership.

Targets and zone/multi-region topology are TBD. Public access applies to the
application, not necessarily its database or internal services. OpenWeather
outages and quota exhaustion must be included in availability analysis.

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
| Compute | App Service leading; Container Apps serious alternative | [ADR-001](adr/ADR-001-compute-platform.md) |
| Region | European region; no exact selection | [ADR-002](adr/ADR-002-azure-region.md) |
| Database hosting | PostgreSQL Flexible Server leading | [ADR-003](adr/ADR-003-database.md) |
| Global entry | Azure Front Door under consideration | [ADR-004](adr/ADR-004-global-entry-point.md) |
| Secrets/networking | Consider Key Vault and Managed Identity; topology Open | [ADR-005](adr/ADR-005-network-security.md) |
| Delivery | Terraform infrastructure ownership given; GitHub Actions proposed for application build/test/deploy | [ADR-006](adr/ADR-006-cicd-strategy.md) |
| Observability | Consider Azure Monitor and Application Insights | Open; record selection before implementation |

## Planning assumptions (unapproved)

- AS-01: Start with a single small application/team; no demonstrated need for microservices or Kubernetes.
- AS-02: PostgreSQL will store account-related data and saved preferences; schema, identity ownership, and other retained data are TBD.
- AS-03: Weather-provider access will be server-side so API credentials are not delivered to browsers.
- AS-04: A single primary European region is a candidate starting point, not an agreed HA strategy.

Validate assumptions with the client. No language, framework, authentication
provider, hosting tier, environment layout, or budget is assumed selected.

## Open questions

- Who may approve architecture, security trade-offs, and recurring spend?
- What budget, traffic/concurrency, geographic user distribution, and latency percentiles/targets should comparisons use?
- What availability SLO, RTO/RPO, maintenance window, and regional-outage tolerance are required?
- Which European regions satisfy service, zone, capacity, legal, and data-residency needs? Must backups, telemetry, and edge processing also remain in Europe?
- What identity approach, password policy, recovery, email verification, MFA, session lifetime, and account deletion behavior are needed?
- Which OpenWeather product/plan, freshness, quota, caching terms, attribution, and failure UX apply?
- What location precision, units, preference limits, retention periods, and privacy obligations apply?
- Which compute, database configuration, ingress/origin restrictions, and observability services will be approved?
- Which application stack, frontend design, environments, deployment approvals, migration strategy, and rollback process are needed?

Resolve architecture questions through [ADRs](adr/README.md); compare candidates
in [alternatives](architecture/alternatives.md). Implementation remains out of
scope for this foundation.
