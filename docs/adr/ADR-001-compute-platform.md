# ADR-001: Compute platform

## Status

**Accepted**. Azure Container Apps was accepted by the requesting user on
2026-10-07 after the completed cost-effectiveness reassessment.

- Human decision owner: Requesting user.
- Initial approval date: 2026-10-07.
- Initial approval reference: Explicit user approval, preserved in the
  [compute platform evaluation AI record](../ai/02-compute-platform-evaluation.md#final-human-decision).
- Initial approval scope: Azure App Service as the compute platform only; implementation
  configuration and other ADR decisions remain Open.
- Reopening reference: Explicit user direction and rationale recorded in the
  [reopened decision entry](../ai/02-compute-platform-evaluation.md#decision-reopened-2026-10-07).
- Renewed approval date: 2026-10-07.
- Renewed approval reference: Explicit user direction to close ADR-001 as
  Accepted and select Azure Container Apps, recorded in the
  [human acceptance entry](../ai/03-cost-effectiveness-reassessment.md#human-acceptance-2026-10-07).
- Accepted scope: Azure Container Apps as the application compute platform.
  Exact runtime version, CPU/memory sizing, capacity, region, database hosting,
  networking, frontend/entry point, and other ADR decisions remain Open.
  This approval does not authorize application/Terraform generation,
  implementation, provisioning, or recurring spend.

At the user's explicit direction, this reopened ADR is closed in place with
its decision history preserved below. The original App Service acceptance is
historical, not the current selected platform.

## Decision history

1. **App Service initially accepted, 2026-10-07:** The requesting user approved
   App Service as the compute platform. The original evaluation and approval
   remain in the [initial AI record](../ai/02-compute-platform-evaluation.md#final-human-decision).
2. **Decision reopened, 2026-10-07:** Explicit cost-effectiveness under N-05 had
   been underweighted. The initial comparison used a 10% judgment-based cost
   criterion without dated comparable HA prices. The user suspended that
   acceptance and requested reassessment; see the
   [reopening entry](../ai/02-compute-platform-evaluation.md#decision-reopened-2026-10-07).
3. **Deeper comparison completed, 2026-10-07:** Container Apps and Functions
   Flex Consumption were compared for a Node.js/TypeScript API, including
   equivalent small HA baselines, private PostgreSQL, delivery, operations,
   portability, and the dominant HA database cost; see the
   [cost-effectiveness reassessment](../ai/03-cost-effectiveness-reassessment.md).
4. **Container Apps selected, 2026-10-07:** The requesting user accepted
   Container Apps for overall cost-benefit after that reassessment. Functions
   Flex is the strongest rejected alternative. No exact sizing or implemented
   failure/release behavior was approved as validated.

## Context

Small public Azure weather application with registration/login, server-side
OpenWeather integration, saved preferences, and PostgreSQL persistence. The
assignment prefers PaaS/managed services, European hosting, high availability,
security/privacy, Terraform, eventual CI/CD, and leveraging cloud services for
the best possible cost-benefit ratio.

Current assumptions use one primary European region, instance and Availability
Zone failure resilience rather than regional DR, and non-public PostgreSQL
access. Cost-effectiveness is explicit under N-05, but no explicit budget ceiling
was provided. The completed reassessment uses a conventional Node.js/TypeScript
API as its design basis and compares small zone-resilient hosting configurations.
Two continuously available replicas/instances were evaluated as an HA baseline,
not validated production capacity. Exact runtime version, CPU/memory, traffic,
latency targets, scale settings, region, and network topology remain TBD.

## Requirements

[Requirements](../requirements.md): F-01 through F-04, N-01 through N-05,
S-01/S-02, A-01/A-02, D-01 through D-03; current assumptions AS-04 through AS-10.

## Options considered

- **Azure Container Apps: selected.**
- **Azure Functions Flex Consumption: strongest rejected alternative.**
- Azure App Service: initially accepted; not selected after reassessment.
- Azure Kubernetes Service (AKS): rejected for disproportionate cluster cost
  and operational responsibility for this workload.
- Azure Virtual Machines: rejected for OS administration and weak alignment
  with the PaaS preference and low operational overhead.

## Decision

Use **Azure Container Apps as the application compute platform**.

Preserve a conventional Node.js/TypeScript API packaged as an OCI container,
with logical separation of authentication, preferences, PostgreSQL access,
and OpenWeather integration; this does not require microservices.

This selects the platform only. No exact CPU/memory sizing, runtime version,
replica count, workload profile, scaling policy, region, database configuration,
network topology, frontend hosting, Front Door, or other entry point is selected.
ADR-002 through ADR-006 remain unchanged and unaccepted.

## Rationale

The assignment requires the **best overall cost-benefit**, not simply the
lowest compute or infrastructure price. The
[completed reassessment](../ai/03-cost-effectiveness-reassessment.md) separates
documented capabilities, public pricing assumptions, and architectural judgment.

- **Functions Flex has the lowest raw infrastructure cost at the smallest
  evaluated configuration.** This benefit is acknowledged, not dismissed.
- **PostgreSQL HA dominates the fixed backend cost.** The evaluated database
  compute/storage floor is much larger than either small API hosting subtotal,
  so Functions Flex's absolute saving is relatively small at total-backend level.
- **Conventional application architecture:** Container Apps preserves a normal
  Node.js/TypeScript HTTP API without requiring Functions-specific handlers
  throughout the application or function-oriented decomposition.
- **Deployment and recovery:** Immutable container artifacts and revisions,
  startup/readiness-gated releases, traffic splitting, and straightforward
  revision-based rollback provide practical release and incident-response
  benefits. A cold retained revision may still need startup time; rollback
  behavior must be tested.
- **Portability:** The OCI image and conventional API reduce application-level
  Azure lock-in compared with Functions. Azure networking, identities, and
  platform release controls remain provider-specific; portability is not total.
- **Managed HA and private connectivity:** Container Apps supports private
  PostgreSQL connectivity and zone-resilient deployment without requiring
  Kubernetes administration. Final configuration and surviving capacity still
  require implementation validation.
- **Delivery and overhead:** Terraform/CI/CD support and managed orchestration
  meet the delivery/PaaS goals. The team owns container/dependency maintenance,
  probes, configuration, and recovery, but not cluster/node operations.

The modest hosting premium is justified by these operational, deployment, and
portability benefits. No new weighted scores or measured labor savings are
claimed, and no frontend/Front Door assumption is needed for this decision.

### Strongest rejected alternative: Functions Flex Consumption

Functions Flex can satisfy Node.js API hosting, private PostgreSQL, and AZ HA
with the appropriate plan, always-ready instances, and ZRS storage. HTTP-only
workloads are valid uses; lack of an event-driven business feature is not the
reason for rejection.

It was not selected because its small evaluated price advantage does not
outweigh Container Apps' conventional/portable application model and clearer
revision-based release/rollback controls. Flex has no deployment slots or
built-in retained package revisions; recovery redeploys a known-good artifact,
and the reassessment identifies region-dependent rolling-update maturity and
limited deployment-completion visibility. It also adds Functions host/storage
configuration. These are trade-offs, not claims that Flex is incapable of safe
operation.

Reconsider only through a future human-reviewed decision if measured workload,
cost, team skills, or verified Flex release/recovery behavior changes the balance.

## Consequences

- Container Apps is the accepted compute direction; documentation-only scope
  remains in force until implementation/provisioning is explicitly authorized.
- Azure manages hosting/orchestration infrastructure. The team owns application
  dependencies, container/base-image maintenance, registry access, security,
  configuration, probes, releases, migrations, monitoring, and recovery tests.
- The evaluated HA baseline keeps at least two replicas available and does not
  claim scale-to-zero savings. Final capacity is not selected by this ADR.
- Sessions/state must survive replica turnover; a provider SLA is not an
  application availability or release-continuity test.
- PostgreSQL resilience, connection recovery, OpenWeather degradation, safe
  releases, and tested backups remain necessary for end-to-end availability.
- Global dynamic latency still depends on the European origin, database, and
  provider. An edge layer is not selected by this decision.
- Runtime version, capacity/scaling, detailed release procedures, SLO/RTO/RPO,
  and incident ownership remain TBD. Regional DR remains outside current scope.

## Implementation validation items

These are required follow-up checks, not claims that validation has occurred:

- **Runtime sizing:** Measure Node.js CPU/memory, native password-hashing
  behavior, concurrency, latency, and single-survivor capacity; then choose
  resource allocations and scaling limits. Exact CPU/memory is not validated.
- **PostgreSQL pool limits:** Verify per-process pool bounds, aggregate replica
  and release-overlap connections, PgBouncer/driver compatibility, migration
  access, and failover reconnection with safe retry behavior.
- **Availability-zone failure testing:** Confirm region/environment zone
  support, placement, readiness routing, surviving capacity, and end-to-end
  dependency behavior under replica/AZ failure; include database recovery.
- **Deployment/rollback testing:** Verify immutable image retention,
  readiness-gated cutover, traffic splitting, failed-release behavior, known-good
  revision recovery time, and compatible schema migrations.
- Validate private networking/DNS, workload identities/secrets, observability,
  OpenWeather degradation, backups/restores, Terraform ownership, and a complete
  realistic cost model before approving the deployable configuration.

## Security impact

Managed hosting reduces host maintenance, but does not satisfy authentication,
password hashing, per-user authorization, privacy, or abuse controls by itself.
Keep privileged credentials server-side and PostgreSQL non-public.

VNet-based database connectivity is not itself an API ingress restriction. Workload
identity, secret storage, TLS, origin restrictions, DNS, and private operational
access remain subject to [network security](ADR-005-network-security.md).
No Key Vault, Managed Identity, or edge deployment is approved here.

## Cost impact

The [reassessment](../ai/03-cost-effectiveness-reassessment.md#7-pricing-evidence-and-comparable-api-cost)
uses dated Microsoft retail prices and small matched HA evaluation allocations.
Its Sweden Central illustrations give:

- Container Apps API + database partial subtotals of about **$313-$341/month**.
- Functions Flex API + database partial subtotals of about **$281-$323/month**,
  before execution-count and host-storage charges.
- A shared PostgreSQL HA compute/storage subtotal of about **$271/month**.

These are activity sensitivities, not a traffic forecast or full budget.
Functions' approximately **$17-$32/month** advantage before remaining addends
and Container Apps grants is modest relative to that database cost. Larger
allocations/activity can change or reverse the hosting comparison.

The estimate does not approve Sweden Central, database hosting/SKU, CPU/memory,
or spend. Networking/registry, storage, telemetry, egress, backups, release
overlap, CI/migrations, nonproduction, and operational effort must be included
in the final budget; frontend/entry decisions are separate. The reassessment's
West Europe/North Europe database HA deployment restrictions require rechecking.

## References

- [Alternatives and official compute guidance](../architecture/alternatives.md)
- [Initial evaluation, App Service approval, and reopening history](../ai/02-compute-platform-evaluation.md)
- [Completed cost-effectiveness reassessment and human acceptance](../ai/03-cost-effectiveness-reassessment.md)
- [Container Apps reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps)
- [Container Apps revisions and release behavior](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
- [Container Apps VNet networking and managed-resource charges](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks)
- [Functions Flex hosting and billing](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
