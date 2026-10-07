# Final architecture review: Copilot session

- **Date:** 2026-10-07.
- **Author / tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements:** F-01 through F-04, N-01 through N-05, S-01/S-02,
  A-01/A-02, D-01 through D-03; confirmed assumptions AS-04 through AS-10.
- **Related decisions:** Accepted ADR-001 through ADR-006.
- **Deliverable:** [Final architecture review](../architecture/final-architecture-review.md).
- **Current reviewer conclusion:** FINAL ARCHITECTURE APPROVED FOR IMPLEMENTATION,
  after the frontend follow-up below. The initial review conclusion was
  APPROVED WITH MINOR IMPLEMENTATION CONDITIONS.
- **Final human decision on this review:** **Pending**. This request authorizes
  review/documentation, not human acceptance of this new conclusion,
  implementation, provisioning or recurring spend.

## Problem and prompt

**Faithful summary, not a transcript:** Act as the final DevOps architecture
reviewer. Read all requirements, ADR-001 through ADR-006 and relevant
architecture/AI documentation. Challenge the design as one system, prioritizing
practical cost-benefit, Availability Zone HA, PaaS, practical global latency,
security/privacy, simplicity and clean Terraform/CI/CD support. Evaluate
unnecessary/expensive components, equivalent cheaper options, HA evidence,
accidental IaaS, networking boundaries, single-region Front Door value,
PostgreSQL HA trade-offs, contradictions and implementation dependencies.
Do not reopen accepted decisions merely because alternatives exist. End with
APPROVED, APPROVED WITH MINOR IMPLEMENTATION CONDITIONS or NOT APPROVED; if
approved include final flow and validation items. Write only the final review
and this session record, leave everything else read-only, do not stage/commit,
and verify exactly those two files changed.

No secrets or application personal data were supplied or included in the
record; no sensitive-content redactions were needed. Only public Azure product
questions/URLs were sent to documentation tools, not repository contents.

## Evidence reviewed

Read the complete [requirements baseline](../requirements.md), all six ADRs:
[compute](../adr/ADR-001-compute-platform.md),
[region](../adr/ADR-002-azure-region.md),
[database](../adr/ADR-003-database.md),
[global entry](../adr/ADR-004-global-entry-point.md),
[network/security](../adr/ADR-005-network-security.md) and
[delivery](../adr/ADR-006-cicd-strategy.md).

Read [architecture alternatives](../architecture/alternatives.md) and all
existing numbered AI investigations in full:
[01 requirements](01-requirements-analysis.md),
[02 initial compute/history](02-compute-platform-evaluation.md),
[03 cost reassessment](03-cost-effectiveness-reassessment.md),
[04 database](04-database-architecture-evaluation.md),
[05 global entry](05-global-entry-point-evaluation.md),
[06 CI/CD](06-cicd-strategy-evaluation.md),
[07 region](07-azure-region-evaluation.md) and
[08 network/security](08-network-security-evaluation.md).
Also read [AGENTS.md](../../AGENTS.md),
[Copilot instructions](../../.github/copilot-instructions.md),
[ADR process/index](../adr/README.md), [AI convention](README.md) and
[frontend foundation](../design/README.md).

The initial Git worktree and index were clean. The root inventory contains
documentation/guidance, not application/Terraform/workflow implementation.
No deployed configuration is available to substantiate runtime claims.

## AI recommendation and challenges retained

- Retain all accepted ADRs: the selected managed backend/network/delivery
  architecture is coherent and proportionate to the accepted instance/AZ,
  single-region failure scope. No material design defect was demonstrated.
- Acknowledge the strongest cheaper options: direct ACA avoids edge cost,
  Functions Flex reduces small-instance compute spend, and D2s_v3 reduces
  database spend while preserving cross-AZ HA. Only the last is already a
  retained sizing fallback. Alternatives alone do not justify ADR reopening.
- PostgreSQL's matching standby is expensive but required by the failure scope.
  Burstable/same-zone/stopped/single-server production is not equivalent.
  Built-in PgBouncer avoids an unnecessary separately operated pooler.
- Front Door Standard remains useful for combined practical transport,
  abuse-control and visibility benefits, not regional DR or local database work.
  Premium, duplicate gateways, fixed/inspected egress and permanent private
  runners lack a current requirement. Managed LB/IP costs are real, but not
  customer-operated IaaS.
- The live ACA CIDR/profile boundary and narrow Terraform/release ownership
  are the key implementation risks. Neither has been deployment-tested.
  Private migration/bootstrap and candidate tests must preserve boundaries.
- Two ACA replicas and a database SLA do not prove user-journey availability.
  Survivor load, token/pool recovery, safe writes, PITR, release recovery,
  provider degradation and monitoring incident gaps require evidence.
- Stale requirements/index/guidance and earlier scope-deferral statements are
  documentation drift, not competing accepted architectures. Individual human
  acceptance entries and later scoped decisions establish current choices.
  At the initial review, frontend hosting/deployment was genuinely unresolved;
  the follow-up below resolves it. Auth/session/privacy and observability
  implementation details still need validation. No read-only source was
  synchronized by this review.

These initial findings were kept in the review. The follow-up now selects the
frontend hosting/topology; it does not invent numerical SLOs, replace the
backend authentication scheme or approve recurring spend.

## What was verified

### Official-source checks in this session

Used Azure MCP documentation search/fetch on 2026-10-07, with targeted reads of
oversized tool outputs:

- [ACA reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-apps):
  creation-time zone redundancy, VNet integration, minimum two replicas,
  platform placement, replacement delays and stateless application obligations.
- [ACA NSGs](https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration):
  external workload-profiles public ingress bypasses the customer subnet.
- [ACA ingress IP restrictions](https://learn.microsoft.com/en-us/azure/container-apps/ip-restrictions):
  IPv4 CIDRs, uniform allow/deny rules and allow-all when no rules exist;
  no maximum rule count or installed-prefix feasibility was established.
- [Front Door origin security](https://learn.microsoft.com/en-us/azure/frontdoor/origin-security):
  combine backend IP filtering and exact profile FDID; Private Link is Premium.
- [PostgreSQL regional table](https://learn.microsoft.com/en-us/azure/postgresql/overview#azure-regions):
  Sweden Central lists cross-AZ HA without the new-deployment restriction;
  published support is not actual subscription allocation.
- [PostgreSQL HA](https://learn.microsoft.com/en-us/azure/postgresql/high-availability/concepts-high-availability):
  cross-AZ versus same-zone failure coverage, Burstable exclusion, synchronous
  replication, documented failover and SLA limitations.
- [PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private):
  no public endpoint, delegated subnet/DNS, HA/Storage/Entra dependencies and
  preservation of the automatically configured Storage service endpoint.
- [ACA custom VNet configuration](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks):
  workload-profile delegation/subnet minimum and billable managed LB/public IPs.
- [ACR reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-container-registry):
  automatic AZ resilience includes Basic/Standard; Premium is not needed solely
  for zonal protection.
- [Monitor Logs AZ support](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/availability-zones):
  Sweden shared-cluster data resilience, without listed service resilience.

Identity, vault, tier billing, GitHub and Terraform details also use the existing
investigations' cited evidence; this session did not independently refresh every
external source or inspect account entitlements/provider schemas.

### Cost verification and limits

Reused the existing 2026-10-07 retail ledgers; did **not** retrieve a new quote.
Checked arithmetic locally: D2ds_v5 HA/storage $281.78, D2s_v3 $270.86,
difference $10.92/month. Combined prior small ACA/network/registry and edge
sensitivities into approximately $360-$396 partial monthly subtotals, with
explicit exclusions and independent unvalidated activity/traffic assumptions.
This is neither measured demand, an all-in budget nor authorization to spend.

An attempted JSON parse of a saved documentation-search response failed.
That failed extraction was not used as evidence; direct official-page fetches
and bounded searches/reads supplied the claims above.

### Local completion validation

Documentation-only validation covers local Markdown link targets, balanced
fences, whitespace, the required final verdict/flow/validation sections, and Git
scope/index checks. The authorized outputs are only the review and this record;
ADRs, requirements, Terraform, workflows and application code remain read-only.
Nothing is staged or committed. Final scope/check results are reported in the
completion response; no application test/build toolchain was installed or run.

## Acceptance and follow-up

Existing ADR human approvals are preserved and unchanged. The reviewer retained
the accepted direction with routine implementation conditions; no ADR reopening
is recommended. Human acceptance of **this final review remains Pending**.

Before production claims, complete the review's capacity, ingress, private
SQL/identity, recovery, delivery/IaC, frontend/browser, geographic latency,
privacy and full-budget gates. Confirmed inability to enforce the origin,
obtain qualifying cross-AZ allocation, administer private SQL or satisfy
mandatory approval controls requires human escalation, not permissive fallback.
There was no Azure tenant/resource inspection, provisioning, Terraform plan,
OIDC/RBAC test, prefix installation, bypass/SQL/TLS/pool test, latency/load test,
deployment/rollback drill or failover/restore exercise in this session.

## Frontend hosting follow-up: 2026-10-07

### Prompt and approval scope

**Faithful summary:** Resolve the final open architecture item for a React +
TypeScript SPA. Select the simplest practical lowest-cost Azure-native static
host compatible with existing Front Door Standard, Sweden Central, ACA API,
private HA PostgreSQL, GitHub OIDC and Terraform. Compare Storage static website,
Static Web Apps and any genuinely better managed option. Decide hosting,
frontend/API routes, caching, one-domain/CORS integration, security/privacy and
ADR impact; explain why SWA adds little if Storage wins. Update only the final
review and this existing record, leave ADRs/code/IaC/workflows read-only, do not
stage/commit, and end with implementation-ready or not-ready architecture.

The user explicitly delegated hosting selection and requested an
implementation-ready architectural conclusion. **Human acceptance of the
new AI-selected hosting recommendation remains Pending**; no separate approval
message is inferred. The reviewer finds the architecture ready to implement,
not deployed/production-tested. This two-document task does not authorize
writing code/IaC/workflows, provisioning or spend, nor blanket approval of the
separate proposed API policies/design.

### Additional context and baseline

Read the current review/record, the supplied
[design system](../design/DESIGN_SYSTEM.md), new
[application contract](../app/AGENTS.md), relevant
[API contract](../backend/API_CONTRACT.md) sections, and
[application-foundation record](10-application-foundation.md).
They specify React/TypeScript, `/api/v1`, backend cookie sessions/CSRF, public
weather and no public API caching. Client page paths remain implementation
choices there; the review now defines initial navigation/rewrite integration.

At follow-up start, both owned files were already untracked from the initial
review. Four unrelated untracked documents also existed: the application
contract, API contract, design system and application-foundation AI record
linked above. Captured their SHA-256 hashes before editing for final comparison;
the index/tracked worktree was clean. They must not be removed, synchronized
or counted as changes made by this follow-up.

### Decision and rejected alternatives

**Select Azure Storage static website hosting**, a dedicated Standard StorageV2
account in Sweden Central, Hot tier, **ZRS**, with React build output in `$web`.
Reuse the existing Front Door/domain: `/api` and `/api/*` go unchanged to ACA,
`/assets/*` to the static website with immutable caching, and the frontend
catch-all to Storage with caching disabled and scoped navigation rewrites.
One public origin avoids production CORS and supports the backend's cookie/
CSRF contract; it does not eliminate CSRF validation.

Storage adds byte/operation charges without a static hosting plan fee. ZRS,
not cheaper single-datacenter LRS, preserves AZ protection. SWA Free has no SLA;
SWA Standard adds production hosting cost and built-in edge/auth/Functions/
preview capabilities with little benefit because Front Door and ACA already
cover the needed boundaries. It can reuse Front Door, so the objection is
overlapping capabilities/cost, **not a claim that another edge profile is
technically mandatory**. No enterprise-edge add-on, separate CDN, App Service
runtime or frontend co-hosting on API replicas is justified.

Terraform owns the account/website/RBAC/Front Door configuration; GitHub
application delivery owns a versioned SPA artifact and blob publishing.
Use OIDC plus **Entra data-plane login**, scoped frontend publisher permissions,
hashed assets first/index last, retained old chunks/index, compatible API
changes and verified rollback. Do not generate/manage application blobs with
Terraform or deploy repository roots/secrets/source fixtures.

Security boundaries are explicit: public read-only static bytes are acceptable,
but Storage cannot enforce the API's FDID/auth boundary. Never place private
data or secrets there. Static requests have sensitive headers stripped before
Storage; API session/CSRF headers remain intact. Front Door supplies SPA
security headers and cache policy; HTML/config/errors/API remain uncached.
Only public hashed assets are immutable. Direct deep links return 200, missing
assets/API routes retain genuine errors, and no service-worker API cache is
introduced. Global edge processing/logging still requires privacy review.

**ADR impact:** None of ADR-001 through ADR-006 is reopened or modified.
The choice fills ADR-004's deferred frontend origin and ADR-006's deferred
frontend delivery surface under their existing platform/ownership principles.
No platform/topology choices remain open in the review; detailed policy/design
approvals and preproduction validation remain explicit rather than waived.

### Follow-up official-source verification

Azure MCP documentation search/fetch and first-party/provider fetches were used
on 2026-10-07:

- [Storage static websites](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website):
  `$web`, anonymous read-only site, no auth/arbitrary header execution, standard
  index/error handling and no separate enablement fee. Blob anonymous-access
  settings do not make the website private.
- [Blob reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-storage-blob)
  and [Storage redundancy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy):
  Standard GPv2 ZRS, cross-zone accessibility/managed routing and possible
  transient recovery delay; AZ-region support covers Sweden at capability level.
  Actual account deployment/limits were not tested.
- [Storage feature support](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-feature-support-in-storage-accounts)
  and [static site setup](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website-how-to):
  supported static-site account feature and file uploads/MIME considerations.
- [Storage with Front Door](https://learn.microsoft.com/en-us/azure/frontdoor/integrate-storage-account):
  reuse a Standard profile; no Premium Private Link is assumed.
- [Front Door route matching](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-route-matching),
  [URL rewrite](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-url-rewrite),
  [rule actions](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-rules-engine-actions)
  and [caching](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-caching):
  specific paths take precedence, scoped path rewrite, header actions/cache
  controls, and no-store semantics. Exact deployed rules require validation.
- [SWA plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans),
  [pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/)
  and [manual Front Door integration](https://learn.microsoft.com/en-us/azure/static-web-apps/front-door-manual):
  Free lacks SLA, Standard targets production and supports manually managed
  Front Door; built-in global delivery/auth/previews are not needed here.
  No new numeric SWA/Storage price quotation was retrieved.
- [Static website GitHub Actions](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-static-site-github-actions)
  and [CLI Entra data authorization](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-data-operations-cli):
  OIDC workflow support plus token-based blob operations with `--auth-mode login`.
  **Do not copy the static-site tutorial's `--auth-mode key`/key-retrieval or
  legacy CDN purge samples**: OIDC login alone does not make key-mode uploads
  passwordless, and this architecture uses existing Front Door.
- [AzureRM static website resource source](https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/r/storage_account_static_website.html.markdown):
  dedicated static-site settings resource; provider versions/Entra access still
  need implementation checks. The Registry fetch was title-only, so the official
  provider source was used. A guessed ZRS support URL returned 404; successfully
  fetched Blob reliability/redundancy pages supplied the capability evidence.

### Checks, limits and final conclusion

Documentation checks cover links/fences/whitespace, selected host/routes/cache/
delivery boundaries, removal of pending frontend topology in the review, and
its exact final verdict. Final Git checks compare with the six-file untracked
baseline and verify the four unrelated hashes and unchanged index/tracked
worktree; only the two owned documents may change in this follow-up.
No dependencies, infrastructure, workflow YAML or application code are created;
no live uploads, cache/header/deep-link tests, Terraform plans, browser/session
tests, deployment/rollback or zone-failure tests were run. These are explicit
implementation/production gates, not remaining platform selection.

**FINAL ARCHITECTURE APPROVED FOR IMPLEMENTATION**
