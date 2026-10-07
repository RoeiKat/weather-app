# ADR-002: Azure region and regional strategy

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

A European Azure region is required. Exact region, data-residency boundaries,
and regional-outage strategy have not been selected.

## Requirements

[Requirements](../requirements.md): D-01, N-03, S-02, A-01.

## Options considered

- Single primary European region; shortlist exact regions after service validation.
- European primary and secondary regions with a separately justified recovery strategy.

## Decision

**TBD**. No exact region or multi-region commitment is approved.

## Rationale

Verify service/SKU and zone support, capacity/quota, user latency, legal/residency
constraints, recovery targets, and cost before narrowing the shortlist.

## Consequences

TBD: service eligibility, database placement, failure coverage, data replication,
and recovery ownership. Zone redundancy and regional recovery are different.

## Security impact

Review locations of primary data, backups, logs, edge processing, and external
provider data. European hosting does not by itself prove compliance.

## Cost impact

TBD: regional pricing, redundancy, replicated storage, cross-region traffic,
and recovery exercises.

## References

- [Requirements and open questions](../requirements.md)
- [Compute](ADR-001-compute-platform.md), [database](ADR-003-database.md), and [entry point](ADR-004-global-entry-point.md)
