# ADR-004: Public and global entry point

## Status

**Accepted: Azure Front Door Standard**.

- Human decision owner: Requesting user.
- Approval date: 2026-10-07.
- Approval reference: Explicit human direction to accept ADR-004 and select
  Azure Front Door Standard, preserved in the
  [AI investigation acceptance record](../ai/05-global-entry-point-evaluation.md#human-acceptance-2026-10-07).
- Accepted scope: Global entry-point service/tier and the restricted-public
  Container Apps origin model. Exact origin restriction/network-security
  enforcement remains for [ADR-005](ADR-005-network-security.md).
- This acceptance does not authorize implementation, provisioning or recurring
  spend, select frontend hosting, or change another ADR.

## Context

This small public weather application uses accepted Azure Container Apps compute,
with authentication, OpenWeather integration and PostgreSQL persistence.
The assignment explicitly values global latency, availability, security/privacy,
managed/PaaS services and best practical cost-benefit.

The current planning assumption is one primary European region with resilience
to application-instance and Availability Zone failures; multi-region origins and
regional disaster recovery are not currently required. Exact region, PostgreSQL
architecture and frontend hosting are separate decisions. No frontend platform
is selected by this ADR.

The [entry-point investigation](../ai/05-global-entry-point-evaluation.md)
compares documented capabilities and dated public pricing. No application
latency, origin restriction, health-probe or failover tests have occurred.

## Requirements

[Requirements](../requirements.md): N-01/N-02/N-03/N-05, A-01/A-02,
S-02, D-01/D-02; current assumptions AS-04/AS-05/AS-06/AS-10.

## Options considered

| Option | Benefits | Trade-offs / outcome |
| --- | --- | --- |
| **Front Door Standard: selected** | Global edge routing/transport acceleration, TLS/domain handling, custom filtering/rate-limit rules, health probing and edge observability; $35/month base plus usage | Restricted public origin, not Private Link; no Premium managed WAF/bot rules; extra configuration, monitoring and metered traffic |
| Front Door Premium | Standard delivery capabilities plus managed WAF/bot rules and private ACA origin connectivity | Approximately $330/month base plus usage and origin-side private infrastructure; disproportionate to current requirements |
| Direct Container Apps HTTPS | Strongest cheaper alternative; managed TLS/custom domains, fewer components; ACA can provide instance/AZ resilience independently | Gives up Front Door's global edge/transport/security benefits and edge diagnostics |
| Regional Application Gateway / DNS Traffic Manager | Regional gateway can protect an internal origin; Traffic Manager can route between multiple public origins | Gateway is not global transport acceleration/CDN and adds operations/cost; DNS routing has little value with one origin and supplies no TLS/WAF/cache proxy |

## Decision

Use **Azure Front Door Standard** as the application's public global entry point,
in front of a **restricted public Azure Container Apps origin**.

The origin remains publicly addressable at the Azure platform level. Restrict it
so normal application traffic is accepted only through the intended Front Door
path. [ADR-005](ADR-005-network-security.md) must finalize the precise enforcement
mechanism, trust boundaries and network-security configuration.

### Request flow

```text
Internet
  -> Azure Front Door Standard
  -> restricted public Azure Container Apps origin
```

Uncached API work continues from the European application to PostgreSQL and,
where applicable, OpenWeather. Front Door is not a database access layer.

Use HTTPS at the public edge and to the origin, with appropriate certificate
validation. Custom rate-limit/filtering rules available to Standard may be used
where appropriate; exact rules and thresholds require security review/tuning.

Authenticated/API responses must not be indiscriminately cached. Keep API,
authentication and preference routes uncached by default. Cache only explicitly
approved public content after privacy, freshness and cache-key validation.

Do not add multi-region origins, API Management or another regional gateway.
Premium-only managed WAF/private-link capabilities are not justified by the
current requirements. Frontend hosting and its eventual route/cache integration
remain undecided.

## Rationale

- **Assignment fit:** Global latency, availability, security and cost-benefit
  are explicit priorities, even for a small application. Managed edge routing,
  transport acceleration, TLS handling, edge controls, health probing and
  observability provide useful capabilities without operating a gateway.
- **Reasonable cost:** Standard provides these benefits for a $35/month base
  plus usage. The investigation's synthetic small cases total approximately
  $36-$44/month for the edge, not the complete application. This is an
  assignment-specific cost-benefit judgment, not proven financial savings.
- **Premium is disproportionate:** Its approximately $330/month base plus
  additional private-origin infrastructure buys isolation/managed security
  capabilities not required by the current scope. It is not intrinsically a
  faster tier for regional API/database execution.
- **Direct ingress is credible but less aligned:** It is cheaper, simpler and
  can meet public HTTPS and instance/AZ HA requirements. It is rejected here
  because it gives up the useful global edge/transport/security benefits.
- **HA is end-to-end:** Front Door is a useful managed edge, not a replacement
  for zonal compute, surviving capacity, database recovery, safe releases or
  graceful OpenWeather degradation.

## Security trade-off

**Choosing Standard explicitly accepts a restricted-public-origin model rather
than a private-only Container Apps origin.** Do not describe this origin as
private. Standard does not provide Premium's private-origin design.

The intended Front Door path must be enforced; merely pointing DNS at Front Door
does not prevent direct-origin bypass. The investigation discusses source
restriction plus profile identification, but it does not approve a final
implementation. ADR-005 owns the exact mechanism and its validation, including
default/revision/label endpoints, probes and trusted proxy/client addressing.

Custom WAF filtering/rate limiting is not Premium's Microsoft-managed exploit
and bot protection, and neither replaces application authentication,
authorization, password hashing, input validation or safe database access.

Front Door terminates/decrypts TLS at global edges before forwarding to Europe.
European origin hosting does not guarantee Europe-only processing or compliance;
privacy/disclosure, cache isolation and telemetry retention still need review.
Premium Private Link would not eliminate global edge processing.

## Latency and availability limitations

- Front Door can shorten connection setup, reuse origin connections, improve
  transport paths and serve approved cache hits near users. Actual benefit
  depends on geography/network/connection reuse; an extra proxy hop can be
  neutral or slower for some requests. No latency improvement has been measured.
- **Front Door does not make dynamic PostgreSQL-backed API processing
  geographically local.** Uncached requests still execute in the selected
  European application/database region, including database/provider work.
- One ACA origin already fronts its replicas/revisions. Front Door presence
  does not turn that single origin into multi-region failover or create a
  secondary healthy application/database.
- Health probing detects origin conditions; it cannot repair the origin.
  Single-origin probing can be disabled or configured where useful. With
  multiple origins, failover depends on probe sampling and viable alternatives;
  all-origins-unhealthy behavior is not a guarantee of successful responses.
- Front Door adds a service/configuration dependency. Provider availability
  guarantees are not evidence of end-to-end application HA.

## Cost consequences

The dated [investigation](../ai/05-global-entry-point-evaluation.md#2-total-cost-benefit-not-just-the-base-fee)
uses official Microsoft pricing and retail meters retrieved on 2026-10-07:

- Standard base: **$35/profile/month**, billed for deployed hours, plus requests
  and edge-to-client/edge-to-origin transfer. Costs vary by serving edge geography
  and volume; custom WAF rules are included without an additional WAF fee.
- Premium base: **approximately $330/profile/month**, plus usage. Its private
  ACA origin adds origin-side infrastructure charges even when application
  compute uses Consumption; the evaluated ACA management fee is approximately
  $73/month at 730 hours, not a complete private-network bill.
- Direct ingress avoids the edge profile/request charges but retains ACA
  ingress/networking, applicable egress and application-security ownership.

Include DNS/domains, monitoring/log retention, probe/origin activity, scaling,
frontend and other shared backend costs in the complete budget. Attacks may
increase metered traffic; cost alerts are not hard spending caps. Pricing
illustrations are not a traffic forecast or approval of recurring spend.

## Rejected alternatives

- **Premium:** Reconsider through human review if private-only origin access or
  managed WAF/bot coverage becomes mandatory; do not pay for them by default.
- **Direct ACA ingress:** Strongest cheaper alternative, rejected for this
  assignment's global edge/transport/security priorities, not because it cannot
  support secure HTTPS or zonal compute availability.
- **Additional regional gateway / API Management:** No current need justifies
  the added components; do not combine services merely for completeness.
- **Traffic Manager / multi-region origins:** No currently required independent
  origins to route/fail over between; DNS routing is not a replacement for the
  selected edge transport/security capabilities.

## Consequences

- Front Door Standard and the restricted-public-origin trade-off are accepted;
  precise networking/security remains under ADR-005.
- The team owns route/domain/certificate configuration, appropriate custom WAF
  controls, bypass prevention, cache safety, diagnostics/alerts and runbooks.
- Terraform must own reproducible infrastructure configuration, with pinned
  provider/API support and no competing configuration writers.
- Frontend hosting remains undecided. A future frontend may share routes/domain
  or use a separate delivery service; avoid automatically stacking duplicate
  CDNs and review browser CORS/cookie/redirect behavior.
- Exact European region, PostgreSQL architecture, numeric SLO/latency targets,
  traffic and spending remain separate decisions. No other ADR is changed.

### Validation items before delivery

These are required future checks, **not completed tests**:

- Finalize and test origin enforcement under ADR-005: legitimate intended-path
  requests, ordinary direct access, forged identifiers/other profiles where
  relevant, every exposed hostname/route, and health probes.
- Validate HTTPS/certificate renewal and origin identity checks, trusted proxy
  headers, client addressing, redirects, cookies and CORS/CSRF behavior.
- Prove authenticated/API cache isolation; allowlist public cache content only
  after a deliberate policy and release/purge validation.
- Decide/prove probe behavior and cost, readiness and zonal surviving capacity;
  do not unnecessarily couple weather-provider degradation to origin health.
- Measure representative geographic cold/warm and uncached API latency against
  direct ingress; test user journeys, dependency recovery and releases rather
  than claiming edge probe success establishes application availability.
- Validate Terraform coverage, diagnostics/request correlation, alerting,
  privacy/retention controls and a complete geographic usage-cost model.
- Test any failover behavior actually introduced; do not claim single-origin
  multi-region recovery or previously executed failover tests.

## References

- [Requirements](../requirements.md)
- [Entry-point investigation, dated evidence and human acceptance](../ai/05-global-entry-point-evaluation.md)
- [Accepted compute](ADR-001-compute-platform.md)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
- [Front Door tier capabilities](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-cdn-comparison)
- [Official pricing](https://azure.microsoft.com/en-us/pricing/details/frontdoor/)
- [Billing model](https://learn.microsoft.com/en-us/azure/frontdoor/billing)
- [Origin security](https://learn.microsoft.com/en-us/azure/frontdoor/origin-security)
- [Health probes](https://learn.microsoft.com/en-us/azure/frontdoor/health-probes)
