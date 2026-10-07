# ADR-006: CI/CD strategy and ownership

## Status

**Proposed**. Human decision owner: TBD. Approval date/reference: TBD.

## Context

Terraform must own reproducible infrastructure. Eventual application CI/CD is
required. GitHub Actions is the working candidate, not an approved tool choice.
No workflow or Terraform code will be created in this foundation.

## Requirements

[Requirements](../requirements.md): D-02/D-03, S-02, A-01, N-04.

## Options considered

- GitHub Actions for application build/test/deploy; separately governed Terraform execution.
- Another CI/CD service if client constraints justify it, retaining Terraform ownership.
- Evaluate federated short-lived deployment identity versus stored credentials;
  approval gates and environment layout remain Open.

## Decision

**TBD**. CI provider, pipeline identities, environments, approvals, state backend,
artifact storage, and release strategy are not approved.

## Rationale

Compare security, client access, maintainability, validation coverage, cost, and
safe releases. Terraform and application delivery must not manage the same
resource configuration independently.

## Consequences

TBD: infrastructure plan/apply approvals, protected state, reproducible artifacts,
test gates, migration orchestration, rollback, and release ownership.

## Security impact

Review least privilege, untrusted pull-request isolation, secret access, action
provenance/pinning, deployment permissions, and sensitive Terraform state.

## Cost impact

TBD: runner minutes, artifact storage, scanning, environments, and maintenance.

## References

- [Requirements](../requirements.md)
- [Compute](ADR-001-compute-platform.md) and [network security](ADR-005-network-security.md)
- [AI documentation convention](../ai/README.md)
