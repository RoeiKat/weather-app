# ADR-001: Compute platform

## Status

**Accepted**.

- Human decision owner: Requesting user.
- Approval date: 2026-10-07.
- Approval reference: Explicit user approval, recorded in the
  [compute platform evaluation AI record](../ai/02-compute-platform-evaluation.md#final-human-decision).
- Approval scope: Azure App Service as the compute platform only; implementation
  configuration and other ADR decisions remain Open.

## Context

Small public Azure weather application with registration/login, server-side
OpenWeather integration, saved preferences, and PostgreSQL persistence. The
assignment prefers PaaS/managed services, European hosting, high availability,
security/privacy, Terraform, and eventual CI/CD.

Current assumptions use one primary European region, instance and Availability
Zone failure resilience rather than regional DR, and non-public PostgreSQL
access. Cost matters, but no explicit budget ceiling was provided. At least two
continuously available application instances were evaluated as a possible HA
baseline, not an approved capacity configuration. Runtime, packaging, traffic,
latency targets, SKU, exact region, and pricing remain TBD.

## Requirements

[Requirements](../requirements.md): F-01 through F-04, N-01 through N-04,
S-01/S-02, A-01/A-02, D-01 through D-03; current assumptions AS-04 through AS-10.

## Options considered

- Azure App Service.
- Azure Container Apps, the strongest alternative.
- Azure Functions, evaluated separately with HA-capable hosting.
- Azure Kubernetes Service (AKS).
- Azure Virtual Machines, evaluated with redundant zonal deployment.

## Decision

Use **Azure App Service** as the application's compute platform.

Retain **Azure Container Apps** as the strongest alternative if container
packaging becomes materially advantageous or comparable HA sizing/pricing
demonstrates better value.

This decision does not select a runtime, deployment package, App Service SKU,
region, instance count, scaling policy, network topology, or entry point. It does
not approve implementation, resource provisioning, or other proposed services.

## Rationale

App Service best fits a conventional small web application while minimizing
platform machinery and operational burden:

- Managed web hosting aligns with the explicit PaaS preference without requiring
  a container registry, function-oriented decomposition, Kubernetes, or guest
  OS administration.
- Current Azure documentation supports zone-redundant Premium v2-v4 plans with
  at least two instances, subject to region/SKU and scale-unit support. This
  provides a credible path to the current failure scope, not proof of
  implemented application HA.
- Outbound VNet integration provides a path to non-public PostgreSQL while
  allowing public application ingress. Inbound restrictions/private endpoints
  are separate decisions.
- Supported deployment slots, scaling, CI/CD, and Terraform integration provide
  a maintainable delivery path.

Container Apps remains close: managed containers, revisions, granular resource
sizing, and flexible scaling may be preferable for a container-first stack.
Its evaluated HA baseline also requires zone redundancy and at least two
replicas, so scale-to-zero savings do not apply to that baseline.

Functions can meet the requirements with appropriate hosting, but its
programming model, storage dependency, and possible separate frontend add
complexity without a demonstrated event-driven need. AKS and VMs can meet HA
requirements, but add disproportionate operational responsibility for this
workload. AKS Automatic reduces, but does not eliminate, Kubernetes complexity.

The [evaluation record](../ai/02-compute-platform-evaluation.md) preserves the
comparison, proposed weights, scores, sources, and limitations. The user
approved the platform choice, not every scoring assumption or configuration.

## Consequences

- Azure manages hosting infrastructure; the team still owns application
  dependencies, security, configuration, health checks, releases, migrations,
  monitoring, and recovery verification. Custom containers would also require
  image maintenance.
- App Service does not provide request-driven scale-to-zero. HA-capable capacity
  creates an ongoing cost floor.
- Final HA design must verify zone support, actual application instance
  placement, surviving capacity, portable sessions/state, and health routing.
  A provider SLA is not an application availability test.
- PostgreSQL resilience, connection recovery, OpenWeather degradation, safe
  releases, and tested backups remain necessary for end-to-end availability.
- Global dynamic latency still depends on the European origin, database, and
  provider. An edge layer is not selected by this decision.
- Runtime/packaging, scaling, release/rollback, SLO/RTO/RPO, and incident
  ownership remain TBD. Regional DR is outside the current requirement scope.

## Security impact

Managed hosting reduces host maintenance, but does not satisfy authentication,
password hashing, per-user authorization, privacy, or abuse controls by itself.
Keep privileged credentials server-side and PostgreSQL non-public.

VNet integration is outbound connectivity, not private ingress. Workload
identity, secret storage, TLS, origin restrictions, DNS, and private operational
access remain subject to [network security](ADR-005-network-security.md).
No Key Vault, Managed Identity, or edge deployment is approved here.

## Cost impact

The strongest drawback is the provisioned-capacity cost floor of a
zone-redundant Premium plan, potentially underutilized for a small application.
No monthly estimate or spend authorization is established.

Obtain comparable dated App Service and Container Apps estimates covering
region/SKU, HA baseline, expected/peak traffic, release overlap, PostgreSQL,
ingress/edge, networking, telemetry, backups, and operational labor. SKU, pricing,
scaling limits, and final capacity remain TBD.

## References

- [Alternatives and official compute guidance](../architecture/alternatives.md)
- [AI evaluation, approval evidence, and remaining TBDs](../ai/02-compute-platform-evaluation.md)
- [App Service overview](https://learn.microsoft.com/en-us/azure/app-service/overview)
- [App Service reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-app-service)
- [App Service VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration)
- [App Service hosting plans](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
