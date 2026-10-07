# Compute platform evaluation and human decision

- **Date:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements:** [Requirements baseline](../requirements.md), F-01
  through F-04, N-01 through N-04, S-01/S-02, A-01/A-02, D-01 through D-03;
  current assumptions AS-04 through AS-10.
- **Related decision:** [ADR-001: Compute platform](../adr/ADR-001-compute-platform.md).
- **Related comparison:** [Architecture alternatives](../architecture/alternatives.md).

**Current status:** ADR-001 is **Under Review**, reopened by the requesting user
on 2026-10-07. The original evaluation and approval below are historical;
see [the reopening entry](#decision-reopened-2026-10-07). No replacement compute
platform has been selected.

## Problem/question

Evaluate Azure App Service, Container Apps, Functions, AKS, and Virtual Machines
for this specific small public weather application before selecting compute.
Prefer managed services and avoid unnecessary complexity while supporting
instance/Availability Zone resilience, private PostgreSQL, security/privacy,
European hosting, practical global latency, Terraform, and eventual CI/CD.

## Prompt used

**Faithful summary of the evaluation request:** Read the repository contract,
Copilot instructions, requirements, alternatives, and ADR-001. Compare all five
compute options against actual requirements, with 1-5 scores and unequal
weights. Explain deployment, operational ownership, HA, scaling/scale-to-zero,
additional components, security/networking, and over/underengineering. Include
AWS conceptual equivalents and their limits without selecting by familiarity.
Verify important Azure claims against current Microsoft documentation,
distinguish facts from judgment, and present trade-offs before ranking.
Assume a small application, instance/zone rather than multi-region resilience,
possible preference for two continuously available instances, and cost
importance without an explicit budget ceiling. Do not edit files before
approval; finish with recommendation, counterargument, alternative trigger,
and remaining verification needs.

**Faithful summary of the approval/update request:** Accept App Service in
ADR-001, preserve Container Apps as the strongest alternative, create this AI
record, and update alternatives only where necessary. Do not modify other ADRs
or create application/Terraform code.

These are summaries, not verbatim transcripts, except for the approval quotation
below. No secrets or personal application data were included; no
sensitive-content redactions were needed.

## Comparison and AI recommendation

Scores are architectural judgment, not measured performance, price quotations,
provider guarantees, or separately approved criteria. Higher is more favorable;
for overhead/complexity, higher means less work. Weights total 100%.

| Criterion | Proposed weight | App Service | Container Apps | Functions | AKS | VMs |
| --- | --- | --- | --- | --- | --- | --- |
| PaaS alignment | 15% | 5 | 5 | 5 | 3 | 1 |
| High availability | 20% | 5 | 5 | 5 | 5 | 5 |
| Operational overhead | 15% | 5 | 4 | 4 | 2 | 1 |
| Expected cost characteristics | 10% | 3 | 4 | 3 | 2 | 2 |
| Deployment complexity | 7% | 5 | 4 | 3 | 2 | 2 |
| Scaling | 5% | 4 | 5 | 5 | 5 | 3 |
| Security | 12% | 4 | 4 | 4 | 3 | 2 |
| Networking | 10% | 4 | 4 | 4 | 5 | 5 |
| CI/CD integration | 3% | 5 | 5 | 5 | 5 | 5 |
| Terraform support | 3% | 5 | 5 | 5 | 5 | 5 |
| **Weighted score / 5** | **100%** | **4.53** | **4.46** | **4.29** | **3.50** | **2.83** |

HA scores assume properly engineered HA-capable configurations, not default or
cheapest tiers. All options can meet the failure scope; implementation effort
is reflected in operations/deployment scores. Lower AKS/VM security scores
reflect greater customer security responsibility, not an inability to secure
them. Terraform/CI/CD are mandatory but weak discriminators because all options
support automation. Exact provider properties were not validated.

### Candidate trade-offs

- **App Service, rank 1:** Managed conventional web hosting, optional code or
  container deployment, supported releases, and a straightforward private
  database connectivity path. Lowest additional platform burden for the known
  workload. Its main drawback is ongoing Premium HA capacity cost, potentially
  underutilized. AWS learning analogy: Elastic Beanstalk, with some App Runner
  similarities; App Service's managed plan/worker model differs.
- **Container Apps, rank 2:** Managed container execution, revisions, granular
  sizing, and KEDA scaling without operating Kubernetes. Requires images,
  registry operations, and environment configuration. Its evaluated two-replica
  HA baseline does not scale to zero. AWS analogy: ECS on Fargate, with some
  App Runner similarities; environment/revision/ingress/scaling models differ.
- **Functions, rank 3:** HA-capable Flex Consumption/Premium can satisfy private
  networking and zone requirements. Function programming, storage dependencies,
  and potentially separate frontend hosting are not currently justified by an
  event-driven need. Zone-redundant Flex retains always-ready capacity. AWS
  analogy: Lambda, often with API Gateway; Azure hosting plans, scaling groups,
  and storage/networking requirements differ.
- **AKS, rank 4:** Multi-zone Kubernetes can meet requirements with redundant
  pods/nodes and resilient ingress. AKS Automatic reduces node/cluster work,
  but workload resources, policy, topology, and Kubernetes operations remain.
  No Kubernetes-specific need is evidenced. AWS analogy: EKS; managed/automatic
  offerings, identity, networking, and billing differ.
- **Virtual Machines, rank 5:** Zonal VMs/scale sets and load balancing can meet
  HA/private networking needs but leave guest OS, runtime, process supervision,
  deployment, and repair ownership with the team. No host-level need is
  evidenced. AWS analogy: EC2 with Auto Scaling and ELB; Azure orchestration,
  images/extensions, and load-balancing behavior differ.

**AI recommendation:** Select App Service for the conventional small web
application, retaining Container Apps as the close alternative. The narrow score
gap is not decisive mathematical evidence. Container Apps could become
preferable if container-first packaging is materially useful and comparable
two-replica HA sizing/pricing demonstrates better value. Genuine event-driven
or independently scaled workloads would strengthen that case, but should not be
invented to justify a service.

No compute choice alone ensures PostgreSQL availability, safe authentication
state, provider degradation, release continuity, privacy, or global latency.

## What was verified

### Repository and calculation evidence

- Read [AGENTS.md](../../AGENTS.md),
  [Copilot instructions](../../.github/copilot-instructions.md),
  [requirements](../requirements.md), [alternatives](../architecture/alternatives.md),
  [ADR-001](../adr/ADR-001-compute-platform.md), and the [AI convention](README.md).
- The initial evaluation was read-only. Before the approved documentation
  update, the worktree was clean and this record did not exist.
- Weighted totals were calculated from the recorded scores and weights.
- Approval authorizes only the scoped documentation changes, not implementation.

### Verified Azure facts and official sources

The evaluation consulted these current Microsoft sources on 2026-10-07:

- [App Service overview](https://learn.microsoft.com/en-us/azure/app-service/overview)
  and [hosting plans](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans):
  managed runtime/custom-container hosting; plan-level capacity and billing.
- [App Service reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-app-service):
  Premium v2-v4 zone redundancy requires at least two instances and supported
  region/SKU/scale unit. Multiple instances alone do not enable zone redundancy.
- [App Service scaling](https://learn.microsoft.com/en-us/azure/app-service/manage-automatic-scaling):
  manual, metric/schedule, and HTTP-based scaling; automatic scaling retains
  always-ready instances rather than request-driven scale-to-zero.
- [App Service VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration):
  outbound private-resource access is distinct from inbound private access.
- [Container Apps reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps):
  zone redundancy is enabled at environment creation, requires VNet integration,
  supports Consumption/Dedicated profiles, and needs at least two minimum
  replicas for multi-zone application distribution.
- [Container Apps scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
  and [revisions](https://learn.microsoft.com/en-us/azure/container-apps/revisions):
  KEDA-based scaling, supported scale-to-zero, and versioned revisions.
- [Container Apps networking](https://learn.microsoft.com/en-us/azure/container-apps/networking):
  workload-profiles environments support UDRs, NAT Gateway, and environment
  private endpoints; legacy Consumption-only environments have limitations.
- [Functions hosting](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale),
  [reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-functions),
  and [Flex Consumption](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan):
  classic Consumption lacks zone redundancy; zone-redundant Flex requires at
  least two always-ready instances per scaling function/group and does not
  scale to zero. Current Premium minimum is also two; required host storage
  must be zone redundant.
- [Functions networking](https://learn.microsoft.com/en-us/azure/azure-functions/functions-networking-options):
  Flex, Premium, and Dedicated support outbound VNet connectivity and private
  endpoints; classic Consumption lacks outbound VNet integration.
- [AKS reliability guidance](https://learn.microsoft.com/en-us/azure/aks/best-practices-app-cluster-reliability),
  [system node pools](https://learn.microsoft.com/en-us/azure/aks/use-system-pools),
  [Automatic](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic),
  and [KEDA](https://learn.microsoft.com/en-us/azure/aks/keda-about):
  multi-zone topology and redundant nodes/workloads need planning; Automatic
  reduces operations; pod scale-to-zero does not remove all cluster costs.
- [VM Scale Sets reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-virtual-machine-scale-sets)
  and [autoscaling](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/virtual-machine-scale-sets-autoscale-overview):
  zonal/fault-domain distribution, load-balancing integration, and automated
  capacity scaling; these do not remove guest/application operations.
- [Terraform on Azure](https://learn.microsoft.com/en-us/azure/developer/terraform/overview):
  AzureRM and AzAPI provide reproducible Azure resource management. This is not
  a validation of a particular provider version or proposed resource schema.

### Verification limits

No Azure tenant/resource inspection, provisioning, regional quota/capacity
validation, dated price quotation, workload benchmark, application build/test,
Terraform plan, deployment test, or zone-failover/restore test was performed.
Cost rankings and AWS analogies are explanatory judgments. Capability
documentation must be rechecked against the eventual region, SKU, provider
version, and topology before implementation.

## Final human decision

**Initially Approved** by the requesting user on **2026-10-07**; subsequently
reopened the same day. This section preserves the original approval, not current
acceptance. See [the reopening entry](#decision-reopened-2026-10-07).

Exact approval statement:

> I approve Azure App Service for ADR-001.

The same request directed ADR-001 to become Accepted and Container Apps to
remain the strongest alternative. This record is the repository approval
reference; AI output alone was not treated as approval.

- **Accepted:** Azure App Service as the compute platform.
- **Retained:** Azure Container Apps as the strongest alternative.
- **Not selected:** Functions, AKS, and VMs for the current workload.
- **Not separately approved:** Individual weights/scores, runtime, packaging,
  region, SKU, topology, capacity, spending, or implementation.
- **Other ADRs:** Unchanged by this update.

## Remaining TBDs and follow-up

- **Runtime/packaging:** Language/framework support, managed runtime versus
  custom container, and dependency lifecycle.
- **Region/SKU:** European region, Premium tier/size, scale-unit zone support,
  service availability, quotas, and capacity.
- **HA/scaling:** Final instance count, actual application placement, health
  checks, surviving-zone capacity, minimum/maximum scaling limits, and policy.
  Two instances were evaluated as a possible baseline, not approved sizing.
- **Pricing:** Dated comparable App Service/Container Apps estimates, HA
  utilization, release overlap, database, networking/edge, logs, backups,
  operational labor, and recurring-spend approval.
- **Availability/recovery:** User-journey SLOs, RTO/RPO, incident ownership,
  PostgreSQL failover, connection recovery, backups, and restore/failure tests.
- **Networking/security:** Private database access/DNS, public ingress and origin
  controls, outbound provider access, workload/deployment identities, secrets,
  TLS, abuse controls, and CI/migration/administrative connectivity.
- **State/data:** Authentication/session key sharing, portable application
  state, pooling, password controls, data minimization, retention/deletion,
  privacy-aware telemetry, and authorized caching.
- **Latency/provider:** User geographies and targets, optional edge value,
  OpenWeather quotas/terms, timeouts, bounded retries, freshness, and degraded UX.
- **Delivery/IaC:** Terraform state/provider versions and property ownership,
  CI/CD provider, release gates, slots/rollback, schema migration coordination,
  and prevention of competing configuration writers.

Regional DR is not currently required. No database, edge, secret-management,
networking, or delivery service is approved by the compute decision.

## Decision reopened: 2026-10-07

- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirement/decision:** Explicit N-05 in
  [requirements](../requirements.md), derived I-12, and
  [ADR-001](../adr/ADR-001-compute-platform.md).
- **Problem/question:** Correct the requirement classification and reopen the
  compute decision before continuing region selection. The initial decision
  was made before cost-effectiveness was weighted appropriately and before
  representative HA pricing was known.
- **Prompt (faithful summary):** The solution must leverage cloud services for
  the best possible cost-benefit ratio; this is an explicit requirement, not a
  secondary consideration. Update requirements, reopen ADR-001 from Accepted
  to Under Review with the reason documented, and update this AI record. Do not
  select a replacement compute platform or modify ADR-002. No sensitive data
  was included; no redactions were needed.
- **AI recommendation:** Preserve the original evaluation, scores, and human
  approval as history; suspend current acceptance and require renewed
  cost-benefit assessment on equivalent HA-capable configurations. Do not
  substitute an unverified cheaper configuration or lower the failure scope.

### Why the initial evidence is insufficient

The original matrix assigned only 10% to expected cost characteristics. Its cost
scores were architectural judgments, not representative price comparisons.
Cost was classified as a project assumption rather than the explicit
cost-effectiveness requirement now clarified by the user. Operational simplicity
and PaaS benefits remain relevant, but they do not establish the best
cost-benefit ratio without comparable spend and workload evidence.

The subsequent read-only region evaluation retrieved current Microsoft retail
rates on 2026-10-07 for a user-confirmed illustrative configuration: two Linux
P1v3 App Service instances, PostgreSQL Flexible Server General Purpose
Standard_D2ds_v5 primary plus zone-redundant standby, and 128 GiB standard Premium
SSD storage per database server, using USD pay-as-you-go and 730 hours/month.
This confirmation was a pricing assumption, not architecture or spend approval.

| Illustrative monthly estimate | Sweden Central | North Europe | West Europe |
| --- | --- | --- | --- |
| App Service, two Linux P1v3 instances | $259.88 | $245.28 | $259.88 |
| PostgreSQL primary and standby compute | $273.02 | $289.08 | $309.52 |
| PostgreSQL storage, 256 GiB total | $35.05 | $32.38 | $35.05 |
| Core subtotal | $567.95 | $566.74 | $604.45 |

Sources from that evaluation:

- [Azure Retail Prices API](https://prices.azure.com/api/retail/prices):
  `Azure_App_Service_Premium_v3_Plan_Linux_P1_v3` hourly rates of $0.178,
  $0.168, and $0.178; `Standard_D2ds_v5` hourly rates per selected server of
  $0.187, $0.198, and $0.212; Flexible Server `Storage` monthly unit rates of
  $0.1369, $0.1265, and $0.1369, respectively.
- [PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/)
  and [HA configuration/billing](https://learn.microsoft.com/en-us/azure/postgresql/high-availability/how-to-configure-high-availability):
  both primary and standby compute/storage are billed.
- [App Service reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-app-service):
  zone redundancy requires at least two instances and supported placement;
  there is no separate charge for enabling the feature.
- [PostgreSQL regional matrix](https://learn.microsoft.com/en-us/azure/postgresql/overview#azure-regions):
  North Europe and West Europe were flagged as temporarily blocking new
  zone-redundant HA deployments. Their estimates are hypothetical equivalent
  configuration costs, not proof of deployability.

These arithmetic estimates exclude networking/private endpoints, edge/WAF,
egress, telemetry, excess backups, secrets, non-production environments, scaling
and release headroom, external-provider fees, and operational labor. The storage
API labels its unit GB/month while the pricing guidance describes GiB/month;
the final quote must reconcile that terminology. No equivalent Container Apps
or other-platform quote, measured capacity, or total-cost model was obtained.
The figures establish a representative provisioned-capacity cost floor, not
that App Service is necessarily poor value or that another platform wins.

### Verification, human direction, and follow-up

- **What was verified:** Read the current requirements, ADR-001, original AI
  record, ADR guidance, and alternatives. Preserved original evaluation and
  approval evidence. The pricing evidence above comes from the preceding
  read-only region evaluation; it was not refreshed during this documentation
  correction. No resources, workloads, quotas, or failover behavior were tested.
- **Accepted in this update:** The user's explicit classification of
  cost-effectiveness as N-05 and direction to reopen ADR-001 as Under Review.
  AS-06 now describes comparison scope rather than making cost-effectiveness
  optional. Related status summaries are synchronized.
- **Deferred/not approved:** Replacement compute, revised scores/weights,
  runtime, sizing, region, topology, spend, and implementation. ADR-002 is
  unchanged; the previous region recommendation is not acceptance and depended
  on a compute decision that is now under review.
- **Final human direction:** Reopening authorized by the requesting user on
  2026-10-07. Renewed compute acceptance is **Pending**. Exact direction:

  > Reopen ADR-001 from Accepted to Under Review, documenting that the initial decision was made before this requirement was weighted appropriately and before representative HA pricing was known.

- **Follow-up:** Before renewed acceptance, compare equivalent HA workload
  capacity, low/expected/peak utilization, deployment overlap, private
  networking, shared database costs, telemetry, backups, and operational labor.
  Explain benefits as well as price, preserve security/latency/availability
  constraints, distinguish facts from estimates, and obtain explicit human
  approval. No new platform ranking is produced by this entry.
