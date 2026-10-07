# ADR-005: Network boundaries, secrets, and workload identity

## Status

**Accepted** by the requesting user on **2026-10-07**.

- Human decision owner: Requesting user.
- Approval date: 2026-10-07.
- Approval reference: Explicit instruction, "Human decision: APPROVED. Accept
  ADR-005 with the recommended network/security architecture," preserved in the
  [human acceptance entry](../ai/08-network-security-evaluation.md#human-acceptance-2026-10-07).
- Decision history: Proposed -> Under Review after research -> Accepted after
  explicit human approval, all on 2026-10-07.
- Accepted scope: The topology, network boundaries, database workload
  authentication, secrets, encryption, and simplified API/migration identity
  model below. A third dedicated ACR-pull identity is optional, not required.
- Acceptance does not authorize region selection, code/Terraform generation,
  provisioning, spending, or reopening another accepted ADR. Deployment tests
  remain implementation validation items, not blockers to this acceptance.

## Context

The accepted architecture is Azure Container Apps, PostgreSQL Flexible Server
with zone-redundant HA, Azure Front Door Standard with a restricted public
Container Apps origin, and GitHub Actions with OIDC. European region selection
is recorded separately in [ADR-002](ADR-002-azure-region.md); this ADR does not
select or change it.

Only the application must be publicly accessible. PostgreSQL public access must
be disabled. End-user adaptive password hashes remain application data in
PostgreSQL; the OpenWeather API key remains server-side. Prefer a simple managed
production topology with useful security boundaries, not enterprise networking
without a concrete requirement.

The [evaluation](../ai/08-network-security-evaluation.md) verifies current
Microsoft documentation, not a deployed configuration. Historical requirements
tables/indexes still contain earlier proposal labels; the individual accepted
ADRs and the user's current architecture are the basis for this review.

## Requirements

[Requirements](../requirements.md): F-01 through F-04, N-02/N-04/N-05,
S-01/S-02, A-01/A-02, D-01 through D-03; AS-04/AS-05/AS-07/AS-08/AS-09;
proposed safeguards S-P01 through S-P04.

## Options considered

| Option | Evaluation |
| --- | --- |
| ACA ingress CIDR allowlist plus application Front Door ID validation | Recommended enforcement for the already accepted Standard/public-origin model; requires maintained prefixes and bypass tests |
| Subnet NSG using `AzureFrontDoor.Backend` as the public-origin boundary | Not effective for an external workload-profiles environment: public ingress bypasses that subnet |
| Header-only validation or DNS pointing at Front Door | Insufficient; the identifier is public and DNS does not enforce the path |
| PostgreSQL delegated private access in the same VNet | Recommended: no public database endpoint, no separately billed database private endpoint |
| PostgreSQL Private Link with public network access disabled | Valid alternative, but adds endpoint/DNS/usage costs without a demonstrated need here; not combined with delegated private access |
| Managed identity + Entra database authentication | Preferred: no long-lived API database password; driver/pool token handling must be proved |
| Least-privilege database password in Key Vault | Reviewed fallback for a demonstrated integration limitation, not the default |
| Key Vault references versus literal ACA secrets | Key Vault recommended for production secrets; ACA supplies secret references, not a second manually maintained secret store |

Premium/private ACA ingress, another gateway, and another compute/database
platform are not new candidates: the accepted ADRs remain unchanged.

## Decision

Use the following **human-approved network/security architecture**.

### 1. Front Door -> restricted public Container Apps ingress

Use an **external, VNet-integrated workload-profiles environment**, with the API's
external HTTP ingress enabled. Environment public network access remains enabled
because Front Door **Standard does not provide Private Link**. A Consumption
workload profile does not require purchasing Dedicated compute. [ACA VNet][aca-vnet]
[Origin security][afd-origin]

Enforce both controls:

1. At **the Container App ingress**, use only **Allow** IP restriction rules
   containing the current **IPv4 CIDRs** from Microsoft's global
   `AzureFrontDoor.Backend` service-tag data. A nonempty allowlist denies other
   source ranges. ACA documents IPv4 CIDR rules, **not native service-tag
   expressions or App Service-style header access restrictions**. Do not use
   Front Door frontend/client ranges or `AzureFrontDoor.FirstParty` instead.
   [ACA IP restrictions][aca-ip]
2. In the backend's earliest request boundary, validate the exact configured
   profile's **`X-Azure-FDID`** before application handlers, authentication work,
   or provider/database calls. Reject missing, wrong, duplicate, or ambiguously
   parsed values. This identifier is configuration, **not a secret**. Other
   customers share Front Door backend addresses; source filtering alone does
   not identify this profile. Header validation alone is spoofable.
   [Origin security][afd-origin] [Header protocol][afd-headers]

**Do not place an `AzureFrontDoor.Backend` NSG rule on the ACA subnet and claim it
secures this public origin.** Microsoft explicitly states external
workload-profiles ingress uses the managed public IP and does not traverse the
customer subnet. NSGs remain useful for private flows and supported egress.
[ACA NSGs][aca-nsg]

Terraform owns the allowlist/configuration. Derive reviewed updates from
Microsoft's published service-tag data, monitor changes and update failures,
and validate capacity/source interpretation with the pinned provider/API.
Never freeze copied prefixes indefinitely, broaden them to unrelated Azure
addresses, or apply an empty list on retrieval failure: **no ACA restriction
rules means allow-all**. Preserve the last known-good list and stop/alert on
invalid updates; stage additions/removals without a transient open origin.

Apply the boundary to every revision/label/default/custom hostname and exposed
application route; disable unnecessary ingress/extra TCP ports. Front Door
health probes must work through the same source/profile boundary. Do not trust
`X-FD-HealthProbe` alone or create a business-route bypass for health checks.
Local ACA startup/readiness checks need a distinct container-local probe path
or mechanism, not a publicly forgeable exemption.

Test candidates through a controlled route on the **same Front Door profile**
or a reviewed in-environment check; do not permanently allow hosted CI IP ranges
or disable ingress restrictions for smoke tests. Preserve ADR-006's release
ownership. Validate trusted proxy/client IP parsing; never trust arbitrary
`X-Forwarded-For` values. [ACA ingress][aca-ingress]

This denies ordinary direct application access when correctly implemented.
It **does not remove the public endpoint** or promise private-only isolation.

### 2. Container Apps -> private PostgreSQL

**Yes, ACA needs integration with a customer VNet** for this topology. Use one
regional VNet for the deployed production boundary, with two separate subnets:

| Subnet | Requirement |
| --- | --- |
| ACA environment and its migration Job | Dedicated to ACA; delegated to `Microsoft.App/environments`; workload-profiles minimum `/27`; reserve rollout/scale/Job headroom |
| PostgreSQL Flexible Server | Dedicated to PostgreSQL; delegated to `Microsoft.DBforPostgreSQL/flexibleServers`; minimum `/28`; one HA server uses four addresses; reserve restore/growth headroom |

Exact nonoverlapping CIDRs remain implementation address planning, not a region
decision. Subnet sizing must account for immutable environment constraints and
overlapping revisions. Enable the intended ACA zone redundancy at environment
creation; VNet integration alone does not prove HA. [ACA VNet][aca-vnet]
[ACA reliability][aca-reliability] [PostgreSQL private access][pg-private]

Create PostgreSQL in **private access / VNet integration** mode in its delegated
subnet. It has **no internet-accessible public endpoint**; public network access
must remain disabled, not temporarily opened for CI/admin work. The API and
manual migration Job reach private database addresses through the same VNet.
Do **not** add a PostgreSQL private endpoint to this networking mode.

Create a private DNS zone ending in **`.postgres.database.azure.com`**, with a
name distinct from the server name, and link it explicitly to the VNet.
Use Azure-provided DNS for this simple topology. Connect to the service
**`<server>.postgres.database.azure.com` FQDN**, not a pinned private IP.
No ACA private-endpoint DNS zone or paid DNS Private Resolver is needed.
The alternative Private Link mode instead uses
`privatelink.postgres.database.azure.com` and explicitly disables public access;
creating an endpoint alone is insufficient. [PostgreSQL private access][pg-private]
[PostgreSQL Private Link][pg-link]

Use scoped database subnet NSG rules: API/Job access to PgBouncer **6432** and
authorized direct **5432** for migration/bootstrap/operations; required
intra-database-subnet **5432** for HA; documented Storage/WAL **443**, Entra
outbound access, and DNS. Deny unnecessary private sources after required allows,
instead of relying on default broad VNet access. Preserve the automatically
configured database subnet **Microsoft.Storage service endpoint**.
L4 subnet rules do not distinguish API and Job identities; database roles do.
[PostgreSQL private access][pg-private] [PgBouncer][pgbouncer]

Do not force-tunnel traffic. Use supported platform outbound internet
connectivity for HTTPS OpenWeather, Key Vault, Entra, registry, and telemetry
dependencies. Preserve Microsoft's required ACA platform flows. This is **not**
FQDN-inspected or fully allowlisted egress. No requirement currently calls for
a fixed OpenWeather source IP. [ACA NSGs][aca-nsg] [ACA VNet][aca-vnet]

### 3. Database authentication, identities, and secrets

Prefer **Microsoft Entra-only PostgreSQL authentication**, after proving runtime
and operator connectivity. Assign a dedicated **user-assigned managed identity
to the API per deployed environment**, map it using an Entra administrator to a
non-admin PostgreSQL role, and grant only necessary schema/table/sequence access.
Azure RBAC on the database resource does not grant SQL data access.
[Database Entra][pg-entra] [Managed-identity login][pg-mi]

Acquire tokens using the Azure Identity SDK's ACA-supported identity mechanism,
explicitly selecting the user-assigned identity, for
`https://ossrdbms-aad.database.windows.net/.default`. Supply a valid token as the
PostgreSQL protocol password for **new physical connections**; use its actual
expiry, not a startup token or assumed fixed lifetime. Test reconnects, expiry,
scale-out and HA failover through PgBouncer, which supports Entra authentication.
Do not copy a VM-specific IMDS endpoint or insecure TLS sample into ACA.
[ACA identity][aca-mi] [Managed-identity login][pg-mi] [PgBouncer][pgbouncer]

| Identity boundary | Necessary access |
| --- | --- |
| API user-assigned managed identity | Non-admin runtime SQL role; `Key Vault Secrets User` scoped to its required secrets; narrowly scoped, mode-correct ACR pull access for its image; no secret writes, DDL, or infrastructure permissions |
| Separate migration Job user-assigned managed identity | Bounded migration/DDL SQL role and narrowly scoped, mode-correct ACR pull access for its image; no OpenWeather secret or database administrator role |
| Human Entra administrator/group and controlled bootstrap executor | Initial principal mapping and approved administration through a private execution path; never the normal API identity |
| Existing federated CI principals under ADR-006 | Separate publish/release/infrastructure privileges; no direct hosted-runner PostgreSQL access or routine runtime secret retrieval |

**Default to two workload identities: API and migration.** Reuse each workload's
identity for its own image pulls with pull-only registry permissions; do not
combine API and migration identities because their SQL privileges differ.
A third dedicated ACR-pull identity is optional only when demonstrated Azure
implementation/lifecycle constraints or a concrete isolation requirement justify
it, for example keeping registry-token access unavailable to application code
while retaining that workload's database identity. Prefer the simplest
least-privilege arrangement that works; validate exact registry roles/scopes and
platform support rather than treating another identity as mandatory.
[ACA identity][aca-mi]

System-assigned ACA identity is also supported, but a user-assigned identity
offers stable preauthorization across app recreation and avoids creation-time
secret-reference bootstrapping problems. No Front Door managed identity or
PostgreSQL-server identity for customer-managed encryption is needed here.
Front Door documents Entra origin authentication, referenced as preview in its
origin-security guidance; it writes `Authorization` and would require a separate
origin token-validation/end-user-header design. It is not assumed to be an ACA
ingress restriction or required for this baseline. [ACA identity][aca-mi]
[ACA secrets][aca-secrets] [Front Door origin authentication][afd-mi]

Use **Key Vault Standard** with Azure RBAC, least-privilege secret readers,
soft delete, purge protection, controlled secret administration, and sanitized
audit logs. Store:

- OpenWeather API key, exposed only to the backend through an ACA Key Vault
  secret reference.
- Any actually required application signing/session secret after that design is
  chosen; do not invent a new authentication scheme here.
- A dedicated least-privilege DB password **only if** a concrete driver/token
  limitation justifies the reviewed native-password fallback, with rotation.

**Not Key Vault:** End-user password hashes, preferences/account data, ordinary
configuration such as Front Door ID/hostnames/client IDs, or persisted Entra
access tokens. Hashes stay in PostgreSQL; tokens remain transient.

For best current cost-benefit, use Key Vault's **public HTTPS endpoint with
Entra/RBAC authorization**, not anonymous access. Private Link/firewall isolation
is optional hardening if a concrete policy requires it; it is not the database's
mandatory non-public boundary. Do not assume a "trusted services" switch admits
ACA or add NAT solely for a vault IP allowlist. This explicitly accepts wider
vault network reachability in exchange for fewer endpoints/DNS/operational
dependencies. [Key Vault network][kv-network] [Key Vault security][kv-security]

Use secret **references**, not plaintext in Terraform, images, browser assets,
GitHub artifacts, logs, or AI records. Versionless ACA Key Vault references
retrieve new versions within the documented 30-minute window and restart active
revisions using environment-variable references; plan overlapping-key rotation,
monitor errors, and prove rollout behavior. Never silently fall back to an old
credential or an unauthenticated mode. [ACA secrets][aca-secrets]

Hosted CI uses Azure's control plane to start/wait for the private migration Job.
Use an approved short-lived private bootstrap/operations execution for SQL
administration, with separate elevated identity and audited output. No permanent
VM/jumpbox or self-hosted runner is required; do not expose an HTTP SQL admin API.
App-write and Job-start permissions are high-trust because they can execute
code with attached secrets/identities. [ADR-006](ADR-006-cicd-strategy.md)
[ACA secrets][aca-secrets]

### 4. TLS, encryption, and Standard edge security

- Browser -> Front Door: HTTPS, Azure-managed certificate and minimum TLS 1.2.
- Front Door -> ACA: **HTTPS-only**, generated ACA origin FQDN/platform
  certificate, correct origin host/SNI, and certificate subject/chain validation
  enabled. Do not enable insecure HTTP application ingress.
- ACA/Job -> PostgreSQL/PgBouncer: enforce secure transport; use TLS 1.2 or later
  with trusted roots **and hostname validation**, equivalent to libpq
  **`sslmode=verify-full`**. Prove the chosen Node driver settings; `require`
  alone or disabling certificate verification is insufficient.
- HTTPS also applies to Key Vault, registry, Entra, and OpenWeather.
- Use Azure-managed/service-managed encryption at rest, including PostgreSQL
  data and backups. No requirement justifies customer-managed keys/HSMs or their
  additional identities, rotation, and recovery dependencies.

Front Door terminates TLS at its global edge and re-encrypts to ACA; ACA also
terminates TLS at managed ingress. This is not one uninterrupted TLS session to
the process or a Europe-only processing guarantee. [Front Door TLS][afd-tls]
[ACA ingress][aca-ingress] [Database TLS][pg-tls] [Database security][pg-security]

Attach a **Standard custom WAF policy** to the intended public entry surfaces:
reviewed filtering and **rate-limit custom rules**, especially login/registration
and provider-sensitive routes. Tune with logs/detection before enforcement.
Standard **does not include Premium Microsoft-managed exploit rule sets, managed
bot rule sets, or Private Link**. Rate limits are distributed, socket-IP-based
controls, not exact per-user quotas; retain backend authorization/account abuse
controls, secure password hashing, input limits and parameterized SQL.
Keep authenticated/API responses uncached by default. [Front Door WAF][afd-waf]
[Rate limits][afd-rate] [ADR-004](ADR-004-global-entry-point.md)

## Rationale

The topology meets non-public PostgreSQL, accepted restricted-public origin,
workload identity, and managed-service requirements without duplicate gateways.
Subnet delegation and private DNS provide private database routing; identity and
SQL grants remain independent permission boundaries. Passwordless DB login
removes one long-lived secret, while Key Vault manages the provider key that
cannot be eliminated. Simplicity saves both service charges and operational work.

**Intentionally omitted:** Azure Firewall, NAT Gateway, Application Gateway,
API Management, Bastion/jumpbox, permanent private CI runners, hub-and-spoke/
multiple production VNets, PostgreSQL/ACA private endpoints, and DNS Private
Resolver. There is no concrete requirement for inspected/fixed-IP egress,
duplicate regional ingress, API product governance, VM administration, hybrid
DNS, or network peering. Future requirements must justify these separately.

## Consequences

- Maintain CIDR updates and early profile validation; Standard's public origin
  is a deliberate trade-off, not Premium-equivalent isolation.
- Entra/Key Vault add dependencies for new connections, startup and rotation.
  Existing pools/cached secrets do not prove outage independence.
- One VNet does not mean unrestricted database access or shared production/dev
  identities/data. Any deployed nonproduction boundary stays separately scoped.
- Terraform owns ingress, DNS, networks, identities and secret references;
  delivery owns release/migration orchestration under ADR-006.
- Region eligibility, address allocation, exact role definitions, thresholds,
  secret rotation and incident/runbook ownership remain implementation work.

### Implementation validation items

**The architecture is Accepted.** Human approval includes the restricted-public
ACA origin, custom-only Standard WAF, public authorized Key Vault endpoint, and
no comprehensive egress inspection. The tests below are implementation/delivery
gates, **not blockers to accepting this ADR** and not completed security tests.

Before production delivery, prove:

1. Complete current Front Door backend IPv4 prefixes fit ACA/API/provider limits;
   ingress evaluates the expected source and safe updates retain enforcement.
2. Intended profile/probes succeed; direct requests, forged FDID/client/probe
   headers and another profile fail on every exposed hostname/revision/route.
3. Private FQDN/DNS works from API/Job, off-VNet DB access is denied, required
   HA/Storage/Entra flows work, and no public DB endpoint/firewall hole exists.
4. Entra principal bootstrap, least privilege, token refresh, PgBouncer/driver
   compatibility, failover/reconnects and private operator recovery work.
5. Key Vault references/rotation, image pull identity, TLS validation failures,
   certificate renewal, local probes and controlled candidate smoke tests work.
6. Supported European region/capacity and zone resilience under ADR-002/003,
   monitored failures, recovery procedures and complete usage costs are verified.

A discovered ACL capacity/source-semantics failure, required private-only
origin/managed WAF/inspected egress, or lack of workable private administration
would be a **genuine deployment/design blocker**, not permission to weaken
controls silently. Resolve it with human review. These tests have not been run.

## Security impact

Private PostgreSQL, least privilege, validated TLS and protected secrets reduce
exposure. They do not replace application authentication/authorization, session
policy, hashing, dependency updates, privacy/retention or incident response.
Internet egress and public ACA/vault endpoints remain attack surfaces. Keep
account/location data, request bodies, passwords, tokens and provider keys out of
telemetry. Final human decision: **Accepted**, 2026-10-07.

## Cost impact

Budget ACA managed VNet resources/load-balancer/public-IP usage, DNS zones/queries,
Key Vault secret operations, logs, outbound traffic and occasional Jobs, alongside
already accepted compute/database/Front Door costs. Private database access does
not require a billed private endpoint. Omitted gateways/firewalls avoid fixed
hourly charges and extra administration. No new price quote or spending approval
is claimed; use the eventual region and actual meters before provisioning.

## References

- [Requirements](../requirements.md)
- [Compute](ADR-001-compute-platform.md), [database](ADR-003-database.md),
  [entry point](ADR-004-global-entry-point.md), and [delivery](ADR-006-cicd-strategy.md)
- [Investigation, source evidence, and pending human decision](../ai/08-network-security-evaluation.md)

Official Microsoft sources below were retrieved **2026-10-07**.

[aca-ip]: https://learn.microsoft.com/en-us/azure/container-apps/ip-restrictions
[aca-nsg]: https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration
[aca-vnet]: https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks
[aca-ingress]: https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview
[aca-reliability]: https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps
[aca-mi]: https://learn.microsoft.com/en-us/azure/container-apps/managed-identity
[aca-secrets]: https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets
[afd-origin]: https://learn.microsoft.com/en-us/azure/frontdoor/origin-security
[afd-headers]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-http-headers-protocol
[afd-mi]: https://learn.microsoft.com/en-us/azure/frontdoor/origin-authentication-with-managed-identities
[afd-tls]: https://learn.microsoft.com/en-us/azure/frontdoor/end-to-end-tls
[afd-waf]: https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/afds-overview
[afd-rate]: https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/waf-front-door-rate-limit
[pg-private]: https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private
[pg-link]: https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private-link
[pg-entra]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-entra-concepts
[pg-mi]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity
[pgbouncer]: https://learn.microsoft.com/en-us/azure/postgresql/connectivity/concepts-pgbouncer
[pg-tls]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls
[pg-security]: https://learn.microsoft.com/en-us/azure/postgresql/security/security-overview
[kv-network]: https://learn.microsoft.com/en-us/azure/key-vault/general/network-security
[kv-security]: https://learn.microsoft.com/en-us/azure/key-vault/general/best-practices

## Accepted topology

```text
Internet
  |
  | HTTPS
  v
Azure Front Door Standard + custom/rate-limit WAF rules
  |
  | HTTPS; origin certificate validation
  v
Restricted PUBLIC Container Apps HTTP ingress
  | ACA IPv4 Backend CIDR allowlist + exact X-Azure-FDID validation
  v
API in VNet-integrated external workload-profiles environment
  |
  | Private DNS + private routing + validated TLS + Entra token
  v
PostgreSQL Flexible Server, zone-redundant HA
  Dedicated delegated subnet; NO public database access

Same VNet: private migration/approved operations Job -> PostgreSQL
API -> HTTPS + managed identity -> Key Vault (OpenWeather key)
API -> HTTPS -> OpenWeather
GitHub Actions + OIDC -> Azure control plane (not public SQL)
```
