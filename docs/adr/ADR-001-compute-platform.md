# ADR-001: Compute platform

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

Small public Azure application. App Service is the leading candidate; Container
Apps is a serious alternative. Runtime, packaging, load, and budget remain Open.

## Requirements

[Requirements](../requirements.md): F-01 through F-04, N-01 through N-03,
S-01/S-02, A-01/A-02, D-01/D-02.

## Options considered

- App Service.
- Container Apps; evaluate a Functions variant only if justified.
- AKS or VMs as separate comparison baselines.

## Decision

**TBD**. No compute platform, runtime, SKU, or replica count is approved.

## Rationale

Compare [the alternatives](../architecture/alternatives.md) using agreed
workload, latency, HA, security, budget, and operational criteria.

## Consequences

TBD: packaging, scaling, runtime support, release/rollback model, operational
ownership, and zone/regional failure behavior.

## Security impact

Evaluate patch responsibility, workload identity, ingress restriction, secret
access, and database connectivity for each option.

## Cost impact

TBD: region/tier/capacity, HA baseline, traffic, telemetry, and operational labor.

## References

- [Alternatives and official compute guidance](../architecture/alternatives.md)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
