# ADR-003: PostgreSQL hosting and availability

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

PostgreSQL is an assignment requirement, not an open database-engine choice.
Azure Database for PostgreSQL Flexible Server is the leading hosting candidate.

## Requirements

[Requirements](../requirements.md): F-04, N-02/N-03, S-01/S-02, A-01, D-01/D-02.

## Options considered

- Flexible Server with an availability/recovery configuration still to be evaluated.
- Self-managed PostgreSQL on AKS/VMs as a higher-operations comparison baseline.
- Other PostgreSQL hosting only if it meets Azure, region, and managed-service constraints.

## Decision

**TBD**. Hosting service, version, sizing, HA, retention, and network access are
not approved. PostgreSQL itself remains required.

## Rationale

Compare managed operations, regional support, failure recovery, connection
behavior, security, and cost against agreed SLO/RTO/RPO.

## Consequences

TBD: migration/version ownership, pooling, backup/restore drills, upgrade process,
capacity planning, and failover behavior.

## Security impact

Review least-privilege access, network boundaries, encryption, authentication,
and retention. Passwords must only be persisted as secure hashes where applicable.

## Cost impact

TBD: compute, storage, HA capacity, backups, networking, and operator time.

## References

- [Requirements](../requirements.md)
- [Region](ADR-002-azure-region.md) and [network security](ADR-005-network-security.md)
