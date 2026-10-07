# ADR-002: Azure region and regional strategy

## Status

**Accepted: Sweden Central (`swedencentral`)**.

- Human decision owner: Requesting user.
- Final human decision: **Accepted**.
- Approval date: **2026-10-07**.
- Approval reference: Explicit instruction, "Accept ADR-002 with Sweden Central
  as the single primary Azure region," recorded in the
  [region evaluation's human acceptance entry](../ai/07-azure-region-evaluation.md#human-acceptance-2026-10-07).
- Investigation completed: 2026-10-07; see the
  [region evaluation](../ai/07-azure-region-evaluation.md).
- Accepted scope: **Sweden Central**, one primary region; no multi-region DR.
- This architecture acceptance does not authorize provisioning,
  implementation or recurring spend, or validate actual capacity/quota.

## Context

A European Azure region is required for a small public weather application
serving geographically distributed users. No primary user country or measured
latency target is specified. Current scope is application-instance and
Availability Zone resilience within one primary region, not regional DR.

Accepted architecture is Azure Container Apps (ADR-001), PostgreSQL Flexible
Server General Purpose with production zone-redundant HA (ADR-003), Front Door
Standard with a restricted public ACA origin (ADR-004), and GitHub Actions with
OIDC (ADR-006). Region selection must support that architecture without
reopening it. ADR-005 is concurrent and need not be completed to select a region.
Exact topology and enforcement remain its responsibility.

## Requirements

[Requirements](../requirements.md): D-01/D-02, N-02/N-03/N-05, S-02, A-01;
human-confirmed assumptions AS-04/AS-05/AS-06/AS-08/AS-10.

## Options considered

Current Microsoft documentation and USD retail prices were refreshed on
2026-10-07, rather than assuming earlier restrictions remained correct.

| Rank | Region | New PostgreSQL zone-redundant HA | Database baseline USD/month | Assessment |
| --- | --- | --- | --- | --- |
| 1 | **Sweden Central** | Supported; no current restriction flag | **281.78** | Selected: qualifying architecture, lowest database cost in this comparison |
| 2 | **France Central** | Supported; no current restriction flag | **309.27** | Strongest fallback: same ACA rates, more western/central European origin positioning |
| 3 | UK South | Supported; no current restriction flag | 309.27 | Credible extra candidate; better documented Monitor service resilience, higher ACA rates |
| 4 | North Europe | **New zone-redundant HA temporarily blocked** | 297.18, hypothetical | Ineligible for a new compliant production deployment today |
| 5 | Germany West Central | **New zone-redundant HA temporarily blocked** | 318.29, hypothetical | Ineligible despite otherwise suitable central-European placement |
| 6 | West Europe | **New zone-redundant HA temporarily blocked** | 318.28, hypothetical | Ineligible; also higher ACA Consumption rates |

Ranks 4-6 order rejected alternatives, not currently deployable fallbacks.
All six regions have three AZs and GA availability for the required regional
services. Generic service availability does not override the PostgreSQL
feature-specific restriction.

## Decision

Use **Sweden Central (`swedencentral`)** as the single primary
European region. Co-locate Container Apps, PostgreSQL, ACR, and appropriate
regional secrets/telemetry resources there. Front Door remains global.

Production must retain:

- A VNet-integrated ACA environment with zone redundancy enabled **at creation**,
  and at least two app replicas; validate surviving capacity and readiness.
- PostgreSQL General Purpose primary and matching standby in **different AZs**.
  Retain ADR-003's D2ds_v5 sizing baseline and its D2s_v3 fallback, subject to
  load validation; never silently accept same-zone HA.
- Private PostgreSQL access/DNS, validated TLS, pooling and workload identity
  as accepted in ADR-003, with detailed networking/security under ADR-005.
- Backups/PITR and tested recovery, independently of zonal HA.

Development may use ADR-003's cheaper Burstable/no-HA configuration in the same
region. This does not weaken production requirements. No secondary application
region or multi-region DR is introduced.

## Rationale

- **Documented architecture fit:** Sweden Central supports ACA and zonal
  environments, PostgreSQL v5 compute and new cross-AZ HA, Premium SSD v2 HA,
  ACR, VNet/private connectivity/DNS, Azure Monitor/Application Insights and
  Key Vault. No required regional component needs a preview-only substitute.
- **Best practical cost-benefit:** PostgreSQL is the dominant fixed cost. The
  refreshed baseline saves about **$27.49/month (8.9%)** versus France Central
  without removing HA or adding operational exceptions. ACA rates are equal
  between these two, and ACR/common network meters offer no offsetting regional
  advantage. This is a modest recurring saving, not an all-in budget.
- **Operational risk:** Sweden Central and France Central have no current
  published new-HA block. Reject the three flagged regions rather than rely on
  undocumented capacity exceptions or an eventually zonal same-zone deployment.
- **Latency is a trade-off, not a proven Swedish advantage:** France/Frankfurt/
  Netherlands origins may better suit some western/central European users;
  Sweden is more northerly. User distribution and measurements are absent.
  Front Door improves the edge/transport leg but uncached API/database work
  still reaches Europe. There is no evidence that this application's regional
  latency differences outweigh Sweden's supported lower-cost configuration.
- **Monitoring caveat:** Sweden and France have default shared-workspace AZ
  data resilience, but Microsoft's Monitor table does not promise AZ service
  resilience for ingestion/query/alerts there. UK South does. Keep telemetry
  off the synchronous request path and acknowledge possible incident-time gaps;
  this does not prevent the accepted ACA/PostgreSQL request path being zonal.

## Consequences

- Fully supports the accepted compute/database HA architecture **at documented
  capability level**, not as an already allocated or tested deployment.
- Actual subscription capabilities, quotas and two-AZ allocation remain
  pre-provisioning checks; public pricing is not a capacity reservation.
- Two ACA replicas are not PostgreSQL HA and do not guarantee adequate survivor
  throughput. Platform-managed zone placement, dependency reconnection, release
  overlap, image pulls, failover and restore still need tests.
- Human approval resolves region selection without a documented technical
  blocker. ADR-005 can proceed independently; its security controls
  and the implementation checks remain prerequisites to delivery.
- A future restriction or demonstrated latency/residency requirement may require
  a new human-reviewed decision; France Central is the first alternative to
  revalidate, not an automatically provisioned second region.

## Security impact

Sweden is a European/EU origin, not proof of legal compliance or Europe-only
processing. Review primary data, backup/PITR, logs, registry artifacts, Key Vault
service replication, global Front Door TLS termination and OpenWeather/GitHub
flows. No France-specific, Germany-specific, or Israel-primary residency/user
requirement exists in the baseline.

Required private connectivity is supported; region selection does not approve
ADR-005's origin restrictions, subnet/routes, secret store or administrative/
migration access. Key Vault and ACR provide automatic AZ resilience in these
AZ-enabled regions. Premium SSD v2 currently lacks geo-redundant backups in
Sweden and France; regional DR is not required, and this does not remove PITR
or the cross-AZ standby.

## Cost impact

USD PAYG, retrieved 2026-10-07; 730 hours/month, two D2ds_v5 servers,
32 GiB Premium SSD v2 each, included baseline I/O:

`2 * 730 * $0.187 + 2 * 32 * $0.1369 = $281.78/month`.

Both primary and standby are billed. This is **database compute/storage only**,
excluding backups above allowance, logs, network usage, edge, secrets,
nonproduction and tests. ACR Basic's illustrative rate is $0.1666/day in all
six regions; tier selection remains separate. ACA active CPU/memory rates in
Sweden and France are $0.000024/vCPU-second and $0.000003/GiB-second.
The [investigation](../ai/07-azure-region-evaluation.md#pricing-evidence)
records exact regional rates, meter identities and exclusions. No complete
monthly application bill or recurring spend is approved.

## Decision history

The original Proposed placeholder left the exact European region and
data-residency boundaries open, and listed both single-region and separately
justified primary/secondary strategies. The current human-confirmed AS-04/AS-05
scope narrows this investigation to one primary region and instance/AZ
resilience; the earlier secondary-region option is historical, not selected.
Earlier AI research identified Sweden as promising and recorded database
restrictions; that research remains unchanged. This investigation rechecked
the actual Microsoft tables and prices before making the recommendation.

On **2026-10-07**, the requesting user explicitly approved Sweden Central as
the single primary Azure region and directed that ADR-002 be marked Accepted.
The [human acceptance entry](../ai/07-azure-region-evaluation.md#human-acceptance-2026-10-07)
preserves that instruction and its scope. France Central remains the strongest
fallback to revalidate; no other ADR is reopened or modified.

## References

- [Requirements and open questions](../requirements.md)
- [Compute](ADR-001-compute-platform.md), [database](ADR-003-database.md), and [entry point](ADR-004-global-entry-point.md)
- [Delivery](ADR-006-cicd-strategy.md) and [network security](ADR-005-network-security.md)
- [Region investigation, pricing ledger and official sources](../ai/07-azure-region-evaluation.md)
- [PostgreSQL regional table and restriction legend](https://learn.microsoft.com/en-us/azure/postgresql/overview#azure-regions)
- [Container Apps reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps)
- [Azure product availability](https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table)
- [Azure regions and AZ counts](https://learn.microsoft.com/en-us/azure/reliability/regions-list)
