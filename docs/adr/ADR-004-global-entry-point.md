# ADR-004: Public and global entry point

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

Public internet access and geographically distributed low latency are required.
Azure Front Door is under consideration, not selected.

## Requirements

[Requirements](../requirements.md): A-02, N-03, A-01, S-02, D-01/D-02.

## Options considered

- Front Door with tier, WAF, routing, and origin controls TBD.
- Direct platform HTTPS ingress without a global edge layer.
- Regional ingress/gateway where justified; not assumed to provide global acceleration.

## Decision

**TBD**. No entry service, tier, caching policy, WAF, or routing topology approved.

## Rationale

Compare measured geographic latency, origin protection, failure handling, TLS,
operational burden, and cost. Edge routing does not eliminate origin/database
latency or create multi-region availability.

## Consequences

TBD: DNS/certificates, health probes, caching, client addressing, origin access,
and failover behavior.

## Security impact

Evaluate bypass prevention, abuse protection, and private-response cache safety.
Review edge processing locations and privacy needs.

## Cost impact

TBD: base tier, requests, transfer, WAF, origin traffic, and monitoring.

## References

- [Requirements](../requirements.md)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
