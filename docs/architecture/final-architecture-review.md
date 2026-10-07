# Final architecture review

- **Date:** 2026-10-07.
- **Reviewer:** AI assistant using Copilot SDK in VS Code.
- **Scope:** Whole-system design against [requirements](../requirements.md),
  accepted ADR-001 through ADR-006, [alternatives](alternatives.md), and
  [AI investigations 01-08](../ai/09-final-architecture-review.md#evidence-reviewed).
- **Conclusion:** FINAL ARCHITECTURE APPROVED FOR IMPLEMENTATION.
- **Frontend follow-up:** 2026-10-07; React + TypeScript SPA on Azure Storage
  static website hosting, delivered by the existing Front Door Standard.

The architecture is complete enough to implement the frontend/backend,
Terraform and GitHub Actions delivery. This review does not provision anything,
authorize recurring spend, approve outstanding application policy/design
proposals, or claim measured availability/latency. Production validation gates
remain mandatory. No accepted ADR needs reopening.

## Challenge and disposition

| Area | Challenge / finding | Final disposition |
| --- | --- | --- |
| Compute / PaaS | Functions Flex is cheaper at the smallest previously compared HA allocation. ACA adds container maintenance and registry/network costs. | Retain [ADR-001](../adr/ADR-001-compute-platform.md): a conventional API, immutable OCI artifacts and revision recovery justify the modest premium. Use Consumption within a workload-profiles environment; no Dedicated capacity without measured need. |
| Region | Sweden is not proven to have the best global latency. France may be better for some western European users. | Retain [ADR-002](../adr/ADR-002-azure-region.md): Sweden Central supports the documented zonal architecture and has the lowest qualifying database cost in the evaluated set. Actual quota/two-AZ allocation is still a gate; France is a revalidated fallback, not a second region. |
| PostgreSQL | The matching continuously running standby dominates the bill for a small data set. Can it be removed? | No: Burstable, single-server, stopped production and same-zone HA do not satisfy the accepted AZ failure scope. Retain [ADR-003](../adr/ADR-003-database.md). D2s_v3 remains an accepted approximately $10.92/month cheaper sizing fallback if sufficient; do not remove HA to save money. |
| Global entry | Direct ACA HTTPS is cheaper and already supports zonal compute HA. One origin gives Front Door no regional failover target. | Retain [ADR-004](../adr/ADR-004-global-entry-point.md): Standard's transport acceleration, edge abuse controls and visibility are useful together. They are not geographically local API execution or demonstrated net savings. Premium's much higher fixed cost is not justified by the accepted public-origin trade-off. |
| Networking / security | Standard leaves a public origin; prefix maintenance and application profile validation add operational work. Private SQL can obstruct CI/admin access if the execution path is omitted. | Retain [ADR-005](../adr/ADR-005-network-security.md): ACA ingress backend IPv4 allowlist **plus** exact early FDID validation, delegated private PostgreSQL/DNS, and private Jobs are proportionate. Subnet NSGs cannot secure external ACA public ingress. Live ACL feasibility is the highest-risk validation item. |
| Identity / secrets | Entra tokens and Key Vault introduce startup/reconnection/rotation dependencies; a public authorized vault is not network-isolated. | Keep two separate API/migration workload identities, least-privilege SQL grants, Key Vault references and tested token refresh. A third pull identity, vault Private Link or native DB credential requires a concrete reason, not default complexity. |
| Delivery / Terraform | Both writers touch the same app; infrastructure changes can create revisions. Private migration and candidate testing must preserve network controls. | Retain [ADR-006](../adr/ADR-006-cicd-strategy.md): narrow property ownership, serialized mutation, exact-plan approval, digest deployment, private migration Job and verified revision promotion/rollback. Provider support remains unproven until implementation checks pass. |
| Frontend | A React SPA needs static files, not another application runtime, auth service or global edge. | Select a dedicated Standard StorageV2 **ZRS** static website account in Sweden Central, behind the existing Front Door. This completes the expressly deferred frontend scope without changing ADR-001 through ADR-006. |

**No accidental customer-operated IaaS dependency:** ACA and Flexible Server
use provider-managed hosts; ACA's billable managed load balancer/public IPs do
not require the team to administer VMs. VNet, delegated subnets, NSGs and DNS
are necessary supporting infrastructure, not a self-managed host estate.
No VM/jumpbox, AKS cluster or permanent self-hosted runner is required.

**Keep omitted:** Premium Front Door, Application Gateway, API Management,
Firewall/NVA, NAT solely for private SQL/vault access, Bastion, hub-and-spoke,
duplicate database private endpoints, DNS Private Resolver, external PgBouncer,
read replicas, multi-region replication, customer-managed keys and a mandatory
three-environment deployment. No current requirement justifies their expense.
ACR Basic is a credible low-cost baseline: current documentation gives all
tiers automatic zone resilience in AZ regions; Premium is not needed merely
for that feature.

## Cost-benefit boundary

The existing 2026-10-07 USD PAYG ledgers, not a new price quotation, give:

- PostgreSQL D2ds_v5 cross-AZ primary/standby, 32 GiB each:
  **$281.78/month** compute/storage; D2s_v3 equivalent **$270.86/month**.
- Illustrative two small ACA replicas, managed LB/two public IPs and ACR Basic:
  **$42.44-$70.04/month**, before requests/grants and other usage.
- Front Door Standard: **$35/month base**, approximately **$36-$44/month**
  in the earlier synthetic small traffic cases.

Together these yield roughly **$360-$396/month in partial sensitivity
subtotals**, not a forecast, minimum all-in bill or approved budget. API activity
and edge traffic examples are independent, unvalidated assumptions.
Add frontend delivery, DNS, Key Vault, state/protected-plan storage, logs/alerts,
backup/WAL excess, network processing/egress, OpenWeather plan, release overlap,
Jobs, restore tests, CI, nonproduction and operational effort without double
counting network meters. Requote with measured low/expected/peak usage.
Continuous production AZ resilience has a real cost floor; there is no verified
equivalent first-party scale-to-zero PostgreSQL alternative in the research.

Frontend hosting adds metered Hot ZRS blob capacity, read/write operations and
retained release artifacts, plus incremental Front Door requests/transfer.
Static website enablement has **no separate hosting fee** and there is no new
edge profile/base fee. ZRS costs more than LRS but preserves the required AZ
failure protection; tiny file volume is not a reason to weaken that boundary.
No precise frontend monthly price or claim that Storage always beats a bundled
plan at every traffic volume is made. Include it in the full usage budget.

## Final frontend hosting decision

**Azure Storage static website behind the existing Front Door Standard is the
best practical low-cost fit for this React + TypeScript SPA.**

| Realistic option | Cost, HA and operational fit | Decision |
| --- | --- | --- |
| Storage static website, Standard StorageV2 / Hot / ZRS | Pay for stored bytes and operations, no static-hosting subscription fee. Managed cross-AZ storage; existing Front Door supplies global caching, public TLS, headers and routing. Simple Terraform resources and Entra-authorized file uploads; a small SPA rewrite/release policy is required. | **Selected**, in Sweden Central, with public build files in `$web`. |
| Static Web Apps Free | Zero hosting plan fee within quotas, global static delivery and convenient SPA fallback/previews. **No SLA**; official manual Front Door integration targets Standard. Not an equivalent production HA baseline merely because the content is small. | Not selected for the submitted HA architecture. |
| Static Web Apps Standard | Production plan with SLA, built-in global delivery, routing/headers, preview environments, auth and managed Functions integration. Supports an existing Front Door, so another profile is not mandatory, but global-delivery capability overlaps and the per-app hosting charge buys little here. | Adds little value: auth/API already belong to ACA, TLS/edge already to Front Door, and previews are not required. Do not enable its separate enterprise-edge add-on. |
| Serve SPA from ACA / App Service | Technically possible; ACA co-hosting avoids a storage account, but ties frontend releases/cache misses to backend capacity and availability. App Service introduces a paid runtime/plan for files. | Neither is clearly better: retain a cheap independent static origin, not another runtime or API-coupled frontend release. |

Terraform owns the dedicated account, ZRS/static-site settings (`index.html`,
`404.html`), RBAC, Front Door origin/group/routes/rule sets, public domain/TLS
and diagnostics. Use existing AzureRM storage/static-website and Front Door
resources with pinned versions; verify their Entra data-plane configuration.
Do not manage release blobs in Terraform or mix this account with state,
saved plans, user uploads, secrets or application data. No HNS/SFTP, private
endpoint, geo-replication, extra CDN or frontend managed runtime is needed.

### One public domain and route contract

Use **one canonical HTTPS public origin** at Front Door. React uses relative
`/api/v1/...` requests, consistent with the [API contract](../backend/API_CONTRACT.md);
there is no browser cross-origin hop and **production CORS is unnecessary**.
Do not enable wildcard CORS. Local development uses a dev-server API proxy.
Preserve the contract's secure host-only cookie and CSRF/Origin validation;
same-origin routing does not remove CSRF or backend authorization requirements.

| Front Door match | Origin / behavior | Cache policy |
| --- | --- | --- |
| `/api` and `/api/*` | ACA origin group; keep the full path, including `/api/v1`, method, body and query. No SPA rewrite and no static-origin failover. | **Disabled**, including public weather, auth/session/CSRF, preferences, redirects and API errors; backend `Cache-Control: no-store`. |
| `/assets/*` | Storage **static website** endpoint; unchanged hashed asset paths, not the Blob API hostname or a `/$web` origin path. Build all immutable JS/CSS/images/fonts under this prefix. | Cache public immutable content; compression for appropriate MIME types. |
| `/*` (less specific than API/assets routes) | Same Storage website origin. `/` serves `index.html`; frontend-only rules rewrite approved client navigation paths to `/index.html`, without preserving unmatched suffixes. | Disabled by default; HTML/navigation and mutable files use `no-store`. |

Keep separate API and Storage origin groups: they are different services, not
failover substitutes. Configure the generated `*.web.core.windows.net` origin
host/SNI correctly and validate certificates over HTTPS. Front Door owns the
custom domain; Storage needs no second custom-domain certificate. Redirect
public HTTP to canonical HTTPS; disable unnecessary public endpoint aliases.

For the initial SPA, `/`, `/login` and `/register` are the navigation paths;
handle their trailing-slash equivalents consistently. Rewrite only known SPA
navigation GET/HEAD requests on the frontend route, not all unmatched requests
or anything under `/api` or `/assets`. Future client routes require a coordinated
route-manifest/rule update. Unknown paths and missing assets return a real 404
via `404.html`; do not set `index.html` as the Storage error document, mask API
404s as HTML, or return HTML with a JavaScript MIME type. Direct deep links and
refreshes must return the SPA shell with 200 through Front Door.

### Cache, security and privacy boundaries

- Only content-hashed public assets are immutable: publish
  `Cache-Control: public, max-age=31536000, immutable` and matching edge policy.
  Never replace bytes at a hashed URL. Keep the full query string in the cache
  key initially; do not introduce normalization of API/user query data.
- Disable edge caching for `index.html`, SPA navigation, `404.html`, mutable
  config/manifests and every API response. Send `no-store` for these documents
  and errors. Do not cache authenticated data, tokens, personalized HTML,
  provider failures or user locations. Verify missing-asset/error headers and
  actual cache behavior; do not force an immutable TTL on arbitrary responses.
  No service worker/offline API cache is part of this baseline.
- Storage cannot execute auth or validate FDID and does not provide arbitrary
  website security headers. The **public, anonymous read-only static origin is
  deliberate**: direct asset access is acceptable; it is not equivalent to the
  restricted ACA origin. Do not claim private-only or Front Door-only Storage
  access. Disabling Blob anonymous access does not disable the website endpoint.
  Keep ordinary Blob containers private and the dedicated account limited to
  publishable build output. Standard needs no Premium/private-origin upgrade
  for these public bytes.
- Add frontend response security headers at Front Door: CSP permitting local
  scripts/assets and same-origin API connections (no unsafe script execution),
  framing restriction, `nosniff`, HSTS, restrictive referrer and permissions
  policies. Test the policy against the SPA; do not silently weaken it.
  Backend/API security headers and session controls remain backend-owned.
- Scope frontend-only request rules to strip Cookie, Authorization and CSRF
  headers before forwarding to Storage; **never strip them on the API route**.
  The host-only `Path=/` session cookie can otherwise accompany asset requests.
  Do not log sensitive headers/query values; no secrets, password material,
  user data, `.env` files or public source maps containing sensitive internals
  in the build. The browser calls only this backend, not OpenWeather or Azure.
- ZRS protects the static origin across zones; cached assets improve latency
  but are not an availability guarantee for uncached HTML or regional failure.
  Retained artifacts permit restore/republication, not regional DR. Front Door
  still processes public assets/requests globally; privacy disclosures and
  sanitized logging/retention remain necessary.

### Simple GitHub Actions frontend deployment

Extend application delivery with a small frontend release job sharing trusted
CI, protected target approval and mutation serialization; no new delivery
platform or permanent staging infrastructure. Build/type-check/test React
once for the trusted commit, retain the versioned artifact and checksums, then
upload **only the build directory** to `$web`. Use GitHub OIDC and Entra blob
data-plane authorization (`--auth-mode login`), with a separate frontend
publisher granted container-scoped Storage Blob Data Contributor; no account
keys, SAS, SWA deployment token, database or backend-secret access.

Upload/verify new hashed assets first, then publish `index.html` last as the
entry-point switch; serialize publishers. Use correct MIME/cache properties,
set headers through the appropriate origin properties/Front Door rules, and
retain old assets for the supported old-tab/rollback window. This is not a
multi-blob atomic deployment. Keep frontend changes compatible with the serving
API, retain the prior index/artifact, and roll back by restoring that index
after verifying its assets. Do not delete/sync away old chunks during promotion.
If routing changes are required, coordinate a separately reviewed Terraform
change before publishing a frontend that needs it.

Verify the canonical root/deep links/assets and same-origin API journeys before
reporting deployment success. Normally no purge is needed for uncached HTML
and newly hashed assets; narrowly purge corrected/previously cached paths
through authorized Front Door control-plane access when needed, then verify
completion. CI does not rewrite Terraform-owned routes or apply infrastructure
on every frontend release.

## HA and global latency: justified, but bounded

- Creation-time ACA environment zone redundancy and minimum two replicas
  provide documented multi-zone distribution, **not guaranteed survivor
  throughput**. Keep sessions/state off replica-local storage and test hashing,
  concurrency, probes and release overlap at surviving capacity.
- PostgreSQL cross-AZ synchronous replication provides managed failover.
  Microsoft's 60-120-second failover description and 99.99% database SLA are
  not application RTO/uptime promises. Connections and in-flight transactions
  can fail; an interrupted commit may have an unknown outcome. PgBouncer does
  not eliminate this. HA is not protection against corruption/deletion: PITR
  and tested private restore/cutover remain essential.
- Front Door improves practical edge/transport opportunities, but uncached
  authentication/preferences/weather execution still reaches Sweden and its
  dependencies. Measure geographic user journeys; keep API/authenticated
  responses uncached. Only deliberately approved public assets may be cached.
- A regional outage remains outside the accepted protection scope. Front Door
  probes cannot recover a single failed regional origin. OpenWeather outages
  must produce explicit degraded weather behavior without unnecessarily
  disabling account/preference journeys.
- Registry pulls, Entra token issuance and vault resolution matter during
  replacement/recovery. Sweden's Monitor Logs table promises shared-workspace
  **data**, not AZ **service**, resilience; telemetry must not block requests,
  and external journey checks/incident procedures must tolerate monitoring gaps.

## Cross-document consistency and remaining dependencies

The six current accepted decisions are compatible: single Sweden region,
zonal ACA and database, global Standard edge, restricted public origin,
private SQL and hosted OIDC CI invoking private Jobs. Later ADRs resolve earlier
scope deferrals; they do not change compute platform or HA requirements.
The $271 versus $282 database figures reflect different retained SKUs, not
conflicting HA models.

Documentation drift remains: [requirements decision summaries](../requirements.md),
the [ADR index](../adr/README.md), [alternatives](alternatives.md), and repository
guidance still describe several accepted decisions as proposed/open. Some
earlier ADR narrative also says other ADRs are unaccepted or region is unknown.
Use the individual Accepted status/approval entries and later scoped decisions
as current decision evidence; do not mistake historical deferrals for new
approvals or reopenings. Synchronize these summaries in a separately authorized
documentation task; they are read-only for this review.

**Frontend hosting/deployment is now resolved above.** This fills the deferred
frontend origin and delivery responsibility in ADR-004/ADR-006; it does not
change accepted compute, region, edge tier, SQL, networking or OIDC/Terraform
ownership. Read-only application/design records may still call hosting pending.
The [application foundation](../ai/10-application-foundation.md) already records
human-selected backend cookie sessions/CSRF; the one-origin topology supports
them. No additional auth platform, state service or edge is required.

No platform/topology architecture choice remains unresolved. Supported runtime/
driver versions, numeric security/SLO limits, exact hostname/CIDRs, frontend
visual approval and full application-contract policy review are implementation/
product acceptance tasks, **not silently approved by closing hosting**.
Follow the pending human-review gates in the
[API contract](../backend/API_CONTRACT.md) and
[design specification](../design/DESIGN_SYSTEM.md); no read-only document was
changed or given blanket approval.

## Final architecture flow

```text
Global browser
  -> HTTPS -> Front Door Standard + custom filtering/rate-limit WAF
     -> /assets/* -> HTTPS -> Sweden Central StorageV2 / Hot / ZRS
        static website ($web); immutable public asset caching
     -> /* -> same Storage origin; uncached HTML + scoped SPA navigation rewrites
     -> HTTPS, validated origin host/certificate
        -> restricted PUBLIC ACA ingress
           [maintained Front Door Backend IPv4 CIDRs + exact X-Azure-FDID]
           -> stateless API, Consumption workload profile
              zone-redundant external VNet-integrated environment, >= 2 replicas
              -> private DNS + TLS + Entra token -> PgBouncer :6432
                 -> PostgreSQL Flexible Server GP, cross-AZ primary/standby
                    separate delegated subnet; no public SQL endpoint; PITR
              -> HTTPS + managed identity -> Key Vault -> provider/app secrets
              -> HTTPS -> OpenWeather (bounded calls, explicit degradation)

GitHub Actions + OIDC
  -> Entra blob data plane: versioned React build -> $web
     hashed assets first -> index last -> verify / retained-index rollback
  -> ACR: publish scanned, retained immutable image digest
  -> Azure control plane: private ACA migration Job, separate SQL identity
     -> private PostgreSQL :5432; compatible serialized migrations
  -> ACA: candidate validation -> promote -> verify / compatible rollback
  -> protected Terraform plan/apply: infrastructure, DNS, identities, boundaries
     and protected remote state; no SQL migrations or release-field competition

Nonblocking sanitized telemetry + external journey checks -> incident owner
```

## Remaining implementation validation items

These are routine configuration/delivery gates, not reasons for new platform
selection. They are mandatory before claiming production readiness:

1. **Capacity/HA:** Recheck Sweden capabilities/quota and SKU/storage support;
   verify distinct PostgreSQL AZs, ACA creation-time zone redundancy, subnet
   restore/rollout headroom and load-tested survivor capacity. Never accept
   same-zone fallback or scale-to-zero as production AZ HA.
2. **Origin enforcement:** Prove the full current backend IPv4 set fits the
   pinned API/provider and is evaluated as expected. Test intended profile and
   probes versus direct/forged/other-profile requests on every hostname/revision/
   route. Updates must retain the last good nonempty allowlist and stop/alert
   on failure. Separate local probes from public checks. Candidate smoke tests
   need a controlled same-profile route or a specifically validated local/
   internal execution path; being inside the VNet alone is not an ACL exemption.
3. **Private SQL/identity:** Test DNS, denied public/off-VNet access, TLS hostname/
   root validation, required HA/Storage/Entra flows, private principal bootstrap
   and operator recovery. Prove runtime versus migration grants, actual-expiry
   token refresh, PgBouncer compatibility and aggregate rollout/scale pool caps.
4. **Recovery/dependencies:** Exercise DB failover, safe retry/unknown-commit
   handling, restore and endpoint/identity/HA cutover, image pulls, secret
   rotation/revision restart and OpenWeather timeout/quota failures. Finalize
   retention, Premium SSD v2 growth ownership, SLO/RTO/RPO and incident runbooks.
5. **IaC/delivery:** Pin tooling and prove post-release/rollback plans preserve
   CI-owned fields while detecting infrastructure/security drift. Validate
   bootstrap, backend/provider OIDC, actual GitHub approval availability,
   least-privilege trust/RBAC, protected exact-plan handoff/state recovery,
   shared mutation serialization, migration failures and warm/cold rollback.
6. **Frontend/application acceptance:** Prove ZRS/static endpoint and origin TLS,
   API route precedence/path preservation, deep-link 200s and genuine asset/API
   404s, MIME/security headers, header stripping limited to Storage, and cache
   isolation across users. Test OIDC uploads, assets-first/index-last deployment,
   interrupted uploads, old-tab compatibility, retained-artifact rollback and
   any narrow purge. Test backend sessions/CSRF, password hashing, authorization/
   user isolation, browser security and representative geographic latency.
   Approve minimized data/retention/deletion and global edge/provider/GitHub
   disclosures; European hosting is not Europe-only processing or compliance.
   Configure nonblocking monitoring and approve the complete usage budget.

If origin enforcement cannot be made reliable, private administration is
unworkable, mandatory approval controls are unavailable, or qualifying cross-AZ
allocation cannot be obtained, **stop delivery and escalate for human review**.
Do not silently weaken security/HA; only a demonstrated material problem warrants
changing an accepted ADR.

Evidence and current official-source checks are recorded in the
[session record](../ai/09-final-architecture-review.md). No deployed behavior
was tested.

**FINAL ARCHITECTURE APPROVED FOR IMPLEMENTATION**
