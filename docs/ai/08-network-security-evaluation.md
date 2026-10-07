# Network-security evaluation

- **Date / evidence retrieval:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related ADR:** [ADR-005](../adr/ADR-005-network-security.md).
- **Related requirements:** [Requirements](../requirements.md), F-01 through
  F-04, N-02/N-04/N-05, S-01/S-02, A-01/A-02, D-01 through D-03;
  AS-04/AS-05/AS-07/AS-08/AS-09; proposed S-P01 through S-P04.
- **Final human decision: Accepted**, by the requesting user on **2026-10-07**;
  see the [human acceptance entry](#human-acceptance-2026-10-07).

## Problem

Resolve the production networking/security design for the accepted Container
Apps backend, zone-redundant PostgreSQL Flexible Server, Front Door Standard
restricted public origin, and GitHub Actions/OIDC delivery. Prevent practical
origin bypass, keep PostgreSQL non-public, protect provider credentials and
account data, and avoid expensive networking without a concrete benefit.

This record documents the Copilot conversation as a faithful prompt summary,
verified findings, recommendation and limitations, not a verbatim tool-log
transcript or evidence of implementation. No sensitive material was supplied;
no sensitive-content redactions were needed.

## Prompt / conversation scope

The initial investigation request instructed Copilot to:

- Read requirements, accepted ADRs and prior AI investigations.
- Verify ACA-specific Front Door service-tag/IP/header support and recommended
  origin restrictions; avoid confusing ACA with App Service.
- Determine VNet/private PostgreSQL connectivity, public-access disablement,
  subnet delegation and private DNS requirements.
- Compare ACA managed identity/Entra PostgreSQL login with a DB credential in
  Key Vault; keep OpenWeather server-side and user password hashes in PostgreSQL.
- Specify validated TLS and ordinary Azure-managed encryption at rest.
- Distinguish Standard custom/rate-limit WAF from Premium managed WAF/bot rules.
- Justify omitting Firewall, NAT, Application Gateway, API Management,
  Bastion/jumpbox and multiple VNets unless concretely required.
- Give a clear topology and answers sufficient for immediate human review.
  Do not select a region, reopen accepted ADRs, generate code/Terraform,
  provision resources or mark ADR-005 Accepted.
- Write only ADR-005 and this investigation, preserve concurrent sessions'
  changes, perform final git scope verification, and record human decision Pending.

Copilot reported the ACA/NSG capability mismatch during investigation and
recommended the two-layer ingress restriction rather than an ineffective subnet
rule. The initial investigation left human approval Pending. The subsequent
approval and identity simplification are recorded in the
[human acceptance entry](#human-acceptance-2026-10-07); the research and sources
remain preserved below.

### Human acceptance: 2026-10-07

The requesting user explicitly approved the architecture:

> Human decision: APPROVED.
>
> Accept ADR-005 with the recommended network/security architecture.

**Faithful summary of the approval follow-up:** Update only ADR-005 and this
existing AI record, mark ADR-005 Accepted with the approval date, preserve the
selected topology and research, and document this conversation here rather than
create a new file. Keep maintained Front Door backend CIDRs plus exact FDID
validation, no public PostgreSQL access, delegated VNet/private DNS connectivity,
validated TLS, managed identity/Entra SQL authentication where validated,
Key Vault for OpenWeather/genuine application secrets, and password hashes in
PostgreSQL. Omit Firewall, NAT Gateway, Application Gateway, APIM, Bastion,
extra production VNets and unnecessary private endpoints. Do not select a
region, modify other ADRs, generate code/Terraform, stage or commit.

**Approved topology:**

```text
Internet
  -> Azure Front Door Standard
  -> restricted public Container Apps ingress
  -> VNet-integrated Container Apps
  -> private PostgreSQL Flexible Server
```

**Approved identity simplification:** Keep a runtime API identity and a separate
migration identity because migration SQL privileges are elevated. The initial
draft proposed a third pull-only registry identity; it is now **optional**, not
a prerequisite. By default each workload identity receives narrowly scoped,
mode-correct pull-only ACR access for its image alongside its own workload
permissions. Add a dedicated pull identity only if actual Azure implementation/
lifecycle constraints or a concrete isolation requirement justify it.
Choose the simplest working least-privilege arrangement; never merge the API
and migration privilege boundaries.

Origin-bypass tests, private DNS, TLS validation, token refresh, PgBouncer
compatibility and failover remain **implementation validation items**, not
blockers to this human acceptance. Approval does not claim those tests passed
or authorize provisioning, spending or code generation.

- **Human decision owner:** Requesting user.
- **Approval date:** 2026-10-07.
- **Approval reference:** The explicit approval quoted above, preserved here.
- **Final human decision: Accepted.**

## Project context examined

Read the project contract, Copilot guidance, requirements, ADR workflow, ADR-001
through ADR-006, AI-record convention, and relevant findings/decision history in:

- [Requirements investigation](01-requirements-analysis.md).
- [Initial compute evaluation and reopening](02-compute-platform-evaluation.md).
- [Cost-effectiveness reassessment](03-cost-effectiveness-reassessment.md).
- [Database architecture investigation](04-database-architecture-evaluation.md).
- [Global entry-point investigation](05-global-entry-point-evaluation.md).
- [CI/CD investigation](06-cicd-strategy-evaluation.md).

Individual ADRs confirm current acceptance of Container Apps, Flexible Server
zone-redundant HA, Front Door Standard/restricted public origin, and GitHub
Actions/OIDC. Earlier indexes/requirements tables contain historical proposal
labels; they were not edited because this session does not own them. Region
selection remains separate. Existing network investigations already favor
delegated private PostgreSQL, non-admin Entra workload login, maintained ACA
CIDRs plus FDID validation, and private migration execution; this investigation
verifies and completes that direction rather than reopening platform decisions.

## Options considered

| Boundary | Options | Recommendation / reason |
| --- | --- | --- |
| Public ACA origin | DNS/FDID alone; subnet NSG service tag; ingress CIDRs + FDID | Last option: combines supported ACA filtering with profile identification; first two do not enforce the intended boundary |
| Private database | Delegated private VNet access; Private Link with public access disabled | Delegated access in the same VNet: no public endpoint and fewer billed/network components |
| VNet layout | Single VNet/separate subnets; hub-and-spoke/peering | Single production VNet; separate exclusive ACA/database delegations |
| SQL authentication | Managed identity + Entra; native PostgreSQL password in Key Vault | Entra preferred, conditional on real driver/pool validation; password fallback requires an explicit integration reason |
| Identity lifecycle | System-assigned; user-assigned | Dedicated API and migration user-assigned identities for stable provisioning/lifecycle; system-assigned remains supported |
| Provider secret | Literal ACA secret; Key Vault reference | Key Vault reference: central protected storage/rotation without routinely copying values into IaC/release artifacts |
| Vault connectivity | Public HTTPS + RBAC; service endpoint/firewall; private endpoint | Public authorized endpoint for current scope; stronger network isolation only if policy justifies extra dependencies |
| Egress | Supported platform outbound; fixed NAT; inspected Firewall | Platform outbound; no static source-IP or inspection requirement exists |
| Operations | Hosted runner SQL; in-VNet Job; permanent VM/runner | Hosted runner invokes private Job through Azure control plane; no public SQL hole or permanent host |

Premium/private ACA origin is outside this comparison because ADR-004 already
accepts Standard. Nothing here claims Standard can achieve private-only origin
isolation.

## Verified findings

**Verified** below means current Microsoft documentation supports the capability
or limitation. It does not mean this application has passed an Azure test.
**Recommendation** is architectural judgment applying those facts.

### 1. Front Door -> Container Apps

- ACA IP ingress restrictions document **IPv4 CIDRs** and uniform Allow or Deny
  rules. A nonempty allowlist rejects other ranges; **no rules allows all**.
  No native ACA service-tag selector or combined header restriction is documented
  on that surface. [ACA IP restrictions][aca-ip]
- Microsoft's public-origin guidance requires **both** Front Door backend source
  filtering and exact **`X-Azure-FDID`** validation. The global
  `AzureFrontDoor.Backend` tag supplies source prefixes; customers share those
  ranges. The profile ID is not an authentication secret. [Origin security][afd-origin]
- App Service's native service-tag/header restrictions are examples for **App
  Service**, not proof of ACA support. For ACA, materialize Microsoft-published
  backend IPv4 CIDRs at app ingress and validate FDID in the earliest backend
  request boundary. [ACA IP restrictions][aca-ip] [Origin security][afd-origin]
- **External workload-profiles ingress bypasses the customer subnet.** Microsoft
  expressly says an NSG/firewall on that subnet cannot lock down public ACA
  ingress. A supported service tag in an NSG is therefore not effective at this
  boundary. [ACA NSGs][aca-nsg]
- Front Door documents profile ID, socket/client addressing and probe headers.
  ACA warns that untrusted forwarded-for values require validation. Treat the
  trusted proxy chain deliberately; a forgeable header is not an origin or
  health-check exemption. [Front Door headers][afd-headers] [ACA ingress][aca-ingress]
- Standard does not provide Private Link. Current origin guidance also links
  **Entra origin authentication**, referenced there as preview, for Standard/
  Premium. That feature writes `Authorization`; it is not a native ACA ingress
  ACL and requires separate origin token validation plus review of end-user
  authentication/header interactions. It is **not required or adopted here**;
  do not incorrectly say Standard supports no origin authentication at all.
  [Origin security][afd-origin] [Origin identity authentication][afd-mi]

**Recommendation:** Maintained app-ingress IPv4 allowlist plus exact, early FDID
validation. Reject absent/wrong/duplicate values; validate all default, revision,
label and custom hosts. Keep probe handling narrowly scoped and safe. Local
container probes use a separate local mechanism; external health probing does
not bypass business-route controls. Candidate release checks use the same
profile or an approved private check, not permanent CI-source exemptions.

The full live prefix set, ACL capacity/API behavior, actual source evaluation,
probe behavior and update process still need an Azure validation. This research
does **not invent an undocumented ingress rule limit or claim the prefix set
has been installed**. This is the main implementation risk. Stop/alert rather
than apply an empty list if prefix retrieval fails; never broaden prefixes to
cover unrelated Azure infrastructure.

### 2. Container Apps -> PostgreSQL

- A customer-VNet ACA environment can access private resources. Workload-profiles
  environments require a dedicated subnet delegated to
  **`Microsoft.App/environments`**, minimum **`/27`**. External ingress still uses
  the public managed endpoint. Legacy Consumption-only environment requirements
  (`/23`, no delegation) are **not** this design. [ACA VNet][aca-vnet]
- Use a workload-profiles environment's **Consumption profile**; private
  connectivity does not inherently require Dedicated nodes. ACA zone redundancy
  needs supported region/configuration and creation-time planning; VNet
  integration alone does not establish multi-zone serving capacity.
  [ACA VNet][aca-vnet] [ACA reliability][aca-reliability]
- Flexible Server **private access / VNet integration** has **no public
  internet endpoint**. Its dedicated subnet delegation is
  **`Microsoft.DBforPostgreSQL/flexibleServers`**; minimum **`/28`**, and one HA
  server consumes four addresses. Do not share that subnet with ACA.
  [PostgreSQL private access][pg-private]
- Terraform/API creation requires an explicit private DNS zone ending in
  **`.postgres.database.azure.com`** and an explicit VNet link. The zone name
  cannot equal the server name. The client uses the normal server FQDN, resolved
  privately, not a pinned IP/custom hostname. [PostgreSQL private access][pg-private]
- Preserve database intra-subnet HA traffic on **5432**, Storage/WAL traffic on
  **443**, outbound Entra connectivity and DNS. Microsoft automatically configures
  the **Microsoft.Storage service endpoint** and warns against removing it.
  NSG rules must preserve these dependencies while restricting client sources.
  [PostgreSQL private access][pg-private]
- PgBouncer supports Entra and uses the same server hostname on **6432**.
  Authorized migrations/admin operations can use direct private **5432**.
  HA restarts the pooler on the promoted server; it does not prevent disconnects.
  [PgBouncer][pgbouncer]
- Private Link is another database networking mode: approve a private endpoint,
  use **`privatelink.postgres.database.azure.com`**, and **disable public network
  access explicitly**. A private endpoint by itself does not do that. It is not
  an extra requirement on top of delegated private access.
  [PostgreSQL Private Link][pg-link]

**Recommendation:** One regional production VNet, separate delegated ACA and
database subnets, linked private DNS and Azure-provided DNS, no DB private
endpoint. Reserve address headroom for scale/revisions/Jobs/restore; exact CIDRs
are deferred. No forced tunnel, peering, private ACA DNS zone or paid resolver is
needed. Platform egress supplies HTTPS dependencies; required platform flows
must not be broken by overbroad deny rules.

### 3. Authentication, secrets and identities

- Flexible Server supports managed-identity Entra principals and Entra-only,
  password-only or combined authentication. An Entra administrator bootstraps
  ordinary SQL roles; workload identity does not make the API an administrator.
  Azure management RBAC and database grants are different.
  [Database Entra][pg-entra] [Managed-identity login][pg-mi]
- Tokens are passed as the PostgreSQL password. Use the Azure Identity SDK and
  ACA identity mechanism for **`https://ossrdbms-aad.database.windows.net/.default`**,
  with explicit user-assigned identity selection; use actual token expiry for
  new physical connections. Microsoft's VM examples are not ACA endpoint
  instructions. Driver/ORM refresh behavior is not proved by platform support.
  [Managed-identity login][pg-mi] [ACA identity][aca-mi]
- ACA supports both identity types. User-assigned identities survive app
  recreation and can be authorized before resource creation. Supported identity
  availability controls can keep a pull-only identity unavailable to application
  containers while the platform uses it for image pulls. [ACA identity][aca-mi]
- ACA supports Key Vault secret references and recommends them rather than
  literal production secret values. The reader needs **Key Vault Secrets User**.
  Versionless references refresh within **30 minutes** and restart active
  revisions using environment-variable references. Rotation is not instant.
  [ACA secrets][aca-secrets]
- Key Vault's public endpoint still requires authenticated authorized access.
  Network restrictions add defense in depth; "trusted services" is not blanket
  access for arbitrary Azure workloads. RBAC, soft delete and purge protection
  are important independently of networking. [Vault network][kv-network]
  [Vault security][kv-security]
- Permission to write an app or start a Job is high-trust: execution can use the
  resource's secrets/available identities even without `listSecrets`. Removing
  a secret-read action is not adequate isolation. [ACA secrets][aca-secrets]

**Accepted identity inventory per deployed target:**

1. Dedicated API user-assigned identity: limited runtime SQL grants and only its
   necessary Key Vault secret reads, plus narrowly scoped, mode-correct pull-only
   ACR permissions for its image.
2. Separate migration Job user-assigned identity: bounded DDL/schema grants,
   plus narrowly scoped, mode-correct pull-only ACR permissions for its image;
   not database administration or access to the OpenWeather key.
3. Human Entra administrator/group and a controlled, separately elevated private
   bootstrap/operations executor for principal mapping and recovery.
4. Existing ADR-006 federated publish/release/Terraform identities; no new runtime
   DB access for hosted CI, and no long-lived Azure client secrets.

A separate ACR-pull identity is **optional**, replacing the initial draft's third
required workload identity only when implementation/lifecycle constraints or a
concrete isolation requirement justify it. Microsoft supports identity
availability controls, but using them to isolate registry-token access is not a
mandatory requirement here. Default to reusing each workload identity for its
own image pulls; keep API and migration SQL privileges separate.

No Front Door identity is needed for CIDR/FDID validation. No database-server
identity is needed solely for client Entra login or service-managed encryption.
Do not add CMK identities unless a real CMK requirement arises.

**Comparison:** Managed identity removes the DB password and its rotation burden,
but adds token/pool integration and Entra dependency. A scoped native credential
in Key Vault has simpler conventional client integration but adds secret
creation/distribution/rotation and exposure risk. Retain that fallback only
for a verified limitation with human review; never use an administrator password,
silently switch authentication, or leave a permanent dual-mode exception merely
because initial integration takes effort.

**Key Vault contents:** OpenWeather key; application signing/session secrets
only if actually required by the later auth design; reviewed fallback DB
credential only if necessary. **Not** password hashes, account/preference data,
nonsecret identifiers/configuration or persisted access tokens. Password hashes
remain in PostgreSQL; Entra authenticates workloads, not weather-app end users.

Use a per-target application vault with RBAC and controlled administration.
The current recommendation uses its public authenticated HTTPS endpoint and
explicitly accepts that network exposure; it is not Microsoft's most restrictive
private-endpoint configuration. Do not buy NAT merely to allowlist dynamic ACA
egress. Reconsider a vault private endpoint/firewall if policy actually requires
network isolation, and prove platform secret-reference resolution before
restricting its endpoint.

Use controlled secret population outside plaintext Terraform inputs/state and
normal CI artifacts. References/identifiers may be configuration, but secret
values must not be copied into browser code, containers, logs or this record.
Plan provider rotation with overlap, and alert on retrieval/refresh failures.

### 4. TLS and encryption

- Use managed edge TLS, HTTPS-only ACA origin forwarding and origin certificate
  name/chain validation. ACA terminates TLS at managed ingress; the edge also
  terminates and re-encrypts, not TLS passthrough. [Front Door TLS][afd-tls]
  [ACA ingress][aca-ingress]
- Require TLS to PostgreSQL and PgBouncer, validating trusted roots **and the
  server hostname**, equivalent to libpq **`sslmode=verify-full`**, including
  reconnects. `sslmode=require`/trust-all are not sufficient.
  [Database TLS][pg-tls] [Database security][pg-security]
- Current retrieved documentation has sample inconsistencies: the TLS page uses
  `verify-all` in one recommendation, while the security overview correctly uses
  `verify-full`; the managed-identity tutorial includes a certificate-trusting
  sample. Do **not** copy those settings blindly. Use the actual driver's
  supported full verification and test wrong-host/untrusted-certificate failure.
- Keep root trust current; do not pin intermediates/leaf certificates.
  PostgreSQL encrypts data/replicas/PITR/backups with service-managed keys.
  Default Azure-managed encryption meets the present requirement; customer
  keys/HSMs create costs and recovery dependencies without an evidenced benefit.
  [Database TLS][pg-tls] [Database security][pg-security]

### 5. Front Door Standard security

Microsoft expressly limits Standard WAF to **custom rules**; custom filtering
and **rate-limit rules** are supported. Premium adds Microsoft-managed exploit
and managed bot rule sets and private-origin connectivity. Generic WAF overview
benefits must not be attributed wholesale to Standard. [WAF overview][afd-waf]
[Origin security][afd-origin]

Attach the custom policy to the intended public surfaces. Tune login/registration
and provider-sensitive route controls using detection/log evidence before
prevention, avoiding broad allow rules that short-circuit restrictions.
Rate limiting is distributed and uses the **socket IP**, so low limits can be
exceeded and shared proxies can affect legitimate users. It is not exact
per-account enforcement or a substitute for application abuse controls.
[Rate limits][afd-rate]

Preserve ADR-004's uncached authenticated/API responses and trusted-server
authentication/authorization. Front Door's global edge processing is not proof
of Europe-only processing, GDPR compliance, or resilience to a regional outage.

## Rejected unnecessary services

| Omitted service | Why not required now | Concrete reconsideration trigger |
| --- | --- | --- |
| Azure Firewall / NVA | No inspected/FQDN-controlled egress or central enterprise transit requirement; does not fix bypassed external ACA ingress | Mandatory outbound inspection or tightly controlled destination policy |
| NAT Gateway | Private DB routing does not require NAT; OpenWeather has no stated static source-IP requirement | Provider fixed-IP allowlist, measured SNAT exhaustion or explicit controlled-egress requirement |
| Application Gateway | Duplicates regional ingress behind accepted global edge; not needed for CIDR/FDID enforcement | A newly approved internal-origin/gateway-specific requirement |
| API Management | No API product/subscription/developer-portal/transformation requirement | Actual API governance or consumer management requirements |
| Bastion / jumpbox | No VM estate to administer; private Jobs provide a controlled SQL execution path | A justified operator/VM access requirement not met by Jobs |
| Permanent self-hosted/private CI runner | Hosted Actions can invoke Azure control plane; migration executes privately | A necessary private data-plane operation not served by a bounded Job |
| Multiple production VNets / hub-and-spoke | One application and same-region private DB need neither transit nor peering | Distinct independently administered trust domains, hybrid connectivity or shared platform requirements |
| ACA/PostgreSQL private endpoints | Standard origin remains public; DB delegated private access already isolates SQL | Separately approved private-origin or Private Link consumption requirement |
| DNS Private Resolver / VPN / ExpressRoute | Azure-provided DNS suffices; no mandatory hybrid/desktop SQL access | Real hybrid DNS or interactive private operator access requirement |
| Customer-managed keys / HSM | No key sovereignty/compliance requirement | Explicit lifecycle, recovery and key-control requirement |

Key Vault private connectivity is **optional hardening**, not rejected as
insecure or impossible. Separate nonproduction boundaries are still necessary
if deployed; omitting multiple production VNets does not authorize sharing
production identities/data with development.

## Security trade-offs and cost-benefit

- **Restricted public is not private-only.** The ACA endpoint remains routable;
  enforcement depends on updated ingress rules and correctly deployed FDID
  validation. Network/platform attack surface remains even when handlers deny.
- **Standard custom WAF is not managed exploit/bot protection.** The team owns
  custom rules and application security. Do not manually rebuild managed
  signature sets to pretend otherwise.
- **Public authorized Key Vault** exposes a data-plane endpoint, not anonymous
  secrets. RBAC/identity and auditing are the primary baseline; network
  restrictions would add defense in depth and additional dependencies.
- **No comprehensive egress inspection.** HTTPS, restricted secrets/roles, input
  validation and dependency maintenance matter, but compromised API code can
  still misuse its permissions or outbound network access.
- **Subnet security is not user isolation.** API authorization and limited SQL
  roles protect per-user data; migrations are deliberately more privileged.
- **Identity/secret dependencies affect recovery.** Test new connections,
  startup/rotation and operator access during failures; avoid unlogged defaults
  or permissive fallback.
- **Managed services still cost money.** Include ACA managed VNet resources,
  load-balancer/public-IP/data processing, private DNS, Key Vault operations,
  logs, egress and Jobs. The delegated DB path avoids separately billed private
  endpoints, and omitted gateways avoid fixed hourly costs/operations.

No new region-specific price quote, numeric cost saving, latency/SLO target,
spend approval or compliance assertion is made.

## Remaining validation items

These are concrete **delivery gates**, not claimed completed tests:

1. **Ingress feasibility:** Obtain the full current backend IPv4 prefix set;
   validate ACL/provider/API capacity and actual evaluated source address.
   Exercise safe prefix additions/removals and retrieval failure without an
   empty allowlist, overly broad aggregation or a temporary open origin.
2. **Bypass matrix:** Intended profile and HTTPS probes succeed. Direct-origin
   requests fail with absent and forged FDID, forged forwarded/probe headers;
   another Front Door profile fails. Cover default, revision, label and custom
   hostnames, authentication/API/health routes and unexpected ports.
3. **Private database:** Resolve the server FQDN privately from API/Job, connect
   on allowed ports and deny off-VNet/public access. Verify NSGs, HA/Storage/
   Entra/DNS flows, restore headroom and absence of public DB exposure.
4. **Identity and pools:** Bootstrap principal mapping through private execution;
   deny API DDL/admin/other-environment access; prove Job's separate privileges,
   actual-expiry token refresh, new pool connections, PgBouncer compatibility,
   scale/release overlap, failover reconnects and safe retry behavior.
5. **Secrets and TLS:** Deny unauthorized vault reads, verify native references,
   rotation delay/revision restart/rollback, registry identity isolation and
   certificate renewal; demonstrate rejection of bad certificates/hostnames.
6. **Operations and release:** Hosted runner starts/waits for private Job through
   control plane only; no public SQL hole. Prove local probes and authorized
   candidate smoke path, audited operator bootstrap/recovery and least privilege.
7. **Deployment prerequisites:** Validate the European region selected separately
   under ADR-002, capacity, ACA creation-time zone configuration, PostgreSQL
   zone-redundant HA and surviving capacity without silently weakening them.
   Confirm exact providers/roles, costs, incident/rotation ownership and alerts.

The largest unresolved implementation question is **live ACA origin restriction
feasibility/behavior**, not the availability of private PostgreSQL or workload
identity in principle. Do not label this production-ready until it passes.

## Acceptance, implementation risks and final human decision

**ADR-005 is Accepted by the requesting user on 2026-10-07.** Approval includes
Standard's restricted-public origin, the public authorized vault, custom-only
WAF and absence of comprehensive egress inspection. The deployment tests above
remain implementation validation items, **not blockers to this acceptance**.

A discovered inability to enforce the complete ACA source/profile boundary,
an unworkable private SQL operator/bootstrap path, or a newly mandatory
private-only origin/managed WAF/fixed or inspected egress requirement would
be a genuine design/deployment blocker. Raise it for human review instead of
silently allowing public DB access, header-only filtering or broad Azure ranges.
Region availability remains ADR-002's provisioning gate, not a selection here.

- **What was accepted:** The topology and mechanisms above, with separate API/
  migration identities and no mandatory third ACR-pull identity. ADR-005 first
  moved to Under Review after research and then to Accepted after human approval.
- **What was rejected/deferred:** Unnecessary network services; private vault
  hardening absent policy; DB credential fallback absent a verified limitation;
  exact CIDRs, thresholds, roles/providers and implementation tests.
- **Human-approved in this conversation:** The network/security architecture and
  identity simplification, plus documentation updates; not implementation,
  provisioning or spending.
- **Final human decision: Accepted.**
- **Approval reference/date:** Explicit user approval, 2026-10-07, preserved in
  the [human acceptance entry](#human-acceptance-2026-10-07).

## Verification method and limitations

Consulted current public official Microsoft documentation using Azure
documentation search/fetch on 2026-10-07. Fetched high-value pages to inspect
constraints instead of relying only on snippets. A guessed ACA Front Door URL
could not be retrieved; general Front Door origin guidance plus ACA-specific
ingress/VNet/NSG documentation underpin the recommendation instead. Search
Q&A results were not used as capability authority. The TLS/sample inconsistencies
above were preserved rather than treated as valid client settings.

Initial investigation git status was clean. Only the two user-owned documentation paths are
authorized for edits. Documentation scope/content/link checks and final git
status/diff inspection are the applicable local checks; no application test
suite exists for this architectural research. No tenant/resource inspection,
service-tag installation/capacity test, Azure provisioning, app/Terraform/
pipeline code generation, dependency installation, build, runtime, bypass,
DNS/SQL, token-expiry, failover or recovery tests were performed.

### Initial investigation documentation check results

- `git diff --check`: passed for the tracked ADR change.
- New investigation whitespace checked with `git diff --no-index --check`;
  no whitespace diagnostics. Its difference exit status is expected for a new
  file, not an application test failure.
- Both owned documents: reference definitions, local link targets, balanced
  fenced blocks and Pending decision text checked successfully; ADR-005 has
  Under Review status.
- Final scope inspection: tracked diff contains only ADR-005; git status contains
  that modification and the new investigation only. Nothing staged or committed.

### Acceptance follow-up scope and checks

At the start of this approval update, git status also contained another session's
changes to [ADR-002](../adr/ADR-002-azure-region.md) and the
[region investigation](07-azure-region-evaluation.md). Those paths are outside
this session's ownership and were left untouched. Their content hashes were
captured for comparison alongside final git status/diff verification. Both
region files changed concurrently during this follow-up, including ADR-002's
separate acceptance; this session neither edited them nor selected a region.
The repository-wide dirty state therefore contains other-session work as well
as these two owned files; it must not be mistaken for this session's edit scope.

This follow-up updates only ADR-005 and this existing investigation, including
Accepted status/date, the approval conversation and all current identity
summaries. Existing research/source links and the selected network topology
are preserved. Documentation checks cover references/local links, Accepted
status and date, whitespace, final change scope and comparison with pre-existing
concurrent region work. Hash comparison identifies concurrent region changes
without reverting or rewriting them. Nothing is staged or committed.

## Official sources

Retrieved **2026-10-07**. Recheck changing platform capabilities, prefix data,
provider limits and regional capacity before implementation.

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

## Accepted topology and direct answers

```text
Internet
  |
  v
Azure Front Door Standard (HTTPS; custom/rate-limit WAF)
  |
  v
Restricted PUBLIC Container Apps ingress
  | Backend IPv4 CIDR allowlist + exact X-Azure-FDID validation
  v
VNet-integrated ACA API
  | Private DNS + private routing + validated TLS + Entra token
  v
PostgreSQL Flexible Server (zone-redundant HA; no public access)

Same VNet: migration/approved operations Job -> private PostgreSQL
API -> HTTPS + managed identity -> Key Vault -> OpenWeather key
API -> HTTPS -> OpenWeather
GitHub Actions + OIDC -> Azure control plane -> private Job execution
```

- **Direct ACA access restricted how?** Supported app-ingress CIDRs from the
  maintained backend tag data **plus** early exact profile-header validation;
  not subnet NSGs, DNS, or the header alone.
- **VNet integration?** Yes, external workload-profiles ACA environment in the
  same VNet as the private database, with separate delegated subnets.
- **Private SQL path?** Delegated private-access Flexible Server, explicitly
  linked private DNS, server FQDN, private ports 6432/authorized 5432 and TLS.
- **PostgreSQL authentication?** API managed identity -> Entra token -> limited
  SQL role; separate migration/admin privileges. Prefer Entra-only after proving
  runtime and recovery. Reviewed password-in-vault fallback only if needed.
- **Key Vault?** OpenWeather key and actual application secrets, optional
  reviewed fallback DB credential; never user hashes/preferences or stored
  access tokens.
- **Managed identities?** Separate API and migration identities, each with its
  own scoped image-pull access by default. A dedicated registry-pull identity is
  optional only when justified; human/admin and CI federation remain separate.
- **Expensive services omitted?** Firewall, NAT, Application Gateway, APIM,
  Bastion/jumpbox, permanent private runner, multiple production VNets/peering,
  unnecessary private endpoints and DNS Resolver.
- **Acceptance blockers?** None demonstrated; human acceptance is recorded on
  2026-10-07. Live origin/identity/DNS/TLS/recovery tests remain implementation
  validation items before claiming a secure deployed system.
