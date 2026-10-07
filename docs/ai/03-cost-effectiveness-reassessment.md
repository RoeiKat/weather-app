# Cost-effectiveness reassessment: Container Apps versus Functions Flex

## AI record and decision status

- **Date / evidence retrieval:** 2026-10-07.
- **Author / tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user; approval authority as recorded in ADR-001.
- **Related requirements:** F-01 through F-04, N-02/N-05, S-01/S-02, A-01/A-02, D-01 through D-03, and assumptions AS-04 through AS-10.
- **Related records:** [requirements](../requirements.md), [alternatives](../architecture/alternatives.md), [ADR-001](../adr/ADR-001-compute-platform.md), and [region ADR](../adr/ADR-002-azure-region.md).
- **Problem:** Compare the two remaining compute candidates without treating the previous ranking as approval; investigate a cheaper first-party PostgreSQL architecture without weakening instance/AZ HA.
- **Prompt (faithful summary):** Assume a Node.js/TypeScript API providing authentication, saved PostgreSQL preferences, and server-side OpenWeather integration. Compare Container Apps and Functions Flex Consumption on total cost-effectiveness, instance/AZ HA, operations, PostgreSQL connections, deployment/rollback, security/private networking, Terraform/CI/CD, and Azure lock-in. Investigate first-party serverless/scale-to-zero PostgreSQL; otherwise identify the cheapest qualifying Flexible Server configuration. Do not assume frontend hosting or Front Door. Save this investigation, leave ADR-001 unchanged, and record the human decision as pending. No sensitive information was included.
- **AI recommendation:** Prefer Container Apps for the balance of release safety, portability, and modest ongoing hosting cost. Functions Flex is the lower-price alternative at the smallest allocation and can be preferable if its regional rolling-update behavior, runtime fit, and recovery procedure are verified.
- **What was verified:** Current Microsoft documentation and public retail price meters were retrieved; pricing calculations were checked locally. Specific source URLs, meter identifiers, assumptions, and unresolved evidence are below.
- **What was accepted/rejected:** The requesting user accepted Azure Container Apps as the application compute platform on 2026-10-07 after this reassessment. Azure Functions Flex Consumption is the strongest rejected alternative despite its lowest raw infrastructure cost at the smallest evaluated configuration. Database/region/configuration selection, recurring spend, provisioning, implementation, and changes to ADR-002 through ADR-006 remain unauthorized.
- **Final human decision:** **Accepted: Azure Container Apps**, by the requesting user on 2026-10-07. ADR-001 was closed as Accepted at the user's explicit direction; see the approval record below.

### Human acceptance: 2026-10-07

The requesting user explicitly authorized closing the reopened ADR-001 in place
and selecting the application compute platform after the completed reassessment:

> Azure Container Apps is the selected application compute platform.

The user's approval rationale acknowledges that Functions Flex has the lowest
raw infrastructure cost at the smallest evaluated configuration, but N-05
requires overall cost-benefit. PostgreSQL HA dominates fixed backend cost, so
the absolute saving is relatively small. Container Apps' conventional
Node.js/TypeScript API, immutable OCI deployment, revisions, readiness-gated
releases, traffic splitting, straightforward rollback, reduced application-level
Azure lock-in, private PostgreSQL networking, and managed zone-resilient hosting
justify its modest premium without requiring Kubernetes administration.

**Accepted scope:** Compute platform only. Exact CPU/memory and runtime sizing,
PostgreSQL pool limits, AZ failure behavior, and deployment/rollback behavior
remain implementation validation items, not verified results. No exact region,
database hosting/configuration, frontend, Front Door, network topology, or
delivery provider is selected. ADR-002 through ADR-006 are unchanged. No
application code, Terraform, executable pipeline, provisioning, or recurring
spend was authorized. The original investigation prompt above is historical;
its instruction to leave ADR-001 unchanged applied before this acceptance.

## 1. Scope and evidence conventions

**Verified capability** means Microsoft documents the feature or constraint.
It does not mean this application has been deployed or tested.
**Pricing assumption** means an illustrative workload, topology, or billing
choice, not a selected configuration. **Architectural judgment** means a
recommendation based on those facts, not a measured workload result.

The application is a single Node.js/TypeScript HTTP API for this comparison.
No web framework, identity provider, hashing parameters, ORM, session model,
traffic forecast, SLO, RTO, or RPO is selected. TypeScript is built to JavaScript.
There is no demonstrated need for microservices, separate function apps per
route, Dapr, or Kubernetes administration.

Preserve the confirmed scope: one European primary region, resilience to
instance and AZ failures, public application access, private PostgreSQL, and
graceful OpenWeather degradation. Regional DR is not required. Database
failover interrupts connections; backups and tested recovery remain necessary.
A provider SLA is not proof of end-to-end application HA.

**Frontend hosting, Front Door, CDN, WAF/edge selection, and their costs are
outside this investigation.** Public API ingress is evaluated only as a
possible baseline; no origin/entry topology is approved.

## 2. Verified compute capabilities and comparison

| Dimension | Azure Container Apps | Azure Functions Flex Consumption |
| --- | --- | --- |
| Node.js/TypeScript fit | Runs a Linux container with an ordinary Node HTTP server and the chosen compatible framework. No function-oriented decomposition is needed. | Supports Node.js 22 and 24 in the current Flex hosting documentation. HTTP handlers use the Functions programming model; TypeScript is supported through the build workflow. An HTTP-only workload is a valid use, not a reason to reject Functions. |
| Smallest HA evaluation baseline | Consumption workload profile in a zone-redundant VNet-injected environment, with minimum two replicas. Smallest supported allocation: 0.25 vCPU/0.5 GiB per replica. | Zone-redundant Flex plan, ZRS host/deployment storage, and two always-ready instances for the HTTP scaling group. Smallest supported instance size: 512 MB, with typical 0.25-core allocation. |
| AZ behavior | Platform schedules replicas across zones; Microsoft recommends minimum two to ensure distribution across multiple AZs. Zone redundancy must be enabled when the environment is created. | Always-ready instances are distributed across at least two zones. The platform maintains and bills at least two per scaling group when zone redundancy is enabled. On-demand placement is best effort. |
| Scale-to-zero | Supported generally, but not part of the continuously available two-replica HA baseline. | Supported without always-ready capacity generally, but not for this zone-redundant HA baseline. Setting always-ready to zero does not establish a zero-cost HA configuration. |
| Application operations | Team owns Node dependencies, container build/base-image updates, image scanning, probes, scaling, and registry permissions. Azure owns orchestration and infrastructure. | Avoids a container/base-image pipeline. Team owns Node dependencies, Functions SDK/runtime compatibility, host/deployment storage, concurrency, scaling, and release configuration. Azure owns hosting infrastructure. |
| PostgreSQL access | VNet-injected environment can reach private PostgreSQL while the API has public ingress. | Outbound VNet integration reaches private PostgreSQL while public HTTP ingress remains possible. |
| Deployment | Immutable revisions, startup/readiness checks, single-revision readiness-gated cutover, and multiple-revision traffic splitting. | Package deployed to Blob Storage. Default Recreate restarts instances and can interrupt availability. RollingUpdate is opt-in; current documentation has inconsistent preview/GA language, discussed below. |
| Rollback | Retained image and revision can be reactivated; route traffic to a known-good ready revision. Inactive revisions need time to start unless kept warm. | No deployment slots or built-in retained code revision history. Recovery redeploys a retained known-good package/configuration through CI/CD. |
| Terraform/CI/CD | Azure resource APIs are compatible with AzureRM/AzAPI; Microsoft documents GitHub Actions image builds and revision deployment. | Microsoft provides an AzureRM Flex Terraform quickstart and OIDC-based GitHub Actions deployment guidance. Exact HA, always-ready, VNet, and rolling-update property coverage requires checking the pinned provider. |
| Azure lock-in | Azure environment, identities, networking, and revision controls are Azure-specific; Node server, PostgreSQL queries, and OCI image are comparatively portable. | Functions handlers, host configuration, scaling model, and deployment/storage conventions are Azure-specific. Keep domain logic, PostgreSQL access, and provider integration outside thin Functions adapters to reduce migration cost. |

Sources: [Container Apps reliability][aca-ha], [container allocations][aca-containers],
[revisions][aca-revisions], [Functions reliability][functions-ha],
[Flex hosting][flex], [Functions HTTP concurrency][functions-concurrency],
[Flex Terraform][functions-terraform], [Functions delivery][functions-ci],
and [Container Apps delivery][aca-ci].

### HA qualification

Two instances/replicas are a platform minimum, not a validated capacity target.
One surviving instance must meet the required service level during a zone
outage, or more capacity is needed before failure. Do not assume instantaneous
replacement, successful emergency scale-out, or control-plane availability
during an AZ incident.

Both designs need externally durable state, portable sessions, bounded provider
timeouts, readiness checks where supported, database reconnection, and explicit
sanitized errors. An OpenWeather outage must not make login and preferences
unavailable unnecessarily. Public caching of account-specific responses is
outside the acceptable privacy boundary.

### Current Functions release-documentation inconsistency

The [Flex hosting overview][flex] says rolling zero-downtime deployment is in
public preview. The newer [site-update strategy article][functions-updates]
explicitly refers to regions where rolling updates are generally available
and regions where rollout is still occurring. Therefore:

- It is not justified to label all regions either GA or preview.
- Confirm the chosen region's current support status before approval.
- Default Recreate is not an acceptable zero-downtime release assumption.
- RollingUpdate drains/replaces batches; Azure controls batch parameters.
  Scale-out is not guaranteed to complete before the next drain interval.
- The article documents no built-in completion signal or real-time progress.
  Its log-query estimates should not be relied on for production automation.
- Code and configuration updates can overlap, and old/new versions coexist.
  Backward-compatible migrations and external acceptance checks are needed.

Container Apps provides a clearer ready-revision cutover and traffic rollback
model. This is an operational benefit, not a claim that Functions cannot be
released safely.

Microsoft's [Flex recovery guidance][functions-rollback] explicitly documents
the lack of retained package revisions and slots. Preserve the exact built
artifact for recovery rather than depending on a fresh build reproducing an
old release.

## 3. PostgreSQL connection handling

**Verified:** Flexible Server includes managed PgBouncer on General Purpose and
Memory Optimized tiers, including private networking, using the database
hostname on port 6432. It restarts on the promoted primary during failover.
Current documentation describes optional enablement and also says enabled by
default; explicitly manage/verify `pgbouncer.enabled` rather than relying on an
implicit default. It is a process on the database host, not another independently
managed pooler tier. See [PgBouncer][pgbouncer].

**Design judgment for both candidates:**

- Reuse a bounded process-local PostgreSQL pool, for example with a maintained
  Node PostgreSQL driver. Do not open a new pool per request/invocation.
- Release checked-out connections reliably. Set connect/acquire/query
  timeouts, observe pool wait time, and handle idle-client errors explicitly.
- Do not hold a database transaction or checked-out connection while waiting
  on OpenWeather or doing unrelated password-hash work.
- Test ORM/prepared-statement/session-state behavior with transaction pooling.
  Features that require session affinity need compatible configuration or a
  dedicated direct connection. Migrations may require direct port 5432 access.
- Reconnect after database failover and retry only safe/idempotent operations.
  A disconnected commit can have an unknown outcome; blindly retrying writes
  can duplicate operations.
- If database authentication uses managed identity/Entra tokens, verify token
  refresh for new pool connections and least-privilege database roles.

**Container Apps:** A long-lived Node process makes pool ownership familiar.
Calculate total connections across all replicas, worker processes, and old/new
revisions during release. Rapid autoscaling can still cause connection storms;
containers do not automatically solve this.

**Functions:** A warm worker can reuse a module-scoped pool; connection reuse
does not disappear merely because hosting is serverless. All HTTP functions
scale as one group, so registration, login, preferences, and weather routes
do not each require their own two-instance baseline. Default Node HTTP
concurrency is four at 512 MB, 16 at 2,048 MB, and 32 at 4,096 MB; tune it against
hashing and database capacity rather than assuming the defaults are optimal.
Cold workers, rollout overlap, and scale-out can multiply pools rapidly.

A useful budget is:

`potential client connections = concurrent worker processes * pool maximum + migration/admin reserve`

PgBouncer client connections and actual PostgreSQL server connections are
different budgets. Neither should be sized to an advertised service maximum
without considering the small database's CPU/memory. Current Flex documentation
states the on-demand instance limit does not include always-ready instances;
include both when calculating the worst-case pool budget. Cap scaling and
concurrency for both platforms. Verify native password-hashing dependency builds
and measure CPU/memory on the surviving instance.

Source: [HTTP concurrency][functions-concurrency], [Flex scaling][flex],
[Functions connection guidance][functions-connections], and [PgBouncer][pgbouncer].

## 4. Security, private networking, and delivery ownership

Both candidates can meet the private PostgreSQL requirement without requiring a
private-only API. A possible database baseline is Flexible Server private VNet
injection with no public endpoint, a separate delegated database subnet, and
private DNS. A public-access networking-mode server with Private Link and public
access disabled is another design; its endpoints have separate charges and are
not assumed here. See [PostgreSQL private networking][pg-private].

- Use workload identity and a reviewed secret-storage mechanism; do not embed
  OpenWeather keys, password material, or privileged database credentials in
  browser assets, images, packages, Terraform output, or logs.
- Enforce user authentication/authorization, adaptive password hashing if local
  passwords are used, per-user preference isolation, input validation, TLS,
  parameterized queries, and abuse controls in the trusted API.
- Function access keys are not end-user authentication or authorization.
- Keep application state and secrets out of verbose deployment/diagnostic logs.
  Determine retention, deletion, residency, and external-provider disclosure.
- Container Apps needs registry pull identity and base-image maintenance.
  ACR Basic supports private repositories, but its registry endpoint is not
  Private Link; private database access does not imply every endpoint must be
  private. If registry network isolation is required, reprice the higher tier.
- Functions adds host/deployment storage access, identity/RBAC, and network
  configuration. Use ZRS, restrict unauthorized access, and verify any firewall,
  service-endpoint, or private-endpoint arrangement against deployment needs.
- VNet integration is not an inbound security boundary. Separately evaluate
  ingress restrictions and operational access without assuming an edge service.
- A NAT Gateway, firewall, private API endpoint, or private CI runner is not
  automatically mandatory just to reach private PostgreSQL. If the reviewed
  outbound/origin policy requires one, price it explicitly.

**Terraform/CI/CD judgment:** Both are suitable. Pin providers, protect state,
use federated CI credentials and least-privilege identities, and retain immutable
release artifacts. Terraform must own reproducible resource configuration.
Microsoft's [Terraform provider guidance][terraform] describes AzureRM and
AzAPI, including direct resource API coverage for newer properties.
Define image/package deployment ownership without allowing application pipelines
to overwrite Terraform-owned networking, secrets, or app settings. Functions
rollback guidance that reapplies settings must be adapted to this ownership rule;
do not give Terraform and CI competing configuration authority.

Run compatible versioned migrations once per release, not on every replica
startup or function invocation. The migration runner needs a reviewed private
database path. Reprovisioning compute does not restore the database.

## 5. Is there cheaper first-party serverless PostgreSQL?

**Finding:** No documented Microsoft first-party PostgreSQL option was verified
to automatically pause/scale compute to zero while retaining the continuously
available instance/AZ failure coverage required here.

- **Flexible Server** documents provisioned Burstable, General Purpose, and
  Memory Optimized tiers. It is managed PostgreSQL, not a request-resuming,
  scale-to-zero database. Burstable does not support HA.
- **Stop/start** is not proof of serverless auto-resume or continuous HA.
  Current [HA documentation][pg-ha] describes stop/start/restart affecting both
  primary and standby. Even when supported, deliberately stopping both removes
  database service availability and is unsuitable for this production baseline.
  Do not rely on the older blanket assertion that all HA stop/start is unsupported.
- **Azure HorizonDB** is a first-party PostgreSQL-compatible service and must
  not be overlooked. It is currently preview, has disaggregated compute/storage
  and zone-resilient storage, and requires at least two compute replicas for
  compute HA. Its overview bills **provisioned compute core-hours**, not
  documented automatic pause/scale-to-zero. Storage growth is automatic; that
  is not serverless compute. It also currently lacks built-in PgBouncer and
  configurable maintenance windows; Private Link is supported but VNet
  injection is not. It is not a demonstrated lower-cost scale-to-zero solution.
- **Azure SQL Database serverless** has automatic pause/resume but is not
  PostgreSQL and does not satisfy F-04 without changing the requirement.
- Third-party PostgreSQL offerings are not Microsoft first-party services;
  no third-party service was queried, selected, or assumed to meet private
  networking and AZ HA.

Sources: [PostgreSQL overview][pg-overview], [HA configuration][pg-ha-config],
[compute tiers][pg-compute], [HorizonDB overview][horizon],
[HorizonDB HA][horizon-ha], and [Azure SQL serverless][sql-serverless].

## 6. Cheapest verified qualifying Flexible Server baseline

### Region/capacity discovery that changes the earlier estimate

The current [PostgreSQL region table][pg-overview] marks **West Europe and
North Europe with `$`**, whose legend says new zone-redundant HA deployments
are temporarily blocked. Existing provisioned HA servers are a different case.
This project has not provisioned one. Do not present the previous West Europe
estimate as a currently deployable baseline or silently substitute same-zone HA.

Dsv3 compute prices were compared in the ten European regions listed without
that new-HA restriction below. Actual subscription/SKU/quota availability is
still unverified; Norway East is also access-restricted according to the table.

| Region | Dsv3 USD per vCore-hour | Compute for primary + standby, two vCores each, 730 hours |
| --- | --- | --- |
| Sweden Central | 0.08976 | 262.10 |
| France Central, UK South | 0.099 | 289.08 |
| Italy North, Spain Central, Poland Central, Belgium Central, Austria East | 0.1015 | 296.38 |
| Switzerland North | 0.11165 | 326.02 |
| Norway East | 0.11462 | 334.69 |

These are compute prices only, not cross-region complete budgets.
**Sweden Central is an evaluation region, not an approved regional decision.**
Both API candidates are repriced there below so a cheap database in one region
is not combined with API rates or presumed private connectivity in another.

### Configuration and calculation

The lowest PAYG qualifying configuration verified in this investigation is:

- **General Purpose Standard_D2s_v3**, two vCores / 8 GiB on the primary.
- **Zone-redundant HA**, matching standby in a different AZ.
- **32 GiB Premium SSD storage per server**, the documented Flexible Server
  minimum; baseline included I/O only, no extra provisioned IOPS.
- Private VNet access and private DNS; backups retained under an approved policy.

Sweden Central illustrative monthly cost:

| Component | Calculation | USD/month |
| --- | --- | --- |
| Primary and standby compute | 2 servers * 2 vCores * 730 hours * 0.08976 | 262.10 |
| Primary and standby storage | 2 * 32 GiB * 0.1369 | 8.76 |
| **Database compute + storage subtotal** | | **270.86** |

The retail `1 vCore` SKU label is a **billing unit**, not a deployable one-vCore
General Purpose server. The minimum is two vCores, and HA doubles server
compute/storage. Duplicate per-core and whole-SKU meters must not be summed.

For comparison, two D2ds_v5 servers at $0.187/server-hour plus the same storage
cost about **$281.78/month**, only **$10.92 more**. Dsv3 is the lowest raw price
verified, not automatically the best database cost/benefit: newer compute and
better I/O limits may justify that small premium after tests.

Excess backup storage, additional I/O, private DNS, network transfer, monitoring,
restore-test capacity, and optional Private Link charges are not zero and are
not included in this subtotal. Microsoft's billing guidance includes backup
capacity up to the primary's provisioned storage; actual excess must be modeled.
Reservations can lower steady-state compute cost but require commitment and
approval; this is the cheapest verified **PAYG baseline**, not a claim covering
every contract, currency, discount, European generation/region combination, or
live capacity allocation.

Sources: [compute minimums][pg-compute], [storage minimums][pg-storage],
[HA eligibility][pg-ha-config], [HA billing][pg-pricing], and [retail API][retail].

## 7. Pricing evidence and comparable API cost

### Assumptions

- Prices retrieved on 2026-10-07 in USD; 730 hours = 2,628,000 seconds.
- Sweden Central, Linux, PAYG, no reservations/savings plans/tax/negotiated discounts.
- Two continuously available API replicas/instances; no scale-to-zero credit.
- API resource sizing is untested. The 512-MB comparison uses two ACA replicas
  at 0.25 vCPU/0.5 GiB versus two Flex 512-MB always-ready HTTP instances.
  Similar nominal allocation does not prove identical CPU performance.
- ACA workload-profile environment with Consumption only, possible external
  API ingress and private database reachability; one managed Standard load
  balancer and two Standard public IPs per current networking documentation.
  No Dedicated workload profile or separately charged environment features.
- ACR Basic is an explicit $5.07/month modeling choice, not required exclusivity
  to ACR. Current [ACR reliability guidance][acr-ha] gives automatic zone
  redundancy across Basic/Standard/Premium in supported regions.
- Flex uses ZRS host/deployment storage; its usage-dependent cost is retained as
  an unquantified addend, not silently treated as free.
- Frontend/Front Door costs are neither assumed nor included.

### Retrieved meter ledger

Rates below are public retail data, not a contractual quote or proof of capacity.
Effective meter dates can precede retrieval; duplicate labels/free tiers were
not counted twice. Load-balancer rule pricing is a Global meter.

| Resource/meter | Rate USD | Unit | Meter ID |
| --- | --- | --- | --- |
| ACA CPU active | 0.000024 | vCPU-second | 4ea1c35d-d999-57d0-88f2-e689d3475fcd |
| ACA CPU idle | 0.000003 | vCPU-second | 27beb741-e49b-5a71-9f81-8a6703defc18 |
| ACA memory active / idle | 0.000003 | GiB-second | 05396e31-2622-5cc8-9bb4-06d0ac9c6047 / 7c930da8-0777-5729-8384-84010d2555da |
| ACA requests | 0.40 | million requests | b0e8dad1-2d3f-594d-8b67-2bbeba27dc67 |
| Flex always-ready baseline | 0.000004 | GB-second | a66216e4-91d6-57b7-b92a-edfc3676f116 |
| Flex always-ready active execution | 0.000016 | GB-second | 6d2d0cea-6458-52fd-b9d2-1c4afbd42760 |
| Flex always-ready executions | 0.000004 | 10 executions, equivalent to $0.40/million | 7df0d9a1-dd56-5167-b3c6-56bb85463e2b |
| Standard LB included rules | 0.025 | hour | 27827eb0-7f60-4928-940b-f5fe15e7a4cb |
| Standard IPv4 public IP | 0.005 | IP-hour | 9c150bf9-2bad-430e-a53c-c213804f49ef |
| ACR Basic registry | 0.1666 | day | 5c9e7a65-5784-494c-9718-7749d4075dd9 |
| PostgreSQL Dsv3 compute | 0.08976 | vCore-hour | 123d2197-3109-5ebb-bb4e-bd7295fcc41a |
| PostgreSQL standard storage | 0.1369 | GB-month retail unit | 9424492f-6e0a-5fc7-82ac-56cf7fa1469e |
| PostgreSQL D2ds_v5 whole server | 0.187 | server-hour | e1994966-86d8-5fdd-b2fe-476405cbb29e |

The standard storage subtotal uses the documented 32-GiB provisioned disk
quantity with the returned Azure storage meter; finalize calculator quantities
and included I/O at quote time.

### Compute floors and variable cost

**ACA, two 0.25-vCPU/0.5-GiB replicas:**

- Idle compute: **$11.83/month**.
- Continuously active compute: **$39.42/month** before additional replicas.
- Managed LB and two IPs: **$25.55/month**, plus processed data.
- Modeled ACR Basic: **$5.07/month**.
- Hosting fixed/resource subtotal: **$42.44-$70.04/month** before requests.

ACA idle eligibility requires minimum replicas, no HTTP work, less than
0.01 vCPU usage, and less than 1,000 bytes/second network traffic per replica.
Background activity can defeat idle eligibility. Above-minimum replicas are
active-billed. Subscription-wide free grants (180,000 vCPU-seconds,
360,000 GiB-seconds, two million requests) may reduce cost; resource grants
are excluded from these illustrations so the ranking does not depend on them.
Charges above the request grant are $0.40/million.

**Flex, two 512-MB always-ready HTTP instances:**

- Baseline: **$10.51/month**.
- Active execution is an additional memory/time meter; no always-ready grants.
- If both allocated instances are active continuously: **$52.56/month**
  including baseline, before execution count, storage, or scale-out.
- Executions: **$0.40/million**, with no always-ready free grant.
- Minimum billed execution period is one second, then 100-ms rounding.
  Concurrent executions share instance-active periods; request count times
  average latency is not a universally correct billing estimate.
- ZRS storage capacity/transactions and any chosen private storage endpoints,
  deployment access, and monitoring must be added.

The Functions pricing page describes baseline wording differently from the
hosting/billing documentation. These calculations follow the latter's explicit
baseline-plus-active-execution model; validate actual Cost Management meters
before committing to spend. Source: [Flex billing][flex].

### Matched-allocation sensitivity, not a workload forecast

Let `d` be the fraction of allocated instance/replica time active, not CPU
utilization or requests/month. The same `d` across the two platforms is an
illustrative sensitivity assumption; their actual activity and rounding can
differ. No traffic estimate or scale-out forecast has been approved.

- ACA hosting = `30.6174 + 11.826 + 27.594*d`, before requests/grants/other usage.
- Flex hosting = `10.512 + 42.048*d`, before executions/storage/other usage.
- Add the same **$270.86** database subtotal to either.

| Illustrative activity | ACA hosting incl. modeled network/registry | Flex baseline + active execution | ACA API + DB subtotal | Flex API + DB subtotal |
| --- | --- | --- | --- | --- |
| Idle, d = 0 | 42.44 | 10.51 | 313.30 | 281.37 |
| 10% active | 45.20 | 14.72 | 316.06 | 285.58 |
| 50% active | 56.24 | 31.54 | 327.10 | 302.40 |
| 100% active, no extra instances | 70.04 | 52.56 | 340.90 | 323.42 |

**These are partial subtotals, not all-in bills.** Add requests/executions,
Flex storage, monitoring, private DNS, egress, LB data processing, excess
backups, release overlap, migrations/CI runners, nonproduction environments,
support, and engineering/on-call effort. Frontend/edge are deliberately outside
scope. Do not assume one platform's unquantified addends equal the other's.

At matched small sizing, Functions saves about **$17-$32/month** before those
addends and ACA grants. At an illustrative $75/hour engineering rate, only
**14-26 additional minutes/month** of Functions-specific release/recovery work
would erase that difference. This is a break-even illustration, not a labor
measurement. Container maintenance can equally consume the ACA advantage.

### Larger sizing can reverse the comparison

For matched nominal two-instance **1-vCPU/2-GiB** capacity:

- ACA compute: $47.30 idle to $157.68 fully active; with modeled overhead,
  **$77.92-$188.30/month**.
- Flex two 2,048-MB instances: **$42.05 baseline to $210.24 fully active**,
  before executions/storage.

Under equal activity assumptions, ACA becomes cheaper near 62% active time,
before grants and usage addends. API/provider waiting time can count as active
even when CPU use is low. This is not a measured break-even for this application.
Do not compare ACA 1-GiB replicas against Flex 2-GiB instances as if they provide
equivalent memory/capacity. Runtime measurements must determine practical sizing.

Sources: [ACA billing][aca-billing], [VNet managed-resource charges][aca-vnet],
[Flex billing][flex], [PostgreSQL billing][pg-pricing], and [retail API][retail].

## 8. Architectural judgment and recommendation

### Ranked recommendation

This recommendation was accepted by the requesting user for the compute
platform only; see [the human acceptance entry](#human-acceptance-2026-10-07).

1. **Azure Container Apps** for the best current total cost/benefit of this
   conventional Node.js/TypeScript API.
2. **Azure Functions Flex Consumption** as the strongest lower-infrastructure-
   price alternative, not an unsuitable platform.

Container Apps supports a conventional portable Node server, explicit health
probes, immutable releases, readiness-gated cutover, and revision-based traffic
rollback. PostgreSQL pool ownership is familiar, and the team does not operate
Kubernetes. At small sizing the approximately $17-$32/month premium over Flex
before addends is modest relative to the database floor and potential recovery
effort. These are reasons to pay a small premium, not invented workload scores.

**Functions should become preferable** if small instances meet hashing,
concurrency, memory, and surviving-capacity targets; its rolling updates are
supported at an acceptable maturity in the selected region; redeployment
rollback meets recovery targets; and the team finds Functions handlers/storage
simpler than a container pipeline. It is particularly attractive for sparse
HTTP traffic and an explicit infrastructure-price priority. No event-driven
business feature is needed to justify it.

If low-overhead container maintenance turns out to be untrue, or if Flex releases
and recovery are demonstrated as equally simple, do not retain Container Apps
merely because it ranked first here. Conversely, larger continuously busy
capacity can reduce or reverse Flex's infrastructure-price advantage.

### Database recommendation

No verified first-party automatic scale-to-zero PostgreSQL solution removes
the HA database floor under the current requirements. Use **zone-redundant
Flexible Server as the database candidate**, not a stopped production database,
single Burstable server, or same-zone substitute.

The cheapest verified PAYG baseline is Sweden Central D2s_v3 plus a zonal
standby and 32 GiB per server, approximately **$271/month** compute/storage.
Evaluate the approximately **$282/month D2ds_v5** alternative for better
performance/cost-benefit. Neither configuration nor Sweden Central is approved.

### Implementation validation and remaining configuration approvals

1. Confirm selected-region Container Apps zonal support, database zonal HA
   allocation, quotas, and SKU availability. Retail meters do not establish live
   deployability. Flex region/rolling-update checks remain relevant only if
   reconsidering the rejected alternative.
2. Recheck PostgreSQL's new-deployment restriction table; do not silently use
   West Europe/North Europe while their zonal HA restriction remains.
3. Measure Node process memory, native hashing CPU/RAM, p95 latency, realistic
   concurrency, and single-survivor capacity. Validate 512-MB versus larger sizes.
4. Prove bounded pool/concurrency/scale settings, PgBouncer compatibility,
   release-overlap connection budgets, and database failover reconnection.
5. Test deployment, failed-readiness behavior, external acceptance checks,
   rollback time, compatible migrations, and mixed-version behavior.
6. Validate private DNS, database isolation, storage/registry access, TLS,
   identities/secrets, CI/migration paths, origin policy, and provider degradation.
7. Produce a complete low/expected/peak cost model with actual telemetry,
   storage, network, backup, delivery, nonproduction, and labor assumptions.
8. Pin and validate Terraform provider/API properties without competing
   application/configuration owners; protect state and release artifacts.
9. Define SLO/RTO/RPO and privacy/security acceptance criteria. Compute platform
   approval is recorded; obtain the remaining configuration and implementation/
   provisioning approvals before acting beyond documentation scope.

### Checks and limitations

Research used Microsoft documentation/search and public retail pricing only.
No Azure resources, subscriptions, PostgreSQL instances, third-party database
accounts, or application code were inspected or provisioned. No runtime load,
failover, deployment, Terraform plan, or application tests were run.
Calculations were checked with local arithmetic. The subsequent human approval
selects Azure Container Apps as compute only; it does not validate sizing or
select a runtime version, framework, region, database configuration, frontend,
edge, or CI provider. **Final human decision: Accepted - Azure Container Apps.**

## Sources

All retrieved on 2026-10-07. Microsoft documentation can change after retrieval.
Some guessed legacy URLs returned 404; successful current URLs below were used.
Search snippets from Microsoft Q&A were not treated as authoritative service
capability evidence. Conflicting rolling-update and PgBouncer wording is called
out rather than silently resolved.

[aca-ha]: https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps
[aca-containers]: https://learn.microsoft.com/en-us/azure/container-apps/containers
[aca-revisions]: https://learn.microsoft.com/en-us/azure/container-apps/revisions
[aca-billing]: https://learn.microsoft.com/en-us/azure/container-apps/billing
[aca-vnet]: https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks
[aca-ci]: https://learn.microsoft.com/en-us/azure/container-apps/github-actions
[acr-ha]: https://learn.microsoft.com/en-us/azure/reliability/reliability-container-registry
[functions-ha]: https://learn.microsoft.com/en-us/azure/reliability/reliability-functions
[flex]: https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan
[functions-concurrency]: https://learn.microsoft.com/en-us/azure/azure-functions/functions-concurrency
[functions-connections]: https://learn.microsoft.com/en-us/azure/azure-functions/manage-connections
[functions-updates]: https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-site-updates
[functions-rollback]: https://learn.microsoft.com/en-us/azure/azure-functions/functions-rollback-deployments
[functions-terraform]: https://learn.microsoft.com/en-us/azure/azure-functions/functions-create-first-function-terraform
[terraform]: https://learn.microsoft.com/en-us/azure/developer/terraform/overview
[functions-ci]: https://learn.microsoft.com/en-us/azure/azure-functions/functions-how-to-github-actions
[pg-overview]: https://learn.microsoft.com/en-us/azure/postgresql/overview
[pg-ha]: https://learn.microsoft.com/en-us/azure/postgresql/high-availability/concepts-high-availability
[pg-ha-config]: https://learn.microsoft.com/en-us/azure/postgresql/high-availability/how-to-configure-high-availability
[pg-compute]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute
[pg-storage]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-storage
[pgbouncer]: https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer
[pg-private]: https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private
[pg-pricing]: https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/
[horizon]: https://learn.microsoft.com/en-us/azure/horizondb/overview
[horizon-ha]: https://learn.microsoft.com/en-us/azure/horizondb/high-availability/concepts-high-availability-failover
[sql-serverless]: https://learn.microsoft.com/en-us/azure/azure-sql/database/serverless-tier-overview
[retail]: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
