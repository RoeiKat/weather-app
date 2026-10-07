# Database architecture evaluation for ADR-003

## AI record and decision status

- **Date / evidence retrieval:** 2026-10-07.
- **Author / tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements:** F-01/F-03/F-04, N-01/N-02/N-05, S-01/S-02,
  A-01, D-01/D-02, and assumptions AS-04 through AS-08.
- **Related records:** [requirements](../requirements.md),
  [architecture alternatives](../architecture/alternatives.md),
  [ADR-001](../adr/ADR-001-compute-platform.md),
  [ADR-002](../adr/ADR-002-azure-region.md),
  [ADR-003](../adr/ADR-003-database.md), and the
  [previous cost investigation](03-cost-effectiveness-reassessment.md).
- **Problem:** Identify the best practical first-party Azure PostgreSQL
  architecture for a small application, including the smallest credible
  zone-resilient production configuration and a cheaper development environment.
- **Prompt (faithful summary):** Read project instructions, requirements,
  architecture, ADR-001/002/003, and existing AI records. PostgreSQL on Azure is
  mandatory; compare Flexible Server and genuinely relevant first-party
  PostgreSQL alternatives, including HorizonDB. Assume a Node.js/TypeScript
  backend on accepted Azure Container Apps, React with hosting undecided,
  register/login with password hashes in PostgreSQL, saved location preferences,
  and OpenWeather integration. Balance cost-benefit, AZ HA, security, and
  operations; investigate sizing, billing, storage, backup/PITR, pooling,
  networking/DNS, identities/credentials, encryption, Terraform, maintenance,
  scaling, stop/start, and serverless claims. Verify current European availability
  and prices without choosing a region. Save this investigation only; do not
  change ADRs, application code, Terraform, or reopen compute. Human decision
  must remain Pending. No secrets or personal application data were supplied;
  no redactions were needed.
- **AI recommendation:** Flexible Server, General Purpose 2-vCore/8-GiB primary
  plus a matching zone-redundant standby, starting with `Standard_D2ds_v5` and
  32 GiB Premium SSD v2 per server in a supported region. Use private VNet
  integration, built-in PgBouncer, and application managed identity through
  Microsoft Entra authentication. Development: B1ms, no HA, 32 GiB Premium SSD,
  with scheduled/manual stop/start.
- **What was verified:** Official Microsoft service documentation, Microsoft
  Retail Prices API meters, and Terraform provider documentation; calculations
  checked locally. Capabilities are documented, not deployment-tested.
- **What was accepted/rejected:** The requesting user accepted PostgreSQL
  Flexible Server with General Purpose, zone-redundant HA for production on
  2026-10-07. D2ds_v5 is the current sensible sizing baseline, with D2s_v3 a
  cheaper valid fallback subject to implementation/load validation. Development
  uses B1ms without a standby. Private connectivity/DNS, validated TLS, bounded
  Node pools, built-in PgBouncer, and managed identity/Entra where supported by
  the application integration are accepted directions. HorizonDB remains
  rejected. Container Apps remains accepted compute; no region, spending
  commitment, implementation, or provisioning is authorized by this acceptance.
- **Final human decision:** **Accepted - PostgreSQL Flexible Server with
  zone-redundant HA for production**, by the requesting user on 2026-10-07.

### Human acceptance: 2026-10-07

The requesting user's follow-up explicitly superseded the earlier instruction
not to modify ADR-003 and stated:

> Accept ADR-003.
>
> Selected database architecture:
>
> Azure Database for PostgreSQL Flexible Server.

**Faithful summary of the acceptance/update request:** Accept General Purpose
compute, zone-redundant production HA with a primary and matching cross-AZ
standby, private connectivity/DNS, TLS validation, bounded Node pools, and
built-in PgBouncer. Use managed identity/Microsoft Entra authentication where
supported by the application integration. D2ds_v5, 2 vCores/8 GiB per server,
is a sizing baseline, not an immutable requirement; retain D2s_v3 as a cheaper
valid fallback and validate exact capacity during implementation/load testing.
Development uses Burstable B1ms, no standby, minimum practical storage, and
stop/start. Preserve the investigation, cost/HA trade-offs, HorizonDB rejection,
serverless limitations, and regional evidence without choosing ADR-002.
Update only ADR-003 and this record; do not stage, commit, implement, or
overwrite concurrent sessions' work. No sensitive material was included.

**Accepted scope:** Database service/production HA and the above environment,
security, and connection-management directions. The investigation's storage
and backup proposals remain implementation baselines subject to support,
growth, retention, and workload validation. Acceptance does not claim any load,
failover, connection-pool, restore, or deployment tests have happened.
It does not authorize implementation/provisioning, a recurring spending
commitment, or select a region. Only ADR-003 and this record are updated by
this follow-up; other ADRs and historical investigations remain untouched.
The original investigation prompt above describes the earlier Pending stage,
not the current approval status.

## 1. Executive conclusion

**Select Azure Database for PostgreSQL Flexible Server for ADR-003.**
Production must explicitly use **zone-redundant HA**, not merely a service
called "high availability" and not a backup-only recovery plan.

The smallest sensible production starting point is:

| Property | Recommended production baseline |
| --- | --- |
| Compute | General Purpose `Standard_D2ds_v5`: 2 vCores and 8 GiB on each server |
| HA | One primary and one matching standby in different AZs, continuously running |
| Storage | 32 GiB Premium SSD v2 per server; baseline 3,000 included IOPS and 125 MB/s disk throughput, subject to the smaller compute limits |
| Backup | Start with seven-day automated PITR retention and the service's zone-redundant backup storage for zone-redundant HA; no added regional DR requirement |
| Network | Private VNet integration, separate delegated database subnet, linked private DNS; no public database endpoint |
| Connection | Server FQDN, TLS certificate/hostname validation, managed PgBouncer on 6432 for ordinary API work |
| Authentication | Container Apps managed identity mapped to a least-privilege PostgreSQL role through Microsoft Entra; separate migration/admin identities |
| Planning cost | About **$282/month compute + storage** in Sweden Central as an illustration, plus DNS, usage-dependent backup/monitoring/network costs |

This is a starting configuration, not a benchmark or a final regional decision.
The two-vCore General Purpose floor is imposed by the HA-capable service tier;
there is no need to start with four/eight vCores, 128 GiB storage, Memory
Optimized, read replicas, sharding, or multi-region replication.

**Development:** Flexible Server **B1ms (1 vCore/2 GiB), no standby, 32 GiB
Premium SSD**, seven-day PITR, small driver pools, and stop/start when unused.
Illustrative Sweden Central database compute/storage cost is **$18.91/month**
continuously running, or **$7.56/month** at 160 billed running hours. Add roughly
$0.50/month for one private DNS zone plus queries if using the private topology.

**No documented first-party Azure PostgreSQL service currently removes the
continuously running HA compute floor through true automatic scale-to-zero.**
Flexible Server stop/start is not request-triggered auto-resume. HorizonDB is
relevant, but its current preview/provisioned-replica architecture is materially
more expensive at a small documented HA sizing, without a useful requirement
benefit for this application.

## 2. Scope and interpretation

Read the [agent contract](../../AGENTS.md),
[Copilot instructions](../../.github/copilot-instructions.md),
[AI convention](README.md), requirements, architecture alternatives,
ADR-001/002/003, the [requirements investigation](01-requirements-analysis.md),
[initial compute investigation](02-compute-platform-evaluation.md), and
the completed compute/cost reassessment before this evaluation.

- PostgreSQL on Azure is a constraint, not an engine-selection exercise.
- User account identifiers, password hashes, and saved preferences are small
  relational data. Password hashing runs in the trusted application; ordinary
  weather retrieval need not write every OpenWeather response to PostgreSQL.
- Production HA covers instance and Availability Zone failure, not a whole
  region. Brief failover interruption is distinct from permanent loss of service.
  A provider SLA is not an application SLO or a measured recovery time.
- Development need not maintain continuous HA. A submitted environment claimed
  to demonstrate production AZ HA must actually run the production topology.
- Frontend hosting, global entry, Container Apps sizing, CI provider, numeric
  SLO/RTO/RPO, privacy retention policy, and final region remain separate decisions.
- No invented throughput target, multi-region requirement, budget ceiling,
  or enterprise key-management requirement is used to justify extra resources.

**Evidence labels:** Microsoft-documented capabilities are facts about the
service; retail calculations are dated estimates; the chosen balance is
architectural judgment. Nothing here establishes live subscription capacity,
successful deployment, tested failover, or workload performance.

## 3. Relevant options and configurations

| Option | AZ failure requirement | Practical cost-benefit | Operations and disposition |
| --- | --- | --- | --- |
| Flexible Server Burstable, no HA | **Does not satisfy production** | Lowest practical Azure development spend; CPU-credit limitations | Select for development only; built-in PgBouncer unavailable |
| Flexible Server General Purpose, no HA | **Does not satisfy production** | Roughly half the HA capacity bill, but fails the stated failure model | Useful for temporary production-like non-HA tests, not the submitted HA architecture |
| Flexible Server same-zone HA | **Does not satisfy production** | Pays for two servers without surviving their shared AZ failure | Reject for this requirement |
| Flexible Server zone-redundant HA, 2-vCore GP | **Satisfies the documented database topology** | Lowest proportionate managed production baseline verified here | Recommend; mature managed backup, failover, pooling, security, and Terraform support |
| Flexible Server Memory Optimized / larger GP | Can satisfy with zonal standby | More fixed capacity without an evidenced memory/throughput need | Defer until measurements justify growth |
| Azure HorizonDB, at least two compute replicas | Documents cross-zone compute placement and zone-resilient storage | Higher small-config compute cost; read-scale/disaggregated-storage benefits not needed here | Strongest different-service alternative; reject for this small production application at current maturity/price |

### Other first-party PostgreSQL offerings

- **Flexible Server elastic clusters** use Citus for horizontal sharding.
  They are not a cheaper serverless version of a small ordinary PostgreSQL
  database. Distributed-table/schema planning and extra nodes solve a scale-out
  problem this application has not demonstrated. [Elastic cluster documentation][elastic]
- **Azure Cosmos DB for PostgreSQL** is explicitly on a retirement path and
  Microsoft no longer recommends it for new projects. Its distributed PostgreSQL
  lineage does not make it a sensible new selection. [Lifecycle notice][cosmos-lifecycle]
- **Azure Database for PostgreSQL Single Server** is a retired legacy deployment
  option, not a new architecture candidate; lingering retail meters are not proof
  of current suitability. Flexible Server is Microsoft's current conventional
  managed PostgreSQL service. [Service overview][overview]
- Self-managed PostgreSQL on Azure VMs/AKS is possible, but is not another managed
  PostgreSQL offering. The team would own patching, replication, quorum/fencing,
  pooling, backups, failover, and recovery. No host-level requirement justifies
  that burden here.
- Neon, Supabase, AWS, externally hosted PostgreSQL, and non-PostgreSQL engines
  are outside the assignment scope and were not evaluated or queried.

## 4. Production HA: what actually qualifies

Flexible Server HA provisions a **matching** standby: same compute size and
storage capacity, not a cheaper tiny failover node. Primary and standby
synchronously persist transaction logs. The HA standby is not an application
read replica and cannot be used to halve the primary's required query capacity.
Current documentation also describes a managed WAL replica used for commit
quorum; the published customer HA billing model is primary plus standby, not
three separately purchased application servers. [HA architecture][ha]

| Configuration | Published SLA characteristics | Failure protection |
| --- | --- | --- |
| HA disabled | HA configuration documentation labels this 99.9% | Managed restart/node recovery and backups, not a continuously available second zone |
| Same-zone HA | HA concepts document 99.95% | Node failure within one AZ; both servers can be lost with that zone |
| Zone-redundant HA | HA concepts document 99.99% | Primary/standby in different AZs and automatic failover |

These are provider service/SLA characteristics subject to current contractual
terms, eligibility, and exclusions, not guaranteed user-journey uptime.
Documentation: [HA concepts][ha], [configuration][ha-config], and
[service reliability][reliability].

Microsoft describes AZ failover as **60-120 seconds with zero committed-data
loss**. This is not a measured end-to-end RTO for this application; detection,
WAL recovery, DNS, client reconnection, and retries affect observed recovery.
In-flight/uncommitted transactions can fail. An interrupted commit can leave
the client uncertain whether a write committed.

**Burstable does not support zone-redundant HA**; it is not a legitimate cheap
production substitute. Microsoft positions it primarily for nonproduction and
warns that credit exhaustion can cause severe degradation or unreachability.
It also has support limitations noted in the compute documentation. [Compute][compute]

Explicitly request `ZoneRedundant`, distinct primary/standby AZs, and verify
actual placement/status. **Do not accept a same-zone fallback** while capacity
is unavailable and call the result compliant; even a future automatic move to
different zones does not protect the deployment before that move.

The database must remain running in production. Container Apps must separately
provide its accepted platform's zone-resilient deployment, adequate surviving
capacity, probes, and connection recovery; ADR-001 is not reopened here.

## 5. Smallest credible sizing and storage choice

### Compute

General Purpose starts at **two vCores / 8 GiB**, whereas Burstable can start
smaller. The retail "1 vCore" GP meter is a billing unit, **not a deployable
one-vCore General Purpose server**. [Compute tier/SKU table][compute]

Two useful small production configurations:

| SKU, each HA server | Documented compute limits | Sweden Central HA compute/storage estimate |
| --- | --- | --- |
| `Standard_D2s_v3`, 2 vCores/8 GiB | Up to 3,200 IOPS and 48 MiB/s compute I/O bandwidth | $270.86/month with 32 GiB per server |
| **`Standard_D2ds_v5`, 2 vCores/8 GiB** | Up to 3,750 IOPS and 85 MiB/s compute I/O bandwidth | **$281.78/month** with 32 GiB per server |

**Judgment:** Prefer D2ds_v5. Its approximately **$10.92/month** premium over the
cheapest verified Dsv3 baseline is small and buys a newer supported generation
and higher documented I/O headroom without adding operational components.
It is not a claim of measured CPU efficiency or necessary I/O demand.
D2s_v3 remains a valid **budget fallback**, not a failure to meet HA.
Do not pay for v6, AMD, Confidential Compute, or Memory Optimized merely
because matching retail meters exist; regional availability and actual value
must support such a change.

### Storage

Use **32 GiB per server**, not 128 GiB without evidence. Terraform provider
documentation constrains both Premium SSD and Premium SSD v2 Flexible Server
storage to a minimum of 32 GiB. The generic Azure managed-disk ability to create
a 1-GiB Premium SSD v2 disk does **not** make a 1-GiB Flexible Server a supported
deployment. [Storage options][storage], [Terraform schema][tf-provider]

For production, **Premium SSD v2** is the preferred starting disk:

- Current Microsoft documentation supports HA with it in several European
  regions, including Sweden Central and France Central.
- At 32 GiB it includes **3,000 IOPS / 125 MB/s** disk baseline without buying
  additional performance. Actual achievable I/O remains bounded by the small
  server's lower compute throughput.
- In the queried regions, its capacity rate matches ordinary Flexible Server
  Premium SSD storage. A 32-GiB Premium SSD disk has only **120 baseline IOPS**;
  "up to 3,500" is not the same as 3,500 included sustained IOPS.
- **Trade-off:** Premium SSD v2 currently lacks storage autogrow. Alert on disk,
  WAL, and growth well before the read-only threshold and increase capacity
  deliberately. It also has disk-hydration/operation constraints, no current
  long-term-backup support, and cannot be provisioned on Burstable.
- Regular Premium SSD with autogrow is a valid simpler-operation fallback if
  unattended automatic growth is more important than included I/O headroom.
  It is not necessary to increase the starting capacity just to obtain more I/O.

The v2 documentation has its own HA feature-region list; inclusion there does
not override the service-wide restrictions on new zone-redundant HA deployments.
[Premium SSD v2][ssd-v2], [Premium SSD/autogrow][ssd], [regional service table][overview]

Both storage types can grow, but cannot shrink in place. Changing storage type
is not an in-place online toggle; documented migration/restore paths create
a new target and require a controlled cutover. Avoid buying capacity that cannot
be returned later.

## 6. Development versus production/submitted HA environment

| Property | Cost-minimized development | Production / submitted HA |
| --- | --- | --- |
| Compute | B1ms, 1 vCore/2 GiB | GP D2ds_v5, 2 vCores/8 GiB per server |
| Standby | None | Matching cross-AZ standby |
| Storage | 32 GiB Premium SSD; v2 not supported on Burstable | 32 GiB Premium SSD v2 per server |
| Backup/PITR | Seven days; service-managed backups | Seven days initially; increase within 7-35 days if an approved recovery policy requires it |
| Pooling | Small application-local pool, direct 5432 | Bounded application-local pool plus managed PgBouncer on 6432 |
| Networking | Prefer the same private pattern for Azure development; use an authorized private development/migration path | Private only, no public database endpoint |
| Runtime availability | May be stopped deliberately | Continuously running |
| Sweden Central core cost | $18.91/month at 730 hours; $7.56 at 160 hours | $281.78/month at 730 hours |

B1ms is reasonable for lightweight functional development, not HA validation
or representative production load tests. Monitor CPU credits and memory.
If developers repeatedly deplete credits, try B2s (2 vCores/4 GiB) or a temporary
GP instance rather than masking timeouts. Sweden Central's queried B2s rate
is $0.0398/hour, giving about **$33.43/month** with 32 GiB continuously running.
Regional B2s rates differ substantially; do not copy Sweden's price elsewhere.

Keep production and development data/identities separate. Use synthetic data;
production password hashes and preferences are not development fixtures.
Use the same PostgreSQL major version and migration sequence in both.
Select/pin a currently supported GA version with sufficient lifecycle remaining
during implementation; no requirement here forces a particular ORM or extension.

### Stop/start: cost saving, not serverless

- Stopping Flexible Server stops **compute billing**, not provisioned storage
  or chargeable backup storage. Existing data and retained backups remain.
- A stopped server **does not automatically restart because an application
  opens a PostgreSQL connection**. Start is a management-plane operation
  (portal/CLI/API), not a database connection feature.
- Azure automatically starts it after **seven days**; current documentation
  also permits brief restart for maintenance while stopped. A scheduling policy
  must account for this or idle development compute can resume billing.
- Start is capacity-dependent and may fail during regional capacity outages.
  Schedule it before development sessions and observe failures explicitly.
- Current HA documentation says stop/start/restart affects **both** primary
  and standby. Do not repeat the older blanket assertion that all HA servers
  cannot be stopped. Stopping both would nevertheless invalidate production
  availability.
- A hypothetical all-stopped month has a $4.38 storage floor at the illustrated
  size/rate, but **is not attainable by one stop command followed by doing
  nothing for a month**, because of the seven-day automatic start.

Sources: [stop][stop], [start][start], [limits][limits],
[HA operations][ha], and [stop/start billing][pricing].

**Serverless answer:** No suitable current first-party PostgreSQL architecture
was verified that automatically scales compute to zero and resumes on requests
while satisfying this continuously available cross-AZ production requirement.
HorizonDB's automatic storage growth and provisioned replica scaling are not
automatic compute pause/resume. Preview/free-tier meters are not serverless HA.

## 7. Connection limits, PgBouncer, and Container Apps scaling

### Limits versus sensible concurrency

Microsoft's default connection table currently documents:

| SKU | `max_connections` default | User connections after documented 15 reserved slots |
| --- | --- | --- |
| B1ms | 50 | 35 |
| B2s | 429 | 414 |
| D2s_v3 / D2ds_v5 and corresponding small GP SKUs | 859 | 844 |

Reserved slots can change. Check deployed `reserved_connections` and
`superuser_reserved_connections`; verify `max_connections` after resizing,
because its original default does not automatically follow compute changes.
These are connection ceilings, **not a throughput target**. Raising the limit
on a two-vCore database is not a substitute for pooling and bounded concurrency.
[Limits and pooling guidance][limits]

### Recommendation: use built-in PgBouncer in production

Flexible Server includes managed PgBouncer on General Purpose/Memory Optimized,
including private access. It uses the **same hostname, port 6432**, runs on the
database VM, supports Microsoft Entra authentication, and restarts on the
promoted primary after failover. It needs no separate container, VM, or paid
pooler service. It consumes some existing server resources and is not an
independently redundant third tier. [PgBouncer][pooler]

Set `pgbouncer.enabled` explicitly in Terraform. Current documentation calls it
optional and also describes it as enabled by default; do not depend on that
inconsistent default wording. Set/verify transaction pooling explicitly.

Use both levels of pooling:

1. One bounded reusable pool per Node process, never one pool per HTTP request.
2. PgBouncer multiplexes many client connections onto a small bounded set of
   actual PostgreSQL connections.

Budget **both**:

`client connections = all simultaneous replicas across active revisions
* Node processes per replica * per-process pool maximum + operational reserve`

`database connections = sum of PgBouncer server pools across every user/database
pair + direct migration/admin connections + reserved service connections`

Include old/new revision overlap, scale-out, jobs, workers, and admin access.
Even near-zero idle application traffic does not make idle PostgreSQL
connections free. Cap Container Apps replicas and admission/concurrency to fit
the database rather than allowing unbounded autoscaling to exhaust it.

**Illustrative initial tuning, not measured settings:** One API database/user
pair, five connections per Node process, and a PgBouncer server pool of around
ten. Microsoft's conservative guideline is 2-5 server connections per vCore
as a starting point. Ten replicas with one process each would open up to
50 client connections; equivalent old/new revision overlap could double that.
The advertised PgBouncer default of 5,000 clients and default server pool of
50 per pair are not suitable performance assumptions for this small database.
Tune using pool wait, latency, CPU/memory, locks, and connection metrics.

### Compatibility and failure behavior

- Transaction pooling cannot transparently preserve arbitrary session state,
  session-scoped advisory locks, temporary objects, or LISTEN/NOTIFY behavior.
  Keep ordinary application transactions short and test the chosen ORM/driver.
- Current documented PgBouncer is 1.25.2 and supports protocol-level named
  prepared statements in transaction mode **when configured**;
  `pgbouncer.max_prepared_statements` defaults to zero. Do not claim prepared
  statements are universally impossible, or assume SQL `PREPARE` is equivalent.
- Run compatible versioned migrations once using an authorized identity and
  direct private port **5432** where session/migration-lock semantics require it.
  Do not run migrations on every replica startup.
- Release checked-out connections reliably; set acquisition/connect/query
  deadlines; observe idle-pool errors and queue exhaustion explicitly.
- Do not hold a transaction while waiting on OpenWeather or calculating a
  password hash.
- Failover still drops connections, including PgBouncer connections. Reconnect
  to the stable FQDN with bounded backoff/jitter. Retry reads and explicitly
  idempotent operations safely; do not blindly retry registration/preference
  writes whose commit result is unknown.
- Development B1ms cannot use the built-in pooler. A small local pool (for
  example three connections per process) plus capped development replicas
  comfortably leaves room for administration within its much smaller limit.
  Use temporary GP/HA testing to prove the real production pooling behavior.

## 8. Private networking and DNS

**Recommended database pattern:** Flexible Server **private access / VNet
integration**, with the Container Apps environment VNet-connected in the same
region. Use a separate database subnet delegated to
`Microsoft.DBforPostgreSQL/flexibleServers`; do not share it with Container Apps.
The database has **no internet-accessible public endpoint**.
[Private network documentation][private]

- The documented database subnet minimum is `/28`; an HA server uses four
  addresses. Reserve enough space for restores/future resources rather than
  filling that subnet completely. Exact address planning remains ADR-005 work.
- Terraform must explicitly create/reference a private DNS zone ending in
  `.postgres.database.azure.com` and link it to every VNet that needs resolution.
  For example, `internal.postgres.database.azure.com` is a zone name, not the
  application connection hostname.
- Connect using the service's server FQDN, not a pinned private IP or a custom
  hostname that breaks certificate verification. Private DNS resolves it to
  private addresses and supports endpoint changes after failover.
- Peering alone does not automatically provide the required DNS-zone links.
  Custom/on-premises DNS needs forwarding; a paid DNS Private Resolver is not
  inherently required for the simple same-VNet Azure baseline.
- NSGs/routes must allow application access on 6432, authorized direct access
  on 5432, required intra-subnet HA traffic on 5432, Storage/WAL archival traffic,
  and the documented outbound Entra dependencies. Do not remove the automatically
  configured database subnet Storage service endpoint.
- Private networking is a transport boundary, not permission to read every
  account's preferences. The backend still enforces per-user authorization.
- CI/migration/admin tooling must have a reviewed private path (for example
  an in-VNet runner/job or authorized VPN access). Do not temporarily expose
  production PostgreSQL to accommodate a hosted CI runner.

**Valid alternative:** A server in the public-access/Private Link networking
mode, with an approved private endpoint and **public network access explicitly
disabled**. This can be valuable for multiple consuming networks, but adds
endpoint/data-processing charges and DNS configuration. Its private DNS zone is
`privatelink.postgres.database.azure.com`, not the delegated-subnet example.
Private endpoint creation alone does **not** disable public access. Do not
combine both database networking modes as if both were required.
[Private Link][private-link]

For this small same-region VNet-connected application, delegated private access
is the simpler cost-conscious database recommendation. Final routes, subnets,
operator access, and outbound restrictions still belong to ADR-005. No new
requirement for NAT Gateway, Azure Firewall, Bastion, ExpressRoute, private
frontend hosting, or a private API endpoint is introduced.

## 9. Authentication, credentials, and encryption

### Preferred application authentication: managed identity + Entra

Flexible Server supports native PostgreSQL password authentication,
Microsoft Entra authentication, or both. Microsoft documents managed identities
as supported Entra principals; built-in PgBouncer also supports Entra.
Container Apps supports system-assigned and user-assigned identities.
[Database Entra authentication][entra], [database managed identity][mi],
[Container Apps identity][aca-mi]

**Recommended production design:**

1. Assign a workload identity to the API, preferably a **dedicated user-assigned
   managed identity per environment** for stable preauthorization/lifecycle.
   A system-assigned identity is also supported and simpler where that lifecycle
   coupling is acceptable.
2. Configure a separate Entra administrator/group to bootstrap the database.
   Create/map the API identity as a **non-admin PostgreSQL role**, granting only
   the database/schema/table/sequence permissions the API needs.
   Azure resource RBAC alone does not grant SQL data permissions.
3. Node uses Azure Identity SDK credential/token acquisition appropriate for
   Container Apps, requesting the database scope
   `https://ossrdbms-aad.database.windows.net/.default`.
   The token is supplied as the PostgreSQL protocol password.
4. Obtain/refresh valid tokens for **new physical connections**. Do not put a
   startup token into a long-lived static connection string and assume it
   works forever. Test token expiry, scale-out, pool reconnects, and failover
   through PgBouncer. Do not copy the VM-specific IMDS endpoint from a database
   tutorial directly into Container Apps.
5. Prefer Entra-only database access once application and operator paths are
   proven. Keep migration/admin privilege separate from normal API privilege;
   never give the API Entra administrator permissions to avoid bootstrap work.

This removes a long-lived application database password and its rotation work;
it does **not** delegate end-user registration/login to Entra. Users' adaptive
password hashes remain application data in PostgreSQL. API authentication,
sessions, password hashing, and database workload authentication are distinct.

### Password-based alternative

Native PostgreSQL credentials remain a legitimate simpler client-integration
alternative if an explicitly reviewed driver/token limitation arises.
Use a unique least-privilege runtime role, strong generated credential, rotation,
and a reviewed secret store such as Key Vault accessed by managed identity.
Do not use the database administrator as the API user.

Never embed credentials/tokens in React assets, source, images, logs, Terraform
outputs, or AI records. Terraform's `sensitive` label hides presentation, not
plaintext secret material in state. Prefer avoiding database passwords; where
required, use supported write-only/ephemeral mechanisms when available in the
pinned tooling, or protect state rigorously with encryption, limited access,
and audited secret handling. Development must follow the same secret discipline.
OpenWeather still needs secure secret handling even if database login is
passwordless; ADR-003 does not by itself finalize Key Vault under ADR-005.

### Encryption

- Flexible Server encrypts database data and backups at rest; use the default
  **service-managed keys**. Customer-managed keys are supported, but add Key
  Vault/key-lifecycle dependencies without a requirement here. [At-rest encryption][encryption]
- Enforce TLS (`require_secure_transport=ON`) and require TLS 1.2 or later;
  prefer 1.3 with compatible clients. PgBouncer inherits secure-transport
  enforcement. Private networking does not replace TLS.
- Validate server certificate **and hostname**, equivalent to PostgreSQL
  `verify-full`, using the chosen Node driver's correct options and supported
  root trust. Never use `rejectUnauthorized: false`.
- Current Flexible Server TLS guidance contains `verify-all` wording;
  do not blindly copy that as a libpq mode. Implement the driver's documented
  full verification semantics. Track root CA rotations and avoid pinning
  individual leaf/intermediate certificates. [TLS guidance][tls]

## 10. Backups, maintenance, and growth

### Backup and point-in-time restore

Flexible Server automates snapshots and WAL backups. Retention is **7-35 days**,
with seven days the default. Start at seven for the small initial application;
increase after approving a recovery/retention policy rather than inventing one.
The documented WAL-backup delay RPO can be **up to five minutes**, which is
different from the zero committed-data-loss claim for synchronous HA failover.
[Backup/PITR][backup]

Zone-redundant HA uses **zone-redundant backup storage**. Current documentation
has broader region-based backup wording too; the HA-specific guidance explicitly
states same-zone/no-HA defaults to LRS. Verify the actual deployment setting,
not an assumption that every no-HA server in an AZ region has ZRS backups.

PITR creates a **new server**; it does not undo corruption in place or supply
automatic HA. Plan private DNS/access, identity/grants, endpoint cutover,
Terraform ownership, and any required re-establishment of HA on the restored
resource. A successful backup metric is not a restore test. Routine backups
are service-managed; portable exports require PostgreSQL tools.

Published pricing includes backup capacity up to **100% of primary provisioned
storage**: 32 GiB here, **not 64 GiB because there are two HA disks**. Additional
backup consumption is billed. WAL churn and retention affect this even when
live tables are small. Do not infer a ZRS excess-backup rate from a retail meter
explicitly named LRS. Regional/long-term retention and extra restore capacity
should only be added when justified.

### Ownership and scaling

Azure operates database hosts, OS/security patching, engine minor maintenance,
backup infrastructure, and managed failover. Flexible Server offers configurable
maintenance scheduling; HA maintenance generally works on standby and promotes
it before maintaining the other node. Brief disruptions and urgent maintenance
still need client handling. [Maintenance][maintenance], [HA][ha]

The team owns schema/migrations, least-privilege roles, parameter configuration,
indexes/vacuum awareness, monitoring, growth, major-version upgrades,
extension/client compatibility, restore/failover drills, and data retention.

Compute can scale up/down or change tier later; HA remains subject to supported
tiers and mirrors the new capacity on both servers. Scaling can restart/drop
connections. Microsoft documents near-zero-downtime scaling, but neither that
label nor HA establishes literally zero interruption for every operation.
Storage grows only upward; v2 requires deliberate growth rather than autogrow.
[Resource scaling][scaling]

Start small, observe CPU/memory, storage/WAL, I/O, slow queries, lock contention,
pool waits, and backups. Do not expand replicas/compute/storage preemptively to
solve unmeasured future scale. Monitor password-hashing CPU in Container Apps
separately from database load.

## 11. Terraform support and practical complexity

Flexible Server has an established AzureRM resource and Microsoft's official
Terraform deployment tutorial. Current provider documentation exposes:

- SKU/version/storage, including `Premium_LRS` and `PremiumV2_LRS`;
- `high_availability` with `ZoneRedundant` and standby AZ;
- delegated subnet/private DNS and public access control;
- `authentication` for Entra/password modes, administrators, configurations,
  and maintenance controls through associated resources.

Sources: [Microsoft Terraform tutorial][tf-ms],
[Azure resource/API reference][tf-api], [AzureRM resource documentation][tf-provider].
The tutorial is a starting example, **not** this production security template;
do not inherit broad access or sample password handling.

Use explicit dependencies for DNS links/authentication before dependent resources.
Pin Terraform/providers, verify the selected version supports the intended
storage/authentication fields, and prevent Terraform from accidentally undoing
failover-induced primary/standby AZ changes. Current provider guidance discusses
ignoring the relevant AZ drift; retain intended cross-AZ verification rather
than hiding every change. Protect production from accidental deletion.

Terraform owns infrastructure; separately versioned SQL bootstrap/migrations
own schema and role/grant changes, with a documented private execution path.
Do not run arbitrary SQL during every infrastructure refresh or give competing
pipelines ownership of networking/parameters.

HorizonDB exposes ARM/REST APIs and can in principle use Terraform AzAPI, but
this investigation did not validate a comparable dedicated AzureRM resource or
an end-to-end provider plan for it. That is additional preview integration
verification, not a claim that Terraform is impossible.

## 12. HorizonDB assessment

HorizonDB is a genuinely relevant **first-party PostgreSQL-compatible** Azure
service, not an unrelated engine. Current Microsoft documentation still marks
it **Preview**. It separates compute from shared zone-resilient WAL/data storage.
For **compute HA**, it requires at least two compute replicas; storage redundancy
alone does not make a single compute replica continuously available.
Replicas are placed in different AZs and can serve reads. [Overview][horizon],
[HA][horizon-ha], [compute replicas][horizon-compute]

| Dimension | HorizonDB finding versus Flexible Server |
| --- | --- |
| Small HA sizing | Current Microsoft quickstart demonstrates 2 vCores per replica plus one readable HA replica: four provisioned cores total, 8 GB memory per core. This is a documented small example, not an assertion that every deployment/API permits no smaller size. |
| Cost | Sweden Central paid compute meter is $0.200926/core-hour: about **$586.70/month for four cores**, before used storage, excess backups, private endpoints, and monitoring. Flexible Server's recommended primary/standby is about $282 including storage. |
| Storage | Shared storage is allocated dynamically as data grows; charged for used storage rather than two provisioned database disks. Sweden Central paid data storage is $0.258621/GB-month. This saving for a tiny database does not offset the compute difference. |
| HA / SLA | Documented automatic cross-zone failover and committed-write durability. No comparable GA production SLA was established by the retrieved preview documentation; do not assign it Flexible Server's 99.99% contract. |
| Backup/PITR | Managed snapshot/WAL PITR, currently seven-day retention; configurable retention/LTR not yet available. Backup capacity equal to database size is included, with additional usage billed. |
| Connections/pooling | Standard PostgreSQL client protocol; no built-in PgBouncer currently. Bound local pools or operate an external pooler. Exact deployed `max_connections` must be verified; Flexible Server SKU limits cannot be copied onto HorizonDB. A numeric ceiling was not established in this research and is not a selection blocker for a rejected option. |
| Network/DNS | Private Link supported, no VNet injection. Private endpoint routing/DNS and public exposure controls must be configured/verified; the ordinary portal quickstart's public firewall pattern is not acceptable here. |
| Authentication | Retrieved quickstart documents native PostgreSQL authentication; security guidance recommends SCRAM and least privilege. Equivalent supported Entra/managed-identity database login was **not established** by these sources, so it is not credited as a verified capability. |
| Encryption | TLS and service-managed encryption at rest; customer-managed keys not currently available. |
| Maintenance | Azure-managed; configurable maintenance windows not currently available. |
| Scaling / stop/start | Provisioned core-hours and replica scaling, automatic storage growth. Compute resizing restarts replicas and drops connections. No documented request-triggered auto-pause/auto-resume or stop/start cost model was established. |
| Terraform | ARM/REST exists; exact AzAPI/provider configuration needs more preview-specific verification than the mature Flexible Server path. |
| Europe | Currently listed in Sweden Central and Germany West Central; service-specific capacity still requires verification. Flexible Server's regional restrictions must not automatically be applied to HorizonDB. |

Sources: [quickstart][horizon-create], [security][horizon-security],
[networking][horizon-network], [backup][horizon-backup], and the retail ledger below.

The retail API also contains **zero-priced HorizonDB free-tier meters**.
They do not establish eligibility, limits, duration, or a permanently free
cross-AZ production configuration. No such entitlement is assumed in the
production budget. The comparison uses paid provisioned rates.

**Reject for this application now:** Preview maturity, missing integrated
pooling/maintenance controls, unresolved identity parity, and approximately
double the small HA compute spend outweigh unneeded read-scale/disaggregated
storage benefits. HorizonDB may be attractive for much larger or read-heavy
workloads, but inventing one would violate this investigation's scope.
Its unverified details are not reasons to prolong ADR-003 analysis.

## 13. Current regional evidence for ADR-002

**No final region is selected.** Re-fetched Microsoft's actual region table,
not merely the earlier investigation. Its explicit symbol legend says `$`
means **new zone-redundant HA deployments are temporarily blocked**.
The page also contains an additional broader "$ New server deployments"
sentence; it does not justify claiming every single-server deployment is
available. At minimum, the zonal HA restriction is explicit. [Region table][overview]

| European region | Flexible Server new zone-redundant HA evidence | GP D2ds_v5 HA + 32 GiB/server, USD/month |
| --- | --- | --- |
| **Sweden Central** | Supported, no current `$` flag; v5 and SSD v2 HA documented | **281.78** |
| France Central | Supported, no current `$` flag; v5 and SSD v2 HA documented | 309.27 |
| **Germany West Central** | **Currently `$` flagged**; do not treat the older unflagged research as current | 318.29, hypothetical while restricted |
| **North Europe** | **Still `$` flagged** | 297.18, hypothetical while restricted |
| **West Europe** | **Still `$` flagged** | 318.28, hypothetical while restricted |

Other currently unflagged European zone-redundant candidates in the service
table include **UK South, Italy North, Spain Central, Poland Central,
Switzerland North, Austria East, and Belgium Central**. Norway East is listed
with HA but is **access-restricted**. Some newer regions' listed generations
are v3/v4 rather than v5; do not assume D2ds_v5 is available in all of them.
Their storage-type/HA feature list must also be checked; notably the retrieved
SSD v2 feature-region list does not include Belgium Central.

Sweden Central remains a promising **pricing/capability illustration**, not a
latency/residency/quota conclusion or human regional decision. France Central
is another unflagged priced reference. Before ADR-002 acceptance, verify:

- the desired PostgreSQL SKU, two-AZ capacity/quota and actual HA allocation;
- compatible zone-redundant Container Apps availability in the same region;
- database storage-type/HA support, required operational connectivity;
- user latency and approved primary/backup/telemetry data locations.

Do not choose a temporarily restricted region and silently weaken production
to same-zone HA. Do not add a second region merely to circumvent the restriction.
Prices and public support tables are not subscription-capacity reservations.

## 14. Dated pricing evidence and major cost drivers

### Assumptions

USD public **PAYG**, retrieved 2026-10-07; **730 hours/month**; no taxes,
reservations, credits/free trials, negotiated discount, or support plan.
Sweden Central is the illustration, not the final region. Storage uses the
documented 32-GiB provisioned quantity; ordinary storage retail meters label
units GB/month, while SSD v2 explicitly labels GiB/month. Final quoting must
reconcile calculator quantities and meter terminology.

Microsoft pricing explicitly bills **both primary and standby compute/storage**.
The standby does not become cheaper when idle; at small scale compute dominates.
[Billing FAQ][pricing], [Retail API documentation][retail-doc]

### Reproducible meter ledger

Query the [Microsoft Retail Prices API][retail] with:
`serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq
'swedencentral' and priceType eq 'Consumption'`, USD, following `NextPageLink`.
For the regional table, substitute each region's ARM name. Do not restrict
products to the exact phrase "Flexible Server": storage products use
**"Flex Server Storage"**. Distinguish retired Single Server/Cosmos meters
and do not add duplicate per-core and whole-SKU compute meters together.

| Product / meter | USD retail rate | Unit | Meter ID |
| --- | --- | --- | --- |
| Flexible Server GP Dsv3, 1 vCore | 0.08976 | vCore-hour | 123d2197-3109-5ebb-bb4e-bd7295fcc41a |
| Flexible Server GP Ddsv5, `Standard_D2ds_v5` | 0.187 | whole two-vCore server-hour | e1994966-86d8-5fdd-b2fe-476405cbb29e |
| Flexible Server Burstable B1MS | 0.0199 | server-hour | b22af5dd-37e4-5998-a2d0-0d1ffbdb6eac |
| Flexible Server Burstable B2S | 0.0398 | server-hour | 5feecacb-9662-5e2d-95a4-63f2e7e3a1d6 |
| Flex Server ordinary storage | 0.1369 | GB-month meter | 9424492f-6e0a-5fc7-82ac-56cf7fa1469e |
| Flex Server Premium SSD v2 storage | 0.1369 | GiB-month | 8ece4b7f-0dc7-51ca-a65c-c5c0c89c5bfe |
| Flex Server Premium SSD v2 extra IOPS | 0.026 | additional provisioned IOPS-month | 87e2a55f-e015-581e-9b3b-c03f6f97efaa |
| Flex Server Premium SSD v2 extra throughput | 0.104 | additional MB/s-month | b2da136c-1cc3-51b4-91d9-87346504f559 |
| Flexible Server excess LRS backup storage | 0.103 | GB-month | c0aebffe-4f31-5858-a4db-9bb341e8a8fa |
| HorizonDB paid compute | 0.200926 | vCore-hour | b3ddc47c-204c-57bf-8800-1677ef443bed |
| HorizonDB paid data storage | 0.258621 | GB-month | f214346a-c6f5-574f-8ef1-89a464dcb28e |
| HorizonDB paid backup storage | 0.119 | GB-month | 4d8b10e5-0d0f-5ebc-a220-d2e7b83e7b80 |

The v2 estimate buys **no extra IOPS/throughput**, so their billed additional
quantities are zero, not the entire included baseline. An LRS backup meter is
preserved for development evidence, not misrepresented as a ZRS production
backup quotation.

Regional calculation inputs (whole D2ds_v5 server/hour; storage/unit-month):
Sweden Central **0.187 / 0.1369**, France Central **0.206 / 0.133**,
Germany West Central **0.212 / 0.137**, North Europe **0.198 / 0.1265**,
West Europe **0.212 / 0.1369**. For example, France's compute meter is
`db93c69a-c4c1-59ac-9b74-0bf5ffd0f8c9` and SSD v2 meter
`3ceff297-7e79-5c8a-9050-e5bb7f4743c9`. Restricted-region figures are not
deployability claims.

### Monthly calculations

| Configuration | Calculation | Core USD/month |
| --- | --- | --- |
| Recommended production v5 HA | `2 * 730 * 0.187 + 2 * 32 * 0.1369` | **281.78** |
| Cheaper production Dsv3 HA | `2 servers * 2 cores * 730 * 0.08976 + 64 * 0.1369` | **270.86** |
| Development B1ms always running | `730 * 0.0199 + 32 * 0.1369` | **18.91** |
| Development B1ms, 160 running hours | `160 * 0.0199 + 32 * 0.1369` | **7.56** |
| Development storage-only theoretical floor | `32 * 0.1369`, before excess backups | **4.38** |
| HorizonDB documented small HA example | `2 replicas * 2 cores * 730 * 0.200926` | **586.70 compute only** |

For HorizonDB, illustrative **32 GB used** data adds $8.28/month, making about
$595 before backup/network/monitoring. This is a used-data example, **not a
claimed minimum storage allocation**.

One private DNS zone is about **$0.50/month** for the first pricing tier,
plus **$0.40/million queries**, from the Retail API's `Azure DNS` Private
meters. Thus recommended production is approximately **$282-$283/month before
usage-dependent addends**; always-on B1ms development is approximately **$19-$20**,
or **$8-$9** at 160 running hours with DNS. These are database estimates,
not an all-in application bill.

### Drivers and exclusions

1. **Two continuously provisioned GP servers**: approximately $273/month compute
   of the $282 baseline. This is the unavoidable main cost under current HA
   requirements, not PostgreSQL account/preference data volume.
2. **Storage on both HA servers**: approximately $8.76 at 32 GiB each; larger
   capacity and additional provisioned I/O/performance cost more.
3. **Excess backups/WAL and retention**: workload-dependent; included capacity
   must not be confused with unlimited backups.
4. **Private DNS, optional Private Link, network transfer, monitoring/log
   ingestion/retention**, restore-test capacity, migration access, and support:
   real addends, not silently zero. VNet injection avoids a separate database
   private-endpoint charge; it does not make every networking cost free.
5. **Nonproduction running hours** and temporary HA validation environments.
6. **Engineering/on-call effort**: managed failover/pooling/patching avoids
   maintaining an extra pooler or self-managed PostgreSQL cluster. No invented
   labor saving is assigned a numerical value.

Reservations can lower continuously running production compute cost, but require
approved commitment and eligible capacity; the pricing page advertises up to
47% for one year / 64% for three years. Do not apply maximum discounts as if
guaranteed for this exact SKU or commit before workload/region stability.
Stop/start remains the more proportionate development optimization.

## 15. ADR-003 recommendation and acceptance readiness

The following recommendation informed the human acceptance recorded above.
It remains research evidence, not a claim that every implementation detail or
test result has been approved:

1. **Service:** Azure Database for PostgreSQL **Flexible Server**, conventional
   single database server resource, not an elastic/sharded cluster.
2. **Production HA:** **Zone-redundant** primary/standby in different AZs,
   continuously running; no same-zone fallback or stopped production database.
3. **Smallest sensible production:** General Purpose **D2ds_v5, 2 vCores/8 GiB
   per server, 32 GiB Premium SSD v2 per server**, baseline I/O, seven-day PITR
   initially, growth/backup alerts. D2s_v3 with the same zonal HA/storage remains
   an acceptable approximately $11/month cheaper fallback; ordinary Premium
   SSD with autogrow is an acceptable storage trade-off if preferred.
4. **Development:** **B1ms, no HA, 32 GiB Premium SSD**, seven-day PITR, small
   bounded driver pools and scheduled/manual stop/start. Do not use it as
   evidence of production HA or production load capacity.
5. **PgBouncer:** **Yes in production**, managed transaction pooling on 6432,
   explicitly enabled and tuned, plus small process-local pools. Direct 5432
   for session-sensitive migrations/admin work. Burstable development has no
   built-in PgBouncer.
6. **Secure connection:** Private VNet integration/delegated database subnet,
   linked private DNS and service FQDN, validated TLS, **managed identity +
   Entra non-admin database role** as the preferred runtime authentication.
   Separate admin/migration roles and token-refresh handling; native-password
   fallback only through reviewed secret management, never an admin connection.
7. **Main cost drivers:** Matching always-running HA compute, then both disks,
   excess backups/WAL, optional network/monitoring components and nonproduction
   hours. Plan around **$282/month database core cost** in the illustrative
   region, not a near-zero serverless database promise.
8. **Blockers:** **No unresolved service-level technical issue requires
   postponing the Flexible Server/zone-redundant decision.** Human acceptance
   of that architecture is now recorded; spending/provisioning authorization
   remains separate. Region selection stays with ADR-002; ADR-003 accepts
   a supported-region requirement rather than an exact region.

### Genuine gates, not reasons for indefinite service comparison

- **Before provisioning:** ADR-002 must choose an eligible European region and
  verify subscription/SKU/two-AZ capacity, including the current deployment
  restrictions. If no qualifying allocation can be obtained, deployment is
  blocked; it does not authorize silently dropping HA.
- **Before implementation configuration approval:** Finalize private operational
  access/DNS under ADR-005, pin a supported PostgreSQL/provider version, approve
  spend, and document recovery/retention/incident ownership.
- **Before claiming production readiness:** Measure small-server workload fit;
  test PgBouncer/driver prepared-statement semantics, identity token refresh
  during new connections, rollout-scale pool budgets, failover reconnection and
  safe writes; prove restore/cutover and verify actual cross-AZ placement.
- Premium SSD v2's no-autogrow trade-off needs an owned alert/growth process.
  Choosing ordinary Premium SSD instead is a bounded configuration adjustment,
  not a need to reopen engine, compute, or multi-region architecture analysis.

These are ordinary region/configuration/implementation validation gates.
No numeric SLO, measured capacity, legal compliance, or completed failover test
is invented. The strongest rejected **different service** is HorizonDB;
the strongest lower-price **qualifying configuration** is D2s_v3 zonal HA,
retained as a fallback rather than ruled out as technically unsuitable.

### Checks and limitations

Research was read-only against public sources. No Azure subscription/resource
inspection, provisioning, database credentials, third-party database tools,
Terraform generation/plan, code generation, installation, application tests,
or database load/failover/restore tests were performed. Some guessed/legacy
documentation URLs returned 404; only successfully retrieved sources below
support conclusions. Search Q&A answers were not used as capability authority.
HorizonDB connection ceilings/Entra parity/free-tier eligibility were not
established and are explicitly not credited.

The initial investigation left the existing ADRs and historical investigations
unchanged. The authorized acceptance follow-up updates only ADR-003 and this
record, preserving the research and sources, including the additional Germany
West Central flag, without retroactively rewriting earlier evidence or choosing
ADR-002. No implementation tests are claimed.
**Final human decision: Accepted - PostgreSQL Flexible Server with zone-redundant
HA for production**, by the requesting user on 2026-10-07; see the
[human acceptance entry](#human-acceptance-2026-10-07).

## Sources

Retrieved 2026-10-07. Microsoft/provider documentation and prices can change;
recheck regional capacity and quoted rates before deployment.

[overview]: https://learn.microsoft.com/en-us/azure/postgresql/overview
[compute]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute
[ha]: https://learn.microsoft.com/en-us/azure/postgresql/high-availability/concepts-high-availability
[ha-config]: https://learn.microsoft.com/en-us/azure/postgresql/high-availability/how-to-configure-high-availability
[reliability]: https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql
[storage]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-storage
[ssd]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-storage-premium-ssd
[ssd-v2]: https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-storage-premium-ssd-v2
[limits]: https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-limits
[pooler]: https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer
[private]: https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private
[private-link]: https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private-link
[entra]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-entra-concepts
[mi]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity
[aca-mi]: https://learn.microsoft.com/en-us/azure/container-apps/managed-identity
[tls]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls
[encryption]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-data-encryption
[backup]: https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore
[stop]: https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-stop-server
[start]: https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/how-to-start-server
[maintenance]: https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-maintenance
[scaling]: https://learn.microsoft.com/en-us/azure/postgresql/scale/concepts-scaling-resources
[pricing]: https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/
[retail]: https://prices.azure.com/api/retail/prices
[retail-doc]: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
[tf-ms]: https://learn.microsoft.com/en-us/azure/developer/terraform/azurerm/deploy-postgresql-flexible-server-database
[tf-api]: https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2025-08-01/flexibleservers
[tf-provider]: https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/r/postgresql_flexible_server.html.markdown
[elastic]: https://learn.microsoft.com/en-us/azure/postgresql/elastic-clusters/concepts-elastic-clusters
[cosmos-lifecycle]: https://learn.microsoft.com/en-us/azure/cosmos-db/postgresql/product-updates
[horizon]: https://learn.microsoft.com/en-us/azure/horizondb/overview
[horizon-ha]: https://learn.microsoft.com/en-us/azure/horizondb/high-availability/concepts-high-availability-failover
[horizon-compute]: https://learn.microsoft.com/en-us/azure/horizondb/configure-maintain/concepts-compute-replicas
[horizon-create]: https://learn.microsoft.com/en-us/azure/horizondb/configure-maintain/quickstart-create-cluster
[horizon-security]: https://learn.microsoft.com/en-us/azure/horizondb/security/security-overview
[horizon-network]: https://learn.microsoft.com/en-us/azure/horizondb/network/concepts-network-public
[horizon-backup]: https://learn.microsoft.com/en-us/azure/horizondb/backup-restore/concepts-backup-restore
