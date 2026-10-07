# Global entry point evaluation

## AI record and scope

- **Date / evidence retrieval:** 2026-10-07.
- **Author / tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related ADR:** [ADR-004: Global entry point](../adr/ADR-004-global-entry-point.md).
- **Related requirements:** N-01/N-02/N-03/N-04/N-05, S-02, A-01/A-02,
  D-01/D-02, I-05/I-07/I-08/I-12, and assumptions AS-04 through AS-10.
- **Problem/question:** Does this small, public, European-origin weather
  application benefit enough from Azure Front Door to justify its additional
  cost and operations? Which tier, compared with direct Container Apps ingress?
- **Prompt / investigation scope (faithful summary, not a transcript):** Read
  project instructions, requirements, architecture documentation, accepted
  ADR-001, proposed ADR-002 through ADR-006, and existing AI records. Compare
  Front Door Standard, Premium, and direct exposure on cost-benefit, global
  latency, TLS/domains, caching, dynamic processing, routing/health/failover,
  DDoS/WAF, private Container Apps origins/bypass prevention, frontend
  compatibility, Terraform, operations, observability, and lock-in. Use current
  Microsoft documentation and Azure pricing. Recommend a decision-ready
  direction without selecting a region, database architecture, or frontend
  platform; do not change ADRs or generate infrastructure/application code.
  Save the reasoning in this user-requested filename. No sensitive data was
  included; no redactions were needed.
- **AI recommendation:** Use **Azure Front Door Standard**, with custom WAF
  rate-limit controls and restricted public HTTPS Container Apps ingress.
  Do not buy Premium merely because the application has login or PostgreSQL.
- **Final human decision:** **Accepted: Azure Front Door Standard**, by the
  requesting user on 2026-10-07. Acceptance selects the global entry point and
  restricted-public-origin model only; exact enforcement belongs to ADR-005.
  It does not authorize recurring spend, implementation or provisioning.

### Human acceptance: 2026-10-07

The requesting user explicitly superseded the earlier no-ADR-edit instruction:

> Accept ADR-004.
>
> Azure Front Door Standard.

**Accepted request flow:** Internet -> Azure Front Door Standard -> restricted
public Azure Container Apps origin.

The human explicitly accepted a **restricted-public-origin model rather than
a private-only origin**. ACA remains publicly addressable at the Azure platform
level, with normal application traffic restricted to the intended Front Door
path. Standard does not provide Premium's private-origin design. ADR-005 must
finalize the exact origin restriction/network-security enforcement; the
technical mechanisms discussed in the original research below remain proposals,
not a selected implementation.

**Approval rationale:** The assignment values global latency, availability,
security and cost-benefit. Standard provides useful edge routing/transport
acceleration, TLS handling, edge controls, health probing and observability
at reasonable cost. Premium's approximately $330/month base plus private-origin
infrastructure is disproportionate. Direct ACA ingress is the strongest cheaper
alternative but gives up the selected global edge/transport/security benefits.

**Limits retained:** Dynamic PostgreSQL-backed API processing is not
geographically local; uncached requests execute in the selected European
application/database region. One origin is not multi-region failover.
Authenticated/API responses must not be indiscriminately cached. Multi-region
origins, API Management, another regional gateway and Premium-only managed
WAF/Private Link capabilities are not currently required. Appropriate custom
rate-limit/filtering rules may be used; precise controls still need review.

**Not selected or validated:** Frontend hosting remains undecided. This approval
does not select a region or PostgreSQL architecture, modify another ADR, or
establish completed latency, origin restriction, health-probe or failover tests.
Privacy/processing-location review and the implementation gates below remain
necessary; architectural acceptance is not deployment verification.

**Follow-up prompt (faithful summary):** Accept ADR-004 with the above service,
flow, rationale, security trade-off and limits; update this AI record while
preserving research/sources. Write only ADR-004 and this record, inspect only
their diff, verify Markdown/links, and do not stage, commit or modify others'
concurrent work. No secrets or personal application data were supplied.

### Project context read

Read [AGENTS.md](../../AGENTS.md),
[Copilot instructions](../../.github/copilot-instructions.md),
[requirements](../requirements.md),
[architecture alternatives](../architecture/alternatives.md),
[frontend foundation](../design/README.md), the [ADR index](../adr/README.md),
and ADR-001 through ADR-006. Read the AI convention and the numbered
investigations present at the start: [requirements analysis](01-requirements-analysis.md),
[compute evaluation](02-compute-platform-evaluation.md), and
[cost reassessment](03-cost-effectiveness-reassessment.md).
The separate [database evaluation](04-database-architecture-evaluation.md)
appeared during this investigation; its decision summary was cross-checked
without changing it or treating its database recommendation as accepted.

Azure Container Apps is the accepted application compute platform only.
One primary European region and instance/AZ resilience are current assumptions;
regional DR is not required. Exact region, PostgreSQL architecture, frontend
hosting, network topology, traffic, numeric latency/SLO targets, and budget are
not selected. Public application access does not require public PostgreSQL.
Unlike PostgreSQL, a fully private application origin is not an established
requirement. Historical App Service recommendations are not current decisions.

## 1. Options and verified comparison

Capabilities below are documented, not deployed or benchmarked for this project.
The cost-benefit ranking is architectural judgment.

| Dimension | Front Door Standard | Front Door Premium | Direct Container Apps HTTPS |
| --- | --- | --- | --- |
| Fixed entry cost | $35/profile/month plus requests and transfer | $330/profile/month plus requests and transfer; private ACA origin adds origin-side charges | No additional edge profile; existing ACA ingress/network charges and applicable egress remain |
| Global latency | Nearby edge TLS/TCP termination, reused origin connections, Microsoft backbone transport; static cache hits avoid origin | Same acceleration/caching fundamentals; not a faster tier simply because it costs more | Users connect to Europe; no added global application proxy/cache |
| Dynamic requests | Uncached requests still execute in European ACA and PostgreSQL; network setup/path may improve | Same regional processing constraint; Private Link can introduce an extra regional hop | European processing; can be competitive for nearby users and warm connections |
| TLS termination | At edge; configure HTTPS to origin with certificate-name validation | At edge; retain HTTPS over Private Link too | Managed ACA ingress TLS 1.2/1.3; HTTP redirects to HTTPS by default |
| Custom domains | Managed certificates or BYOC; ownership validation and DNS configuration | Same | Custom domains with managed certificate or BYOC; managed issuance/renewal has direct-DNS and CA-reachability requirements |
| Caching | Configurable per-route GET caching, query-string keys, purge, compression | Same core capabilities | No integrated global edge cache; browser caching and separately justified server-side caching remain possible |
| European origin routing | Configure the selected European ACA hostname as origin; no need to select that region now | Same, plus choose a supported nearby European Private Link location | DNS points directly to the European app |
| Health and failover | Probes and priority/weight/latency-based origin selection; useful failover requires another viable origin | Same, including eligible private origins | ACA readiness/ingress handles replicas and revisions; no cross-origin/global failover layer |
| DDoS/security | Inherent global infrastructure protection and edge capacity; custom WAF controls reduce unwanted origin traffic | Same infrastructure protection plus managed WAF rules, threat intelligence and bot rules | Azure baseline infrastructure protection, not equivalent to edge WAF/attack absorption; application abuse controls essential |
| WAF availability/cost | Custom match/rate-limit rules only, included without extra WAF fees; no Microsoft-managed rules or managed bot rules | Custom and managed WAF rules included in tier; tuning and logging still cost effort/money | No native ACA managed WAF; needs an additional gateway/service if required |
| Private origin connectivity | No Front Door Private Link | Native Private Link to ACA workload-profiles environments, including Consumption workloads | A private-only ACA origin cannot directly serve public browsers |
| Direct-origin exposure | Can deny ordinary direct requests with ACA IP allow rules plus profile-ID validation, but retains a public endpoint | Can disable environment public network access and use the approved private connection | Public endpoint deliberately accessible to users |
| Frontend compatibility | Can later route frontend and API together, or protect only API; no hosting choice implied | Same, but Private Link support varies by future hosting service | Compatible with co-hosted or separate frontend; cross-origin browser policy may be needed |
| Terraform | AzureRM resources for profile, endpoint, origins/groups, routes, domains, rules and WAF; provider pinning needed | Same plus ACA public-network setting, Private Link target/approval lifecycle | Smaller resource graph: ACA ingress, DNS/certificates and diagnostics |
| Operational complexity | Moderate: edge routes, DNS/TLS, WAF tuning, origin-prefix maintenance, cache safety and extra failure domain | Higher: Standard tasks plus private connection approval/connectivity and region considerations; managed rules reduce signature maintenance | Lowest entry-layer complexity, but abuse/security ownership remains in the application |
| Observability | Edge request/error/latency/cache metrics, access/WAF/probe logs and request correlation | Same plus managed-WAF/security reporting | ACA/application telemetry and external synthetic checks, without edge cache/WAF analytics |
| Azure lock-in | Edge rules, WAF policy, diagnostics and Terraform resources are Azure-specific; HTTP/DNS/Node/OCI/PostgreSQL remain portable | Adds Azure Private Link and managed security dependencies | Lowest incremental entry-layer lock-in; ACA itself remains Azure-specific |

Sources: [tier comparison][tiers], [acceleration][acceleration],
[TLS][tls], [domains][domains], [caching][cache], [routing][routing],
[probes][probes], [DDoS][ddos], [WAF][waf], [billing][billing],
[ACA ingress][aca-ingress], and [ACA Private Link integration][aca-afd].

### What Front Door actually improves

- **Static cache hit:** The asset can be returned at the edge without an
  application/database trip. This is the clearest latency and origin-load gain.
- **Static miss or uncached API request:** Edge connection establishment can be
  shorter, and longer-lived origin connections/backbone routing can improve the
  transport path. Benefits vary by geography, connection reuse and network.
  Front Door adds a proxy hop and can be neutral or slower for some requests.
- **It does not move API execution, password hashing, preference transactions,
  PostgreSQL queries, or OpenWeather calls near each user.** Uncached,
  database-backed work still reaches the selected European region. It does not
  remove speed-of-light RTT, application latency, database failover or provider
  latency. Premium does not change this.
- **Security/availability:** Rejecting abusive traffic before scarce API/hash/
  database capacity is useful. Global edge resilience is useful, but Front Door
  does not repair an unhealthy origin, create zonal replicas, replicate data, or
  provide regional DR. It also introduces a service/configuration dependency.

Current Microsoft Standard/Premium documentation describes **unicast PoP
selection**, split TCP and reusable origin connections. Do not copy the classic
service's Anycast description into this decision. No advertised multiplier is
treated as a measured improvement for this application. [Acceleration][acceleration]
and [routing architecture][routing] explain the mechanisms.

## 2. Total cost-benefit, not just the base fee

### Dated retail evidence

USD public PAYG prices retrieved on 2026-10-07; no tax, contract discounts,
reservations or spend approval. Monthly base fees are billed hourly for deployed
hours. Standard/Premium transfer/request prices depend on the **serving edge
billing zone**, not just the European origin. The examples use Zone 1 and its
first paid volume bands, not a forecast of actual geographic traffic.

| Meter | Standard | Premium | Evidence / meter ID |
| --- | --- | --- | --- |
| Profile base fee | $35/month | $330/month | [Pricing page][price]; retail IDs `1cdb45b3-b2f3-5b71-b173-86c6f0360eaa` / `68bdb0b8-f151-521b-a873-3f1acd0529b4` |
| Zone 1 client requests | $0.009/10,000 ($0.90/million) | $0.015/10,000 ($1.50/million) | `10455c17-0774-5e4c-be93-0f3c32b1beda` / `c79b85fd-1cb9-58f1-96b5-65dff38474bf` |
| Zone 1 edge-to-client transfer | $0.0825/GB | $0.0825/GB | `79b4d346-f8f7-55fe-8375-5943ea4e697c` / `fa528978-3833-589c-9a79-be1cc1b13907`; first-band rate verified for both |
| Zone 1 edge-to-origin request transfer | $0.02/GB | $0.02/GB | `a8fabff3-de14-5440-ba8d-3021353603b3` / `009c4fac-9fea-55f5-ba44-14a5745bc9cd` |
| Azure origin-to-edge response transfer | No Front Door charge or Azure-origin egress charge for this path | Same | [Billing][billing]; other origin processing charges remain |
| Custom WAF rules | Included | Included | [Billing][billing] and [tier pricing comparison][price-comparison] |
| Managed WAF/bot rules | Unavailable | Included | [WAF][waf] and [pricing][price] |
| ACA private-endpoint infrastructure | Not required by this option | $0.10/hour = $73/month at 730 hours in evaluated European regions | [ACA private endpoint billing][aca-private]; Sweden Central meter `f2e51aaf-6c2e-5bdb-acdd-45ece8b2d2db` |
| Direct-origin Microsoft-network egress illustration | $0 for first 100 GB if grant available, then $0.087/GB in first paid band | Not an additional response-path charge on top of Front Door | West Europe retail `Rtn Preference: MGN`, meter `9995d93a-7d35-4d3f-9c69-7a7fea447ef4`; evaluation location only |

Private Link is included **on the Front Door side** of Premium. It does not make
ACA private-endpoint infrastructure free. ACA documents a Dedicated Plan
Management charge even for Consumption workloads using private endpoints.
Front Door creates its managed private endpoint; do not automatically add a
second customer-VNet endpoint or ordinary endpoint-hour charge for that same
connection. Separately created customer private endpoints/DNS/operational
connectivity must be priced if actually needed. The origin documentation also
warns of Private Link resource charges; confirm meter attribution for the
eventual topology rather than claiming $403 is an all-in private architecture.

**Pricing trap resolved:** Retail searches also return legacy products labelled
`Azure Front Door Service`, with Standard Policy/Rule and managed-rules meters.
Those labels do not mean managed WAF is available on **Front Door Standard**.
Microsoft explicitly lists custom WAF rules as included for Standard/Premium;
the $5/policy and $1/rule style prices belong to classic. Do not mix classic
request/transfer/WAF prices into this estimate. Use product `Azure Front Door`
and `tierMinimumUnits` to distinguish Standard/Premium volume bands.

Rates were checked using the Azure pricing MCP tool and the
[official Retail Prices API][retail]. Raw API queries recovered volume thresholds
that the MCP summary did not expose. Zone 2/3 Standard first-band request prices
were $0.0108/$0.0199 per 10,000, with edge egress $0.115/$0.11 per GB and
edge-to-origin $0.06/$0.125 per GB: **a global bill is not a Zone 1-only bill**.
No final Azure region is selected by these illustrations.

### Usage sensitivity

No public-cache savings assumed: every request reaches the origin. Request bytes
to origin and response bytes to client are separate billed quantities. These
synthetic scenarios are not approved low/expected/peak traffic estimates.

`Standard = 35 + requests/10,000 * 0.009 + response GB * 0.0825 + request GB * 0.02`

Premium substitutes base 330 and request rate 0.015.

| Synthetic monthly usage | Direct response egress only | Standard edge subtotal | Premium edge subtotal | Premium + ACA private infrastructure subtotal |
| --- | --- | --- | --- | --- |
| 100,000 requests; 10 GB responses; 0.1 GB origin-bound requests | $0.00 | $35.92 | $330.98 | $403.98 |
| 1 million requests; 100 GB responses; 1 GB origin-bound requests | $0.00 | $44.17 | $339.77 | $412.77 |
| 10 million requests; 1,000 GB responses; 10 GB origin-bound requests | $78.30 | $126.70 | $427.70 | $500.70 |

Direct egress assumes the first 100-GB grant remains available and the illustrated
Microsoft-network rate applies; actual service/subscription billing must be
confirmed. It is not the cost of running a direct application. Front Door has no
corresponding assumed 100-GB free edge grant. Caching avoids some origin requests
and request transfer, but edge request/response-transfer charges remain.

All columns exclude shared ACA compute, platform LB/IP/data processing,
PostgreSQL, OpenWeather, frontend hosting, domain/DNS, telemetry ingestion/
retention, alerts, backups, delivery, nonproduction, support and engineering.
The private option can change network topology/costs; the table does not assume
it removes existing network charges. Probes and traffic that defeat ACA idle
billing can add origin cost. Attacks can increase metered usage even with WAF;
budget alerts are not a hard spending cap.

### Why pay for Standard on this small application?

The prior compute investigation illustrated roughly $313-$341/month in partial
ACA-plus-HA-database subtotals. This is context, not a selected database or budget.
Standard's low-volume $36-$44 is approximately 11-14% of that baseline; Premium
with ACA private infrastructure adds approximately $404-$413, more than that
entire partial backend baseline. Recompute percentages if the independently
evaluated PostgreSQL architecture materially changes the floor.

**Direct is cheaper and simpler, and can satisfy public access, TLS and AZ HA.**
HA alone therefore does not justify Front Door. Nor can a small weather site
claim that CDN savings will pay for the profile without workload evidence.

Nevertheless, this assignment expressly values practical worldwide latency and
strong internet-facing security, not just a cheap European demo. Standard buys
usable uncached transport acceleration, global edge attack absorption, custom
rate limits protecting login/hash/provider capacity, centralized TLS/domain
management and edge diagnostics at a modest absolute cost. These benefits do
not depend on choosing frontend hosting, adding another region, or publicly
caching personal data. Reusing the profile for suitable future static delivery
is an additional opportunity, not the primary assumption.

This is an overall cost-benefit judgment, **not proven net financial savings or
a latency SLA**. Prefix updates, WAF tuning and incident work must be counted.
If users are mostly European, a future frontend already provides sufficient
delivery, and measured API improvements are negligible, direct ACA is the
strongest cheaper fallback. Premium's additional $295 base plus roughly $73
ACA private infrastructure is not justified by the current threat/isolation
requirements; it becomes relevant if private-only origin or managed WAF is a
mandatory acceptance condition.

## 3. Security, privacy and origin bypass

### Recommended Standard boundary

Public browser -> Front Door Standard/custom WAF -> **restricted public HTTPS
ACA origin** -> separately evaluated non-public PostgreSQL.

- Allow Front Door backend source ranges at **ACA app ingress**, and reject all
  other external source ranges. Also validate the exact profile's
  `X-Azure-FDID` before application handlers: other customers use the same
  Front Door IP ranges. The header is an identifier, not a secret; checking
  only the header or only IP ranges is insufficient. [Origin security][origin-security]
- ACA ingress documents IPv4 **CIDR rules**, not App Service-style service-tag/
  header restriction expressions. Obtain current `AzureFrontDoor.Backend`
  prefixes from Microsoft's published data and maintain reviewed updates under
  Terraform ownership. Do not freeze a copied IP list indefinitely.
  [ACA IP restrictions][aca-ip]
- **Do not claim an NSG on the external workload-profiles environment's subnet
  locks down public ACA ingress.** Microsoft says this ingress bypasses that
  subnet. The restriction must be at the supported ingress boundary, not an
  ineffective subnet rule. [ACA firewall guidance][aca-firewall]
- Verify the complete prefix set fits supported ingress limits and that source
  interpretation, probes, default/revision/label hostnames and every exposed
  route enforce the boundary. Test ordinary direct access, forged FDID,
  another profile and legitimate Front Door traffic. This is an implementation
  acceptance test, not a completed security test.
- Keep HTTPS/certificate checks on the origin, using the generated ACA hostname
  and platform certificate where appropriate. Public custom-domain TLS belongs
  at Front Door; do not depend on ACA managed custom-domain renewal behind an
  indirect CNAME or a blocked CA-validation path. [ACA certificates][aca-cert]
- Configure limited custom rate rules for authentication/provider-sensitive
  paths and a sensible broader flood control; tune in detection before
  prevention. WAF rate limits are distributed approximations, not exact
  per-account quotas. Keep application-level authorization, account abuse
  controls, bounded input/body sizes and safe database queries. Do not attempt
  to recreate Microsoft's managed exploit-signature rules manually. [Rate limits][rate-limit]

**Can ACA remain inaccessible directly from the public internet?** With Standard,
ordinary direct application requests can be denied, but the origin still has a
publicly addressable endpoint and relies on filtering/application validation.
It is **not a private-only origin**. With Premium and approved Private Link,
ACA environment public network access can be disabled so there is no accepted
public-origin path. Use a workload-profiles environment; a Consumption workload
profile is supported and does not require Dedicated compute. Per-app ingress
visibility and environment public access are distinct settings. [ACA integration][aca-afd]
and [networking][aca-network] document the topology.

If Premium is needed, choose a supported European Private Link location close
to the origin, approve its connection and disable public network access.
Supported European locations include France Central, Germany West Central,
North Europe, Norway East, UK South, West Europe and Sweden Central. If the
origin location is unsupported, Microsoft permits a nearby supported location,
with extra latency. This is a selection constraint, not a choice of ADR-002.
[Private Link][private-link]

### Privacy and limits

Both tiers terminate/decrypt TLS at globally distributed edges before
re-encrypting to Europe. **European application/database hosting does not imply
Europe-only request processing, caches or logs.** Premium Private Link does not
change edge decryption geography. Geo-blocking clients is not a residency
guarantee. Confirm applicable processing/disclosure/retention constraints; use
sanitized logs with controlled access and retention, no secrets in URLs, and no
password/token/body logging. Front Door is not proof of GDPR compliance.

Standard custom rules are not managed OWASP/signature coverage or managed bot
protection. Premium supplies those capabilities, but neither tier replaces
secure password hashing, per-user authorization, session/CSRF controls,
parameterized queries, dependency maintenance or provider quota safeguards.
Inherent Front Door DDoS protection is not the paid Azure DDoS Protection
cost-protection/response-team offering. The newer adaptive HTTP DDoS ruleset is
Premium **preview** and is not a required dependency of this recommendation.
[DDoS][ddos] and [HTTP DDoS ruleset][http-ddos]

## 4. Caching, HA and frontend interaction

### Deliberate cache policy

- Disable edge caching on **all API/authentication/preferences routes** by
  default, including authenticated GETs, redirects and error responses. Send
  appropriate private/no-store headers as defense in depth.
- Only allowlist explicitly public static assets for caching, with versioned
  URLs, suitable TTLs and a purge/release procedure after hosting is selected.
  Front Door only caches GET; POST login/registration and writes are proxied.
- Do not rely on Authorization or cookies alone to prevent shared caching.
  Microsoft warns of user-data leakage from misconfiguration and documents
  caching exceptions for authorization plus permissive cache headers.
- Public weather GET caching is optional and **not needed for accepting
  ADR-004**. Before enabling it, verify OpenWeather terms, freshness, anonymity,
  complete city/unit/language/query cache keys, and error/stale behavior. Private
  saved locations are not public cache content. Server-side provider caching is
  a separate concern.

Source: [Front Door caching][cache].

### Health probes and availability

One ACA application endpoint fronts its own replicas/revisions. Do not create
one Front Door origin per replica or pretend revisions are independent regional
stamps. ACA readiness, zone redundancy, surviving capacity and PostgreSQL
recovery establish instance/AZ resilience independently of Front Door.

With one configured origin, Front Door has **no alternative origin to fail over
to**. Probes can be disabled for a single-origin group; if enabled, use a cheap
HTTPS HEAD health endpoint returning 200 when ready. Account for geographically
distributed probe load and ACA activity billing. Do not make every probe hash
passwords, write PostgreSQL data or call OpenWeather. Distinguish critical
dependencies from the weather provider's intended degraded operation.

With multiple genuinely independent origins, both tiers can exclude unhealthy
origins and use priority/weight/latency rules. Failover uses probe sampling, not
instantaneous detection. **If all origins fail probes, Front Door routes across
them rather than guaranteeing a healthy response.** It cannot invent a healthy
database or restore lost state. Regional DR remains outside this assignment's
current assumption, and no secondary origin/region is recommended.

Front Door has its own global resilience but is still an additional possible
service/configuration failure. No provider SLA is substituted for end-to-end
availability testing. Redundant CDNs/entry paths are disproportionate here.
[Probes][probes] and [Well-Architected guidance][well-architected]

### No frontend hosting selection

Standard can protect just the API at an API domain while an independently chosen
frontend serves elsewhere. Alternatively, a future single public domain can
route API paths to ACA and other paths to the chosen frontend origin, potentially
simplifying browser same-origin behavior. Neither layout is approved here.

If frontend hosting already has integrated global delivery, do not automatically
stack another CDN for static files. Evaluate its domain, cache, authentication,
WAF and origin-restriction behavior first. Private Link support is origin-specific;
Microsoft currently excludes Azure Static Web Apps from Front Door Private Link.
Premium therefore would not automatically privatize every possible future
frontend. [Private Link][private-link]

Route/host-header choices must preserve correct redirects, cookie domains,
CSRF/CORS behavior and trusted proxy/client addressing. ACA warns that forwarded
address chains need validation; blindly trusting user-supplied
`X-Forwarded-For` defeats reliable abuse controls. [ACA ingress][aca-ingress]

## 5. Other first-party alternatives and operations

| Alternative | Genuine relevance | Why not recommended here |
| --- | --- | --- |
| Azure Application Gateway WAF v2 -> internal ACA | Regional managed WAF/TLS proxy can expose the app while ACA has no public origin; Microsoft documents this integration | Not a global CDN/transport-acceleration service. Adds gateway fixed/capacity billing, subnet/private DNS, certificate ownership and scaling/zone configuration. Reasonable if Europe-only edge processing or regional private ingress is mandatory, not a simpler default for this global-latency assignment |
| Azure Traffic Manager | DNS health/routing across multiple public origins; lower feature/operational scope than a global HTTP proxy | One European origin gives no alternative destination. No TLS termination, caching, WAF, private-origin reachability or split TCP; DNS/TTL caching delays failover. Also indirect CNAMEs can conflict with ACA free managed certificates |

These are comparisons, not additional components to combine with Front Door.
Application Gateway for Containers targets Kubernetes/AKS, not a required ACA
component. API Management's API-product/governance capabilities are not needed
for this small private application API; adding it just for routing/rate limits
duplicates simpler controls. New classic Front Door/CDN profiles are not viable
choices; use supported Standard/Premium if an edge is selected.
Sources: [Azure load-balancing choices][load-balancing],
[ACA/Application Gateway integration][aca-gateway], [Traffic Manager][traffic-manager],
and [tier/lifecycle comparison][tiers].

### Terraform and operational evidence

Microsoft's [Front Door Terraform quickstart][terraform] demonstrates AzureRM
Standard/Premium resources. Current provider documentation exposes origin
`private_link` with `managedEnvironments`, and ACA environment
`public_network_access`. Private connection approval has a separate lifecycle;
provider docs warn it must be approved manually. If automating that lifecycle,
verify an appropriate pinned AzureRM/AzAPI resource/API rather than assuming
the origin block approves it. No Terraform code/plan was generated or tested.
[Origin provider reference][tf-origin] and [environment reference][tf-environment]

For Standard, Terraform should own routes, WAF/domain association, diagnostics
and reviewed ingress-prefix updates. Define drift/expiry alerts and a recovery
runbook; adding an edge is not zero operational effort. Premium adds private
approval/DNS/connectivity troubleshooting and managed-rule false-positive tuning.
Direct ingress has fewer moving parts, but still needs certificate, traffic,
abuse and availability monitoring.

Front Door access/WAF/probe logs are **not enabled by default**. Configure
diagnostic destinations, retention and alerts deliberately and price ingestion.
Observe origin health, edge/origin latency, errors, WAF blocks, cache hit ratio
and billable bytes/requests. Correlate `X-Azure-Ref` with application traces.
Keep user/IP/URL data under privacy controls. Use synthetic user journeys from
representative geographies, not only edge probe success. [Monitoring][monitor]

HTTP/domain/container portability is retained, but edge policy, diagnostics,
origin restriction and Private Link resources are Azure-specific. Premium can
be an in-place upgrade from Standard; there is no seamless Premium-to-Standard
downgrade tool. Do not choose Premium assuming a trivial later cost reduction.
[Tier comparison][tiers]

## 6. Original recommendation and remaining implementation issues

The research recommendation below was accepted for the entry-point service/tier
and restricted-public-origin model; see [human acceptance](#human-acceptance-2026-10-07).
Its original approval caveats are preserved as evidence, not a current Pending
decision. ADR-005 still owns precise enforcement.

1. **Use Front Door:** Yes, as a modest managed global entry/security layer.
   It is justified by the combination of N-03/S-02/N-02/N-05, not by a claim
   that the small app intrinsically needs a CDN or that HA requires it.
2. **Tier:** **Standard**. Initially one European ACA origin, HTTPS on both
   legs, custom WAF rate rules, ingress bypass controls, diagnostics, and API
   caching disabled. This does not choose frontend hosting or the Azure region.
3. **Why worth its cost:** Approximately $36-$44/month in the synthetic small
   cases buys useful transport acceleration and early abuse rejection plus
   managed TLS/routing/visibility without gateway operations. This is a
   reasonable assignment-specific premium over direct exposure; benchmark
   benefits before making quantitative performance claims.
4. **Deliberately unnecessary:** Premium managed exploit/bot rules and private
   origin connectivity under current requirements; regional gateways in series;
   API Management; multiple regions/origins or database replication for edge
   failover; redundant CDN profiles; public caching of user data; preview origin
   managed-identity authentication/adaptive HTTP DDoS dependencies; elaborate
   rules or custom exploit-signature maintenance. Do not enable features merely
   because the service supports them.
5. **Original acceptance caveats:** No missing platform fact prevents choosing Standard
   now. The human must explicitly accept **restricted public rather than
   private-only ACA ingress** and global edge TLS processing. If private-only
   origin or managed WAF is mandatory, Standard must not be accepted: use Premium
   and reprice origin-side infrastructure. If processing must remain exclusively
   in Europe, neither Front Door tier resolves that; investigate the regional
   alternative instead. Existing requirements do not establish either stricter
   condition, so they are explicit approval caveats, not reasons to keep
   researching indefinitely.

**Implementation gates, not blockers to a platform-level ADR:** Select an eligible
European region under ADR-002; validate prefix-count/source interpretation and
bypass tests; pin Terraform properties; prove cache isolation, TLS/cookies/
redirects, probe behavior and zonal readiness; benchmark direct versus Front Door
from representative European and distant clients on cold/warm connections and
uncached authenticated journeys; establish SLOs, traffic and a complete
geographic cost/retention budget. PostgreSQL architecture and frontend hosting
remain separate decisions. If the restriction design cannot be made reliable,
do not ship an unrestricted origin behind a nominal WAF: revisit the tier.

### Rejected alternatives and uncertainty

- **Premium:** Stronger and the right choice for required private origin/managed
  WAF, but its roughly $368/month fixed premium over Standard including evaluated
  ACA private infrastructure is disproportionate to current requirements.
- **Direct ACA:** Strongest simpler alternative, technically valid for public
  TLS and AZ HA; rejected in this recommendation because it omits the modest
  practical global transport and edge abuse controls valued by this assignment.
  Reconsider if actual geography/latency and cost evidence remove those benefits.
- **Application Gateway / Traffic Manager:** Relevant under different network/
  multi-origin requirements, not selected for the reasons above.
- **Uncertainties:** No workload/geographic measurements, threat-model acceptance,
  live capacity/quotas, deployed ingress/proxy behavior, actual log volume, full
  frontend/database bill or end-to-end recovery evidence. Prices and provider
  schemas can change. Capability documentation is not deployment verification.

### What was verified and saved

Read the repository decision context and retrieved current official Microsoft
capability/billing documentation and public Azure retail meters; checked pricing
band/product distinctions and calculated the table locally. Supplemented
Terraform coverage with the provider's own public reference. Some guessed
caching/reliability URLs returned 404; successful current sources below were
used instead. Search results were used to locate documentation, not Q&A-based
service guarantees.

No tenant resources, secrets, account data, application code, deployments,
Terraform plans, load tests or failover tests were inspected/executed. This
record preserves the investigation, recommendation, rejected suggestions and
limits, not a raw transcript. The original research did not modify any ADR.
The subsequent explicit human approval updated only ADR-004 and this record;
no other ADR or region/database/frontend decision was modified.
**Final human decision: Accepted - Azure Front Door Standard.**

## Sources

Retrieved 2026-10-07. Microsoft sources support platform/cost claims; Terraform
provider sources support schema coverage, not Azure service guarantees.

[tiers]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-cdn-comparison
[price]: https://azure.microsoft.com/en-us/pricing/details/frontdoor/
[billing]: https://learn.microsoft.com/en-us/azure/frontdoor/billing
[price-comparison]: https://learn.microsoft.com/en-us/azure/frontdoor/understanding-pricing
[retail]: https://prices.azure.com/api/retail/prices
[acceleration]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-traffic-acceleration
[tls]: https://learn.microsoft.com/en-us/azure/frontdoor/end-to-end-tls
[domains]: https://learn.microsoft.com/en-us/azure/frontdoor/standard-premium/how-to-add-custom-domain
[cache]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-caching
[routing]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-routing-architecture
[probes]: https://learn.microsoft.com/en-us/azure/frontdoor/health-probes
[ddos]: https://learn.microsoft.com/en-us/azure/frontdoor/front-door-ddos
[waf]: https://learn.microsoft.com/en-us/azure/frontdoor/web-application-firewall
[rate-limit]: https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/waf-front-door-rate-limit
[http-ddos]: https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/http-ddos-ruleset
[origin-security]: https://learn.microsoft.com/en-us/azure/frontdoor/origin-security
[private-link]: https://learn.microsoft.com/en-us/azure/frontdoor/private-link
[aca-afd]: https://learn.microsoft.com/en-us/azure/container-apps/how-to-integrate-with-azure-front-door
[aca-private]: https://learn.microsoft.com/en-us/azure/container-apps/private-endpoints-with-dns
[aca-network]: https://learn.microsoft.com/en-us/azure/container-apps/networking
[aca-ingress]: https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview
[aca-ip]: https://learn.microsoft.com/en-us/azure/container-apps/ip-restrictions
[aca-firewall]: https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration
[aca-cert]: https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates
[aca-gateway]: https://learn.microsoft.com/en-us/azure/container-apps/waf-app-gateway
[well-architected]: https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-front-door
[load-balancing]: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview
[traffic-manager]: https://learn.microsoft.com/en-us/azure/traffic-manager/traffic-manager-overview
[terraform]: https://learn.microsoft.com/en-us/azure/frontdoor/create-front-door-terraform
[tf-origin]: https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/r/cdn_frontdoor_origin.html.markdown
[tf-environment]: https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/r/container_app_environment.html.markdown
[monitor]: https://learn.microsoft.com/en-us/azure/frontdoor/monitor-front-door
