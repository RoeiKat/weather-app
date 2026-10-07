# Architecture alternatives

Status: **Compute platform Accepted: Azure Container Apps; detailed architecture
Open**. The user initially accepted App Service in
[ADR-001](../adr/ADR-001-compute-platform.md) on 2026-10-07, reopened it because
explicit cost-effectiveness had been underweighted, and accepted Container Apps
after the [deeper Container Apps/Functions Flex reassessment](../ai/03-cost-effectiveness-reassessment.md#human-acceptance-2026-10-07).
Functions Flex is the strongest rejected alternative. These outlines are not
deployable designs; exact runtime version, CPU/memory, region, capacity,
networking, frontend/entry point, and other service choices remain Open.
All options must satisfy the [requirements](../requirements.md).

## Candidate A: App Service architecture

**Historical alternative; not selected:** Public HTTPS entry (Front Door optional/TBD) -> App Service
application -> PostgreSQL hosting TBD; server-side calls to OpenWeather.

- Evaluate managed web hosting, runtime/container packaging, scaling, and release options.
- Confirm region/tier support, instance counts, zone redundancy, health checks, and database availability; managed hosting alone does not guarantee application HA.
- Evaluate origin restriction, private database connectivity, workload identity, secrets, and telemetry options.
- Cost model: hosting plan capacity, database/HA, ingress, networking, monitoring, backups, and delivery.
- Open: stack, plan, deployment packaging, topology, and required minimum capacity.

## Candidate B: Container Apps/serverless architecture

**Selected compute; topology still proposed:** Public HTTPS entry TBD -> Container
Apps workload -> PostgreSQL hosting TBD; server-side calls to OpenWeather.

- Evaluate managed container hosting, revisions, scaling behavior, and workload profiles.
- Evaluate cold starts versus always-ready capacity, replica requirements, zone support, connection pooling, and release behavior.
- Evaluate ingress boundaries, environment networking, identity, secrets, registry, and observability.
- Cost model: capacity/consumption and minimum replicas, registry, database/HA, ingress, networking, monitoring, and backups.
- Open: runtime sizing, PostgreSQL pool limits, scale settings, environment/networking, AZ failure testing, and deployment/rollback testing.
- Azure Functions Flex was evaluated separately as the strongest rejected alternative. It has the lowest raw infrastructure price at the smallest evaluated configuration and can meet HA/private-network requirements. Container Apps' conventional Node.js/TypeScript API, OCI portability, and revision-based release/rollback benefits justify its modest premium relative to the dominant PostgreSQL HA cost. Lack of an event-driven need is not the reason for rejecting Flex.

## Candidate C: AKS/VM alternative

**Proposed outline:** Public ingress/load balancing TBD -> AKS workloads **or**
VM-hosted application -> PostgreSQL hosting TBD -> OpenWeather.

- AKS and VMs are distinct sub-options, not interchangeable or a combined requirement.
- AKS: evaluate managed control plane versus cluster/node/workload responsibilities, ingress, scaling, upgrades, and policy maintenance.
- VMs: evaluate OS patching, hardening, process supervision, redundancy, load balancing, and recovery ownership.
- Cost model: nodes/VMs, disks, ingress, database/HA, networking, monitoring, backups, and engineering/on-call time.
- Open: any capability that justifies the additional operational burden despite the PaaS preference.

## Shared unresolved components

PostgreSQL hosting/configuration, European region(s), authentication, edge entry,
network restrictions, secret storage, workload identity, and observability must
be evaluated for every candidate. Flexible Server, Front Door, Key Vault,
Managed Identity, Azure Monitor, and Application Insights are candidates only.

## Comparison criteria

Use the same workload, region assumptions, and recovery targets for all options.
Mark missing evidence **TBD**, not zero cost or guaranteed capability. The
[AI evaluation](../ai/02-compute-platform-evaluation.md#comparison-and-ai-recommendation)
preserves the original proposed weighted comparison prioritizing HA, PaaS
alignment, operational simplicity, and security. Its cost weighting and
judgment-only cost scores are insufficient for the explicit N-05 requirement.
The [completed reassessment](../ai/03-cost-effectiveness-reassessment.md) supplies
dated small-HA pricing and total cost-benefit reasoning. Container Apps is now
human-approved compute; no revised numerical weights/scores, exact sizing,
regional/database choice, or recurring spend is approved.

| Criterion | Evidence to collect |
| --- | --- |
| Cost-effectiveness (explicit N-05) | Dated comparable estimates with region/SKU, low/expected/peak load, equivalent HA capacity, database, edge, egress, network, logs, backups, and operational labor; justify benefits as well as spend. Budget ceiling and spend approval remain TBD. |
| HA | End-to-end failure model, zone/regional coverage, minimum instances, dependency behavior, release continuity, restore/failover evidence, SLO/RTO/RPO fit; distinguish provider SLA from application SLO. |
| Security/privacy | Threat model, authentication/authorization, TLS, ingress/origin and database exposure, identities, secrets, patch ownership, data flows/residency, retention, and abuse controls. |
| Latency | Target geographies and p50/p95/p99 under realistic load; cold starts, API/database distance, edge routing, permissible caching, and OpenWeather latency. |
| PaaS level | Who operates OS, runtime, nodes, scaling, patching, backups, and failover; alignment with managed-service preference. |
| Operational complexity | Provisioning, releases, rollback, migrations, incident response, alerting, recovery drills, and required team skills. |
| Maintainability | Stack compatibility, supported upgrade paths, testability, dependency/service lifecycle, portability trade-offs, and Terraform/CI support. |

Edge routing is not a substitute for nearby compute or database capacity.
Public caching must exclude private/authenticated content. Service availability,
SKU constraints, price, and region support must be rechecked when deciding.

## Evidence and next step

Official comparison guidance consulted for this foundation on 2026-10-07:

- [Choose an Azure compute service](https://learn.microsoft.com/azure/architecture/guide/technology-choices/compute-decision-tree)
- [Choose an Azure container service](https://learn.microsoft.com/azure/architecture/guide/choose-azure-container-service)

These references support comparison, not a completed design validation.
[ADR-001](../adr/ADR-001-compute-platform.md) records accepted Container Apps
compute; the [initial AI evaluation](../ai/02-compute-platform-evaluation.md)
preserves App Service approval and reopening history, and the
[reassessment](../ai/03-cost-effectiveness-reassessment.md) records the deeper
comparison and human acceptance. Next validate runtime sizing, PostgreSQL
pool limits, European region/zone support, AZ failure/surviving capacity,
private connectivity, and deployment/rollback before approving a deployable
configuration. ADR-002 through ADR-006 remain unchanged. Frontend hosting and
Front Door are separate decisions; implementation/provisioning is not authorized.
