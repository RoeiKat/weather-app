# Architecture alternatives

Status: **Open**. These are candidate outlines, not deployable designs or accepted
decisions. App Service is the current leading compute candidate; no winner is
selected. All candidates must satisfy the [requirements](../requirements.md).

## Candidate A: App Service architecture

**Proposed outline:** Public HTTPS entry (Front Door optional/TBD) -> App Service
application -> PostgreSQL hosting TBD; server-side calls to OpenWeather.

- Evaluate managed web hosting, runtime/container packaging, scaling, and release options.
- Confirm region/tier support, instance counts, zone redundancy, health checks, and database availability; managed hosting alone does not guarantee application HA.
- Evaluate origin restriction, private database connectivity, workload identity, secrets, and telemetry options.
- Cost model: hosting plan capacity, database/HA, ingress, networking, monitoring, backups, and delivery.
- Open: stack, plan, deployment packaging, topology, and required minimum capacity.

## Candidate B: Container Apps/serverless architecture

**Proposed outline:** Public HTTPS entry (Front Door optional/TBD) -> Container
Apps workload -> PostgreSQL hosting TBD; server-side calls to OpenWeather.

- Evaluate managed container hosting, revisions, scaling behavior, and workload profiles.
- Evaluate cold starts versus always-ready capacity, replica requirements, zone support, connection pooling, and release behavior.
- Evaluate ingress boundaries, environment networking, identity, secrets, registry, and observability.
- Cost model: capacity/consumption and minimum replicas, registry, database/HA, ingress, networking, monitoring, and backups.
- Open: suitability for the chosen application, scale settings, environment, and container operations.
- Azure Functions may be evaluated as a separate serverless variant if workload evidence justifies it; it is not selected or assumed equivalent to Container Apps.

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
Mark missing evidence **TBD**, not zero cost or guaranteed capability. Weights
and scores require human agreement; no ranking is assigned yet.

| Criterion | Evidence to collect |
| --- | --- |
| Cost | Dated estimate with region/SKU, low/expected/peak load, HA capacity, database, edge, egress, network, logs, backups, and operational labor; compare with approved budget. |
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

These references support comparison, not a completed design validation. Gather
client targets and candidate-specific evidence, then propose a decision in
[ADR-001](../adr/ADR-001-compute-platform.md) for human review.
