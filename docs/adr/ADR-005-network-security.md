# ADR-005: Network boundaries, secrets, and workload identity

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

Only the application must be publicly accessible. Database/origin exposure,
secret handling, and workload authentication need explicit review. Key Vault
and Managed Identity are candidates.

## Requirements

[Requirements](../requirements.md): S-01/S-02, A-02, D-02;
proposed safeguards S-P01 through S-P04.

## Options considered

- Private database connectivity with controlled application ingress and outbound access.
- Restricted public service endpoints where supported and justified by threat/cost review.
- Key Vault with Managed Identity versus platform-managed secret mechanisms;
  evaluate credentialless authentication where supported.

## Decision

**TBD**. No network topology, endpoint mode, secret store, or identity mechanism approved.

## Rationale

Map browser, edge, application, database, secrets, telemetry, CI, and OpenWeather
trust boundaries. Verify platform capabilities rather than assume equivalence.

## Consequences

TBD: DNS, connectivity, deployment access, outbound provider calls, credential
rotation, least-privilege roles, and incident response.

## Security impact

Review TLS, ingress bypass, database isolation, secret exposure, identity scopes,
and audit evidence. Authentication/session policy may need its own ADR.

## Cost impact

TBD: private connectivity, gateways, DNS, secret operations, security controls,
and administrative effort.

## References

- [Requirements](../requirements.md)
- [Compute](ADR-001-compute-platform.md), [database](ADR-003-database.md), and [entry point](ADR-004-global-entry-point.md)
