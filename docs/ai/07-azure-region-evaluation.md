# Azure region evaluation for ADR-002

- **Date / evidence retrieval:** 2026-10-07.
- **Author / AI tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related ADR:** [ADR-002: Azure region](../adr/ADR-002-azure-region.md).
- **Related requirements:** D-01/D-02, N-02/N-03/N-04/N-05, A-01, S-02;
  assumptions AS-04/AS-05/AS-06/AS-08/AS-10.
- **AI recommendation:** Sweden Central; strongest runner-up France Central.
- **Final human decision:** **Accepted: Sweden Central (`swedencentral`)** as
  the single primary Azure region, by the requesting user on **2026-10-07**;
  see the [human acceptance entry](#human-acceptance-2026-10-07).
  No spending commitment, resource provisioning or implementation is authorized.

## Human acceptance: 2026-10-07

The requesting user explicitly approved the regional decision:

> Human decision: APPROVED.
>
> Accept ADR-002 with Sweden Central as the single primary Azure region.

**Accepted scope:** Sweden Central is the single primary region for the
accepted Container Apps + PostgreSQL cross-AZ HA architecture. The user retained
the current best cost-benefit rationale, France Central as the strongest
fallback, and rejection of North Europe, West Europe and Germany West Central
because of the documented new PostgreSQL zone-redundant HA deployment restriction.
Front Door remains global; no multi-region DR is introduced. Exact capacity,
subscription quota, distinct-AZ allocation and deployment validation remain
implementation checks, not completed tests.

**Follow-up prompt (faithful summary):** Mark ADR-002 Accepted, record the
approval date and approved region, and update this existing AI record rather
than creating another conversation file. Preserve reasoning, research and
sources. Modify only ADR-002 and this record; do not reopen/change other ADRs,
stage or commit. No secrets or personal application data were supplied.

The original investigation's Pending status and no-acceptance instruction were
superseded by this explicit human approval. This acceptance selects the region,
not provisioning, implementation, recurring spend or unvalidated configuration.

## Problem/question and investigation scope

Select the best practical primary European Azure region for the architecture
already accepted: ACA, PostgreSQL Flexible Server with production General
Purpose cross-AZ HA, Front Door Standard with a restricted public ACA origin,
and GitHub Actions/OIDC. Do not reopen ADR-001/003/004/006 or wait for ADR-005.

**Prompt constraints (faithful summary, not a transcript):** Refresh official
Microsoft availability/capacity notices and current retail prices; revisit
Sweden Central, North Europe, West Europe, France Central and Germany West
Central. Add a region only for a serious evidence-backed reason. Compare
accepted services, database HA eligibility/SKU/storage, ACA zonal behavior,
cost, distributed-user latency, resilience and operational risk. Do not assume
Israel-primary users, equate Front Door POPs with origin placement, confuse
app replicas with database HA, substitute same-zone HA, add multi-region DR,
invent a complete bill or mark the ADR Accepted. Preserve previous research.
Write only ADR-002 and this record; do not stage or commit.

No secrets or personal application data were supplied; no redactions were
needed. This concise record documents the conversation's decision evidence,
not the raw chat. The user-requested filename follows the numbered AI records.

### Project context

Read [AGENTS.md](../../AGENTS.md), [Copilot instructions](../../.github/copilot-instructions.md),
[requirements](../requirements.md), [architecture alternatives](../architecture/alternatives.md),
the [ADR workflow](../adr/README.md), ADR-001 through ADR-006, the
[AI convention](README.md), and relevant decision/history, regional, pricing and
acceptance sections of investigations [01](01-requirements-analysis.md),
[02](02-compute-platform-evaluation.md), [03](03-cost-effectiveness-reassessment.md),
[04](04-database-architecture-evaluation.md), [05](05-global-entry-point-evaluation.md)
and [06](06-cicd-strategy-evaluation.md).

Some older indexes/requirements summaries still call now-accepted services
proposed. This investigation uses the accepted ADRs and the user's explicit
current scope; those other files are read-only and were not synchronized.
During the investigation ADR-002 remained Proposed: Under Review is the
repository's reopening status, not the normal initial-review status. The human
approval above subsequently moved it to Accepted.

## Regions evaluated and verified Microsoft findings

The five required candidates were evaluated. **UK South** was added because it
is a mature, unflagged PostgreSQL v5/HA region with GA supporting services and
documented Monitor AZ **service** resilience, a real operational distinction.
Other unflagged regions in the PostgreSQL table were screened, but no evidenced
net advantage justified expanding the full comparison. This is not a claim
that every European region has been fully priced or latency-tested.

### Regional service matrix

Microsoft's official product page contains a public embedded regional data
table (`RegionName`, `OfferingName`, `ProductSkuName`, `CurrentState`). Its
filtered rows confirm **GA** ACA, Flexible Server, Container Registry, Key
Vault, Azure Monitor including Application Insights/Log Analytics, Virtual
Network, Private Link, Private DNS zones and Standard Load Balancer in **all
six** candidates. Feature-specific documentation below takes precedence over
the broad GA product badge. [S1]

| Capability / constraint | Sweden Central | France Central | UK South | North Europe | Germany West Central | West Europe |
| --- | --- | --- | --- | --- | --- | --- |
| Availability Zones [S2] | 3 | 3 | 3 | 3 | 3 | 3 |
| ACA GA + zone-redundant environment [S1/S3] | Yes | Yes | Yes | Yes | Yes | Yes |
| PostgreSQL Flexible Server, Intel v5 [S4/S5] | Yes | Yes | Yes | Yes | Yes | Yes |
| **New PostgreSQL cross-AZ HA** [S4] | **Supported, unflagged** | **Supported, unflagged** | **Supported, unflagged** | **Temporarily blocked** | **Temporarily blocked** | **Temporarily blocked** |
| Premium SSD v2 with HA [S6] | Yes | Yes | Yes | Feature supported; new HA blocked | Feature supported; new HA blocked | Feature supported; new HA blocked |
| ACR / VNet / Private DNS / Private Link / Key Vault / Monitor [S1] | GA | GA | GA | GA | GA | GA |
| Monitor shared-workspace AZ data resilience [S10] | Yes | Yes | Yes | Yes | Not listed | Not listed |
| Monitor AZ service resilience [S10] | Not listed | Not listed | Yes | Yes | Not listed | Not listed |

### PostgreSQL: the decisive constraint

- Re-fetched the **current** PostgreSQL overview table. The `$` symbol marks
  **North Europe, West Europe and Germany West Central**; its explicit legend
  says new zone-redundant HA deployments are temporarily blocked. Already
  provisioned HA servers remain supported. This new project has none. [S4]
- The page also includes a broader "$ New server deployments" sentence.
  Do not infer that every non-HA deployment is available; at minimum the new
  zonal-HA block is explicit. Generic GA badges/pricing do not remove it.
- Sweden Central, France Central and UK South list zone-redundant HA without
  the restriction marker and Intel v3/v4/v5 compute. The compute documentation
  lists D2ds_v5 at **2 vCores/8 GiB**; current whole-SKU retail meters exist in
  each region. This supports ADR-003's baseline, not a subscription allocation
  guarantee. General Purpose supports HA; Burstable does not. [S4/S5/S7/S13]
- Matching primary and standby run in different AZs and both are billed.
  Database replication between AZs has no separate replication charge. A
  same-zone-first deployment awaiting future capacity is **not compliant yet**
  and must not be accepted as production AZ resilience. [S7]
- Premium SSD v2's feature-region list explicitly includes all six regions
  with HA support, subject to the region's new-HA restrictions. Sweden/France
  currently lack SSD v2 geo-redundant backups; no regional DR is required.
  In-region backups/PITR remain required. No autogrow, Burstable support or
  PostgreSQL 13 support on v2; disk hydration can temporarily delay restoring
  a standby after failover. These are shared storage trade-offs, not a reason
  to reopen the accepted database architecture. [S6]

### Container Apps and supporting dependencies

- Zone redundancy is available where **both ACA and AZs are supported**, for
  Consumption and Dedicated workload profiles. Enable it at environment
  creation; it cannot be toggled later. A custom VNet/subnet is required.
  Workload-profile environments require at least /27; legacy Consumption-only
  environments require /23. Subnet sizing/ownership remain ADR-005 work. [S3/S8]
- Set **minimum replicas >= 2** to distribute app replicas across zones.
  The platform controls placement; two replicas do not mean one in every
  zone, guaranteed spare throughput or uninterrupted in-flight requests.
  Higher minima may be needed after peak/survivor testing. Do not use
  scale-to-zero assumptions for this production baseline. [S3]
- ACA zone redundancy has no separate feature premium; ordinary replica,
  request and managed-network-resource charges apply. Revisions, readiness,
  rollout overlap and Jobs for private migrations introduce no required
  region-specific substitute in the shortlist. [S3/S8/S9]
- A VNet-integrated external ACA environment can expose the restricted public
  origin while reaching a separate private database subnet. Flexible Server
  VNet integration requires a same-region VNet, delegated database subnet and
  private DNS. Keep HA/Storage/Entra dependencies reachable. Alternatively
  Private Link is regionally available; this record does not select an endpoint
  mode, routes, NAT or enforcement mechanisms for ADR-005. [S1/S8/S11]
- ACR now provides automatic AZ resilience across **Basic/Standard/Premium** in
  AZ regions; the older `zoneRedundancy` property may still appear false.
  Premium may be required for independently selected security features, not
  merely for AZ resilience. Key Vault Standard/Premium is automatically
  zone-redundant in these regions. [S12/S14]
- Workspace-based Application Insights can use workspace AZ protection.
  Sweden/France protect shared-workspace **data**, but their Monitor ingestion,
  query and alert **service** resilience is not promised by the current table.
  Germany/West Europe require dedicated clusters for documented AZ data
  protection (minimum 100 GB/day commitment), disproportionate here. Keep
  telemetry nonblocking; acknowledge incident-time monitoring gaps. [S10]
- No required v6 preview SKU, Arc preview, Dedicated/GPU profile, Premium Front
  Door private origin or new regional gateway is needed. ACR image pulls,
  Entra/OIDC token services and outbound OpenWeather connectivity still need
  operational tests; a supported region does not eliminate those dependencies.

## Pricing evidence

**Fresh retrieval:** 2026-10-07, Microsoft Retail Prices API / Azure pricing
tool; USD PAYG, 730 hours/month, no reservation, taxes, negotiated discounts or
credits. Effective meter start dates can be older than retrieval. [S13]

Database baseline: **two Standard_D2ds_v5 servers + 32 GiB Premium SSD v2
per server**, included I/O only. Formula:
`2 * 730 * whole-server hourly rate + 64 * GiB-month storage rate`.
The two-vCore whole-SKU meter is not a per-vCore price; do not double it again
or add a duplicate per-core meter.

| Region | D2ds_v5 USD/server-hour | SSD v2 USD/GiB-month | HA compute | HA storage | Database subtotal/month |
| --- | --- | --- | --- | --- | --- |
| Sweden Central | 0.187 | 0.1369 | 273.02 | 8.76 | **281.78** |
| France Central | 0.206 | 0.133 | 300.76 | 8.51 | **309.27** |
| UK South | 0.206 | 0.133 | 300.76 | 8.51 | **309.27** |
| North Europe | 0.198 | 0.1265 | 289.08 | 8.10 | 297.18, hypothetical |
| Germany West Central | 0.212 | 0.137 | 309.52 | 8.77 | 318.29, hypothetical |
| West Europe | 0.212 | 0.1369 | 309.52 | 8.76 | 318.28, hypothetical |

**ACA Consumption meters** (per allocated CPU/memory second; requests per
million), before subscription-wide free grants:

| Regions | Active vCPU-second | Idle vCPU-second | Active/idle GiB-second | Requests/million |
| --- | --- | --- | --- | --- |
| Sweden Central, France Central, North Europe, Germany West Central | 0.000024 | 0.000003 | 0.000003 | 0.40 |
| West Europe | 0.000034 | 0.000004 | 0.000004 | 0.56 |
| UK South | 0.000034 | 0.000004 | 0.000004 | 0.40 |

ACA allocation/activity is unvalidated. At the earlier illustrative two
0.25-vCPU/0.5-GiB replicas, Sweden and France have equal compute cost; UK
South's premium is roughly $3.94/month if eligible for idle pricing throughout,
or $15.77/month if active throughout, before grants/requests. This sensitivity
is not a workload forecast or approval of that size. [S9/S13]

**Other regional cost findings:** ACR Basic is **$0.1666/day** (about $5.07/month
at 730 hours) across all six. Common ACA external VNet managed resources are
one Standard LB and two Standard IPv4 public IPs: the retrieved LB rule meter
is **Global $0.025/hour**, and IPs are **$0.005/IP-hour** in every candidate.
Conditional fixed illustration: $25.55/month, before processed data/traffic.
No selected topology is implied. Same-region application/database/registry
placement avoids introducing cross-region transfer as an architectural
requirement. Optional endpoints/NAT, backup/WAL, telemetry ingestion/retention,
secrets, egress and network data processing depend on usage/topology; no
measured volume establishes a meaningful offsetting regional advantage here.
Front Door's global base/request/geographic transfer charges are separate,
not a Swedish regional discount. [S8/S13/S15]

### Reproducible retail evidence

Use [the Retail Prices API][retail], USD and `priceType eq 'Consumption'`,
following `NextPageLink`, with candidate `armRegionName` values. Filters:

- Database compute: `serviceName eq 'Azure Database for PostgreSQL' and
  armSkuName eq 'Standard_D2ds_v5'`.
- Storage: `contains(productName, 'Flex Server Storage') and meterName eq
  'Premium SSD v2 Storage Data Stored'`. Filtering the product on "Flexible
  Server" misses these storage meters; an initial mismatched query returned
  no items and was corrected.
- ACA: `serviceName eq 'Azure Container Apps' and skuName eq 'Standard'`;
  select the five CPU/memory/request meters above, excluding GPU meters.
- Registry: `serviceName eq 'Container Registry' and meterName eq
  'Basic Registry Unit'`; network: Standard IPv4 Static Public IP and Standard
  Included LB Rules and Outbound Rules. Do not count free-tier duplicates.

| Region | D2ds_v5 compute meter ID | Premium SSD v2 storage meter ID |
| --- | --- | --- |
| Sweden Central | e1994966-86d8-5fdd-b2fe-476405cbb29e | 8ece4b7f-0dc7-51ca-a65c-c5c0c89c5bfe |
| France Central | db93c69a-c4c1-59ac-9b74-0bf5ffd0f8c9 | 3ceff297-7e79-5c8a-9050-e5bb7f4743c9 |
| UK South | 20391f36-c42f-5b42-a27e-b4e79d9e9bff | 53c5d622-eaa0-5cfd-a0f2-d636671f4ce5 |
| North Europe | 801804bb-b5b3-5cbf-ae00-e470e2a65f86 | ca3f4ac6-1ea8-560f-b38b-6ef00d8397b9 |
| Germany West Central | 863cc209-9369-5ba0-87f8-8f31d620b00f | 4a1debf0-af99-551b-b0a6-3552ba581a86 |
| West Europe | ea089c83-8390-5aa1-ba63-de098e2b8475 | 50d9a511-fb6e-5113-8003-5a1ef7abca11 |

Sweden ACA active CPU/memory exemplars:
`4ea1c35d-d999-57d0-88f2-e689d3475fcd` /
`05396e31-2622-5cc8-9bb4-06d0ac9c6047`.
Shared ACR Basic / LB / public IP meters:
`5c9e7a65-5784-494c-9718-7749d4075dd9` /
`27827eb0-7f60-4928-940b-f5fe15e7a4cb` /
`9c150bf9-2bad-430e-a53c-c213804f49ef`.

## Latency, privacy and operational judgment

Sweden Central is in Gavle; France Central in Paris; Germany West Central in
Frankfurt; North Europe in Ireland; West Europe in the Netherlands; UK South
in London. [S2] Paris/Frankfurt/Netherlands may be better origin positions for
some western/central European networks; Sweden may suit northern Europe.
These are geographic observations, **not RTT benchmarks**. Routing, last-mile,
workload and OpenWeather latency can dominate; no universal winner is proven.

Front Door terminates connections near users and uses Microsoft's network/
connection reuse to the origin. This can reduce the significance of internet
transport differences, but **uncached dynamic requests still reach the chosen
origin/database**. POP location does not select the origin region. Authenticated
API caching must remain restricted as accepted in ADR-004. No users are assumed
to be primarily in Israel and no global latency or numeric delta is claimed.
For this small application, the differences are not demonstrated to be material;
measure representative user journeys before declaring N-03 satisfied. [S15]

All candidates are European; UK South is not EU, but EU-only hosting is not an
explicit requirement. Swedish/European hosting alone proves neither GDPR
compliance nor Europe-only processing: review backups, logs, Key Vault's
service-managed paired-region replication, global Front Door TLS termination,
GitHub/artifacts and external-provider disclosures. Region choice provides no
exemption from private DB/TLS/least privilege/origin enforcement.

## Ranked comparison and recommendation

| Rank | Region | Outcome / principal trade-off |
| --- | --- | --- |
| **1** | **Sweden Central** | Select: fully documented accepted request-path architecture; lowest qualifying DB cost; no published new-HA block; ordinary GA dependencies |
| **2** | **France Central** | Strongest runner-up: qualifying same architecture, identical ACA rates, more western/central placement; DB costs $27.49/month more |
| **3** | **UK South** | Qualifying mature option with better documented Monitor service resilience; same DB price as France but higher ACA compute rates; no measured latency need favors it |
| 4 | North Europe | Reject now: new PostgreSQL cross-AZ HA blocked despite lower price than France and Monitor service resilience |
| 5 | Germany West Central | Reject now: same HA block; central placement cannot compensate for architecture ineligibility |
| 6 | West Europe | Reject now: same HA block and higher ACA rates |

**Best total cost-benefit:** Sweden does not win by tiny storage differences or
an invented all-in bill. It preserves the mandatory production HA/security
architecture with no required service substitution, while saving **$27.49/month
(8.9% of the database subtotal)** against France on the dominant fixed cost.
No measured latency/residency disadvantage or shared-service pricing offset
justifies that premium today. Monitor's data-versus-service-resilience limitation
is real and explicit, not hidden; telemetry must not be a request dependency.

## Acceptance readiness, risks and verification limits

1. **ADR-002 selects Sweden Central**, accepted by the requesting user on
   **2026-10-07**.
2. **France Central is the strongest fallback**, not a second DR region.
3. **Yes, Sweden fully supports accepted ACA + PostgreSQL cross-AZ HA at
   documented capability level.** It is not a tested deployment or reserved
   SKU/zone allocation.
4. **North Europe, West Europe and Germany West Central are rejected due to
   current new PostgreSQL zonal-HA restrictions.** UK South is not blocked;
   it loses on current cost-benefit, not on unsupported services.
5. **No genuine documented blocker prevented architectural acceptance.**
   ADR-005's concurrent work need not finish first. Its controls and the checks
   below remain delivery/provisioning gates, not reasons for endless region
   research. Human architectural approval is recorded above; implementation
   and spending authorization remain separate.

Before provisioning, recheck the dated restriction table and subscription-specific
[Capabilities By Location][capabilities], quota, D2ds_v5/storage/HA combinations
and actual **different-AZ** allocation. Never treat same-zone-first fallback as
compliant while waiting. If allocation fails, surface it and human-review the
runner-up rather than weaken HA.

No tenant/resource inspection, quota reservation, deployment, Terraform plan,
latency/load test, ACA zone-placement test, PostgreSQL failover/pool/restore
test or legal compliance validation occurred. Microsoft documentation and
public pricing were checked, database arithmetic verified, and supporting
products checked against the embedded official GA matrix. Broad web-search
summaries that merely said "HA supported" were not used to override the explicit
restriction legend. Stale/404 documentation paths were replaced by working
canonical Microsoft pages. No software tooling or resources were installed.

Original investigation checks: local Markdown link targets and Pending approval
wording passed; scoped Git diffs had no whitespace diagnostics. Final Git status/diff
inspection showed this session's writes limited to ADR-002 and this new record.
Concurrent ADR-005/network investigation changes were left untouched. Nothing
was staged or committed.

Remaining implementation risks: surviving app capacity, database reconnection/
safe retries, Premium SSD v2 growth/hydration, readiness/release overlap, registry
pulls, private CI/migrations, OIDC/Entra permissions, telemetry incident gaps,
privacy/retention and measured user latency. A numeric SLO or strict processing
boundary introduced later could change the trade-offs; none is silently invented.

## Official sources

All sources consulted on 2026-10-07; public documentation is not live capacity.

- **S1:** [Product availability by region](https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table).
- **S2:** [Azure regions, locations and AZ counts](https://learn.microsoft.com/en-us/azure/reliability/regions-list).
- **S3:** [Container Apps reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps).
- **S4:** [PostgreSQL region table and restriction legend](https://learn.microsoft.com/en-us/azure/postgresql/overview#azure-regions).
- **S5:** [PostgreSQL compute options](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute).
- **S6:** [Premium SSD v2 features, regions and limitations](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-storage-premium-ssd-v2).
- **S7:** [PostgreSQL reliability and HA billing](https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql).
- **S8:** [ACA VNet/subnets and managed-resource charges](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks).
- **S9:** [ACA billing and idle/free-grant conditions](https://learn.microsoft.com/en-us/azure/container-apps/billing).
- **S10:** [Azure Monitor AZ support, data versus service resilience](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/availability-zones).
- **S11:** [PostgreSQL private VNet access and DNS](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private).
- **S12:** [ACR automatic zone resilience and tier behavior](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-registry).
- **S13:** [Retail Prices API][retail], [API documentation](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices),
  [PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/),
  [ACA pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/).
- **S14:** [Key Vault reliability and service-managed replication](https://learn.microsoft.com/en-us/azure/reliability/reliability-key-vault).
- **S15:** [Front Door overview/transport behavior](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-overview);
  accepted limitations and costs in [ADR-004](../adr/ADR-004-global-entry-point.md).
- **Pre-provisioning:** [PostgreSQL subscription-specific capabilities][capabilities].

[retail]: https://prices.azure.com/api/retail/prices
[capabilities]: https://learn.microsoft.com/en-us/rest/api/postgresql/capabilities-by-location/list
