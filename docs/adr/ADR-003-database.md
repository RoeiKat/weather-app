# ADR-003: PostgreSQL hosting and availability

## Status

**Accepted** by the requesting user on **2026-10-07**.

- Human decision owner: Requesting user.
- Approval reference: Explicit instruction, "Accept ADR-003," recorded in the
  [database investigation's human acceptance entry](../ai/04-database-architecture-evaluation.md#human-acceptance-2026-10-07).
- Accepted scope: PostgreSQL Flexible Server; General Purpose, zone-redundant
  HA for production; private connectivity/DNS, validated TLS, bounded Node.js
  pools, and built-in PgBouncer; managed identity / Microsoft Entra
  authentication where supported by the application integration.
- D2ds_v5 is the current production sizing baseline, not a permanent immutable
  requirement or a validated capacity result. Exact sizing remains subject to
  implementation/load validation.
- This architecture acceptance does not authorize provisioning, application/
  Terraform generation, a spending commitment, or selection of the Azure region.

## Context

PostgreSQL on Azure is an assignment requirement, not an open database-engine
choice. The application is a small Node.js/TypeScript backend on accepted
Azure Container Apps, with a React frontend whose hosting remains undecided.
Users register/log in, password hashes are stored in PostgreSQL, and users save
city/location preferences. OpenWeather integration remains server-side.

Production must survive application-instance and Availability Zone failures;
regional disaster recovery is not currently required. PostgreSQL must not be
publicly exposed. Prefer managed services and Terraform-owned reproducible
infrastructure while meeting the explicit best practical cost-benefit
requirement. Development need not maintain continuous HA.

The [database investigation](../ai/04-database-architecture-evaluation.md)
verified current Microsoft capabilities, regional restrictions, and retail
prices. It did not deploy or test this architecture. Compute remains accepted
under ADR-001; region selection remains a separate ADR-002 decision.

## Requirements

[Requirements](../requirements.md): F-01/F-03/F-04, N-01/N-02/N-03/N-05,
S-01/S-02, A-01, D-01/D-02; assumptions AS-04 through AS-08.

## Options considered

- Flexible Server General Purpose with zone-redundant HA: selected production
  architecture.
- Flexible Server Burstable without a standby: selected development approach.
- Flexible Server without HA or with same-zone HA: insufficient production
  AZ-failure protection.
- Azure HorizonDB: relevant first-party PostgreSQL-compatible alternative,
  investigated and rejected for this application's current cost-benefit.
- Larger/Memory Optimized Flexible Server, elastic clusters, and self-managed
  PostgreSQL: no demonstrated requirement justifies the added capacity/operations.

## Decision

Use **Azure Database for PostgreSQL Flexible Server**.

### Production / submitted HA environment

- **General Purpose** compute with **zone-redundant HA**: one primary and a
  matching standby in a **different Availability Zone**, continuously running.
  Same-zone fallback is not compliant with the stated AZ-failure requirement.
- Current sensible compute baseline: **Standard_D2ds_v5, 2 vCores / 8 GiB per
  server**. This is a starting point, not a permanent immutable SKU/size.
  **D2s_v3 remains a cheaper valid fallback** with the same cross-AZ HA if
  implementation/load testing shows it is sufficient. Exact sizing is unvalidated.
- Storage planning baseline from the investigation: **32 GiB per server**,
  initially Premium SSD v2 with baseline included I/O. Confirm storage support,
  growth/alert ownership, and workload fit during implementation. Ordinary
  Premium SSD with autogrow remains a valid operational trade-off.
- Private database connectivity, private DNS, and TLS certificate/hostname
  validation; no public database exposure.
- Managed identity / Microsoft Entra authentication where supported by the
  application integration, mapped to a least-privilege database role.
- Bounded reusable Node.js connection pools and built-in PgBouncer as part of
  the intended production connection-management strategy.
- Automated backups/PITR are required in addition to HA. Seven-day retention
  is the investigation's initial baseline; finalize retention/recovery policy
  and supported PostgreSQL version during implementation planning.

### Development environment

- **Burstable B1ms**, one server, **no HA standby**.
- Minimum practical storage: **32 GiB Premium SSD**; Burstable does not support
  the investigated Premium SSD v2 configuration.
- Small bounded application-local pools; built-in PgBouncer is unavailable on
  Burstable.
- Stop/start when unused to reduce compute cost, with retained data/backups and
  ongoing storage charges. Use separate identities and synthetic development data.
- This cheaper topology is not evidence that production AZ HA has been met.

No final Azure region, exact network address plan, numeric SLO/RTO/RPO,
application framework/driver, PostgreSQL version, or validated capacity is
selected by this ADR.

## Rationale

- Flexible Server provides managed patching, backups, failover, conventional
  PostgreSQL compatibility, integrated pooling, and established Terraform support.
  It avoids self-managed cluster/host operations.
- Cross-AZ synchronous primary/standby replication addresses the required zone
  failure model. Backups and same-zone HA do not provide equivalent protection.
- Two-vCore General Purpose is the smallest documented HA-capable compute
  starting point. D2ds_v5 offers useful documented I/O headroom for an
  approximately $11/month premium over the cheaper D2s_v3 HA illustration,
  without buying oversized enterprise capacity.
- Production is **deliberately more expensive** than development because
  **Burstable does not satisfy zone-redundant HA**. The best cost-benefit ratio
  must satisfy the failure requirement, not simply minimize the bill.
- No verified first-party Azure **true scale-to-zero PostgreSQL** offering
  currently satisfies this continuous HA requirement. Flexible Server stop/start
  is a development cost control, not request-triggered serverless behavior.
- Private connectivity, TLS, workload identity, and least privilege protect
  sensitive account/preference data without exposing PostgreSQL to the internet.

## Rejected alternatives

- **Burstable or a single GP server for production:** lower cost, but no
  qualifying zone-redundant standby.
- **Same-zone HA:** bills matching redundant capacity but both servers share
  the AZ failure boundary.
- **Stopped production database:** deliberately removes service availability.
  Incoming connections do not start Flexible Server; Azure automatically starts
  a stopped server after seven days. Stop/start remains useful for development.
- **HorizonDB:** investigated, not overlooked. Its current Preview/provisioned
  replica model, missing built-in pooling/configurable maintenance controls,
  and higher small-HA cost provide worse cost-benefit for this application.
  Automatic storage growth is not automatic compute scale-to-zero.
- **Larger GP/Memory Optimized, read replicas, or sharding:** no evidenced need;
  reconsider only if measured workload justifies them.
- **Self-managed PostgreSQL on AKS/VMs:** additional patching, replication,
  pooling, backup, and failover responsibilities without a required host-level
  capability. Legacy/retiring PostgreSQL offerings are not new-project candidates.

D2s_v3 is a retained qualifying fallback, not a rejected HA architecture.

## Consequences

- The primary and HA standby use matching compute/storage; the HA standby is
  not a readable application replica or a smaller discounted failover node.
- Azure owns host/OS/minor maintenance, managed backup infrastructure, and
  failover. The team owns schema/migrations, database permissions, configuration,
  monitoring, major-version upgrades, growth, and recovery validation.
- Zone-redundant HA has documented 99.99% SLA characteristics, subject to terms;
  a provider SLA does not prove application availability or uninterrupted failover.
- Failover interrupts connections and can fail in-flight transactions. Reconnect
  using the stable FQDN and retry only safe/idempotent operations; an interrupted
  commit can have an unknown outcome.
- Backups/PITR address corruption/deletion separately from HA. Restore creates
  a new resource and needs a tested private access/identity/endpoint cutover.
- Compute can change later; storage grows but cannot shrink in place. Premium
  SSD v2 lacks autogrow, so growth alerts and an owned response are required.
- **Region availability remains ADR-002's decision.** Preserve the dated research:
  Sweden Central is a promising illustration, not selected; West Europe,
  North Europe, and Germany West Central were flagged for new zone-redundant
  deployments on 2026-10-07. Recheck restrictions and live allocation before
  provisioning; do not silently weaken HA to fit a restricted region.

## Security impact

Use a VNet-connected application with a separate delegated database subnet and
linked private DNS as the investigated baseline. A private endpoint with public
network access explicitly disabled is a valid alternative; endpoint creation
alone does not disable public access. Exact topology, routes, and private
admin/CI/migration access remain subject to ADR-005.

Connect using the server FQDN with validated TLS, not a pinned IP or disabled
certificate checks. Keep required HA, Storage/WAL archival, DNS, and Entra
dependencies reachable. Use default service-managed encryption at rest unless
a separately justified key-management requirement changes that choice.

Managed identity/Entra support must be verified with the selected Node driver,
token refresh, and pooler. Map the runtime identity to a non-admin PostgreSQL role;
Azure resource RBAC alone does not grant SQL data permissions. Keep migration
and operator privileges separate. If a reviewed integration limitation requires
native PostgreSQL credentials, use a least-privilege role, protected secret
storage, and rotation; never embed credentials in source, images, logs, browser
assets, or Terraform outputs. Protect any secret-bearing Terraform state.

Database workload authentication is separate from end-user register/login.
Store user passwords only as secure adaptive hashes; enforce per-user
authorization for saved preferences on the trusted backend.

## Connection-management implications

- Enable/configure built-in PgBouncer explicitly, ordinarily transaction mode
  on private port **6432**; use a reusable bounded local pool per Node process.
- Budget clients across all replicas, worker processes, and overlapping
  old/new revisions. Bound PgBouncer's actual database connections across
  user/database pairs, reserve operational connections, and cap scale-out.
  Published connection ceilings are not throughput targets.
- Verify driver/ORM prepared-statement and session-state compatibility.
  Use authorized direct private **5432** connections for session-sensitive
  migrations/admin work where required.
- Acquire valid Entra tokens for new physical connections rather than keeping
  one startup token forever. Test expiry, scale-out, failover, and pool reconnects.
- Set observable connection/query/acquisition deadlines and bounded retry
  behavior; release connections reliably. Do not hold a transaction while
  waiting on OpenWeather or performing password hashing.
- PgBouncer runs on the database host and restarts after failover; it does
  not eliminate connection interruption or the need for safe retries.

## Cost impact

The production database is the **dominant fixed architecture cost** at the
investigated small application sizing. Both primary and matching standby
compute/storage are billed continuously; low traffic does not remove this floor.

Dated USD PAYG illustrations from the
[investigation's pricing evidence](../ai/04-database-architecture-evaluation.md#14-dated-pricing-evidence-and-major-cost-drivers),
using 730 hours/month and Sweden Central only as an example:

- D2ds_v5 HA plus 32 GiB per server: approximately **$282/month**.
- D2s_v3 matching HA/storage fallback: approximately **$271/month**.
- Development B1ms plus 32 GiB: approximately **$19/month** continuously running,
  or **$8/month** at 160 billed running hours.

These are compute/storage estimates, not regional selection, total application
budgets, or spending authorization. Add private DNS, chargeable backups/WAL,
networking/optional Private Link, monitoring, temporary restore/HA tests,
nonproduction, and operational effort. Storage and excess-backup charges
continue while development compute is stopped; account for the seven-day
automatic start. Reservations require separate commitment approval.

## Validation items

**Not yet performed:** load tests, failover tests, connection-pool tests,
restore/cutover tests, Terraform plans, or deployment tests.

Before provisioning or claiming production readiness:

1. Resolve ADR-002 separately; verify the selected European region's supported
   SKU/storage, subscription quota, and actual distinct-AZ HA capacity.
2. Pin supported PostgreSQL/Terraform/provider versions and validate intended
   HA/storage/authentication properties without competing infrastructure owners.
3. Measure workload, I/O/storage/WAL, latency, and small-server capacity; confirm
   D2ds_v5 or the D2s_v3 fallback and bounded connection/concurrency settings.
4. Verify private DNS, absence of public database exposure, certificate/hostname
   validation, required dependency routes, and private operator/migration access.
5. Test managed-identity token acquisition/refresh and least-privilege SQL grants;
   test PgBouncer/driver compatibility, rollout overlap, scaling, and pool errors.
6. Test failover/reconnection and safe write semantics; verify actual AZ placement
   and end-to-end behavior with the accepted Container Apps platform.
7. Test backup restore and private cutover; finalize recovery/retention,
   maintenance, growth alerts, incident ownership, and numeric SLO/RTO/RPO.
8. Approve the complete budget and obtain explicit implementation/provisioning
   authorization. Architecture acceptance alone is not a production readiness test.

## References

- [Requirements](../requirements.md)
- [Database investigation, sources, and human acceptance](../ai/04-database-architecture-evaluation.md)
- [Accepted compute](ADR-001-compute-platform.md)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
