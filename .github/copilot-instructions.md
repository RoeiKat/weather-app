# Repository-wide Copilot instructions

## Scope and sources of truth

- Follow the shared contract in [AGENTS.md](../AGENTS.md).
- Read [requirements](../docs/requirements.md), relevant [alternatives](../docs/architecture/alternatives.md), and [ADRs](../docs/adr/README.md) before changing behavior or architecture.
- This repository is in its documentation-only foundation phase. Do not create application code, infrastructure code, workflows, framework scaffolding, dependencies, or Azure resources without explicit authorization to start that work.
- Assignment requirements are constraints, not evidence that a particular service or implementation was approved. Proposed, Open, and TBD items are not accepted decisions.
- Never invent a runtime, framework, service, region, SKU, topology, budget, or availability target. Surface unresolved choices and request human approval before implementation depends on them.
- Only mark an ADR Accepted after explicit approval by the authorized human decision owner; record who approved it, when, and the approval reference.

## Architecture and responsibilities

- Prefer managed Azure/PaaS services and simple, maintainable designs; compare alternatives rather than treating the current leading option as selected.
- Preserve logical boundaries between presentation, authentication, weather integration, user preferences, and persistence. These boundaries do not imply separate services or a particular directory structure.
- Keep authorization, password handling, persistence access, and OpenWeather credentials on the trusted server side. The frontend must not directly access the database or privileged credentials.
- Terraform will own infrastructure. Application build/test/release automation must not create a competing source of infrastructure configuration. GitHub Actions is a proposed delivery tool, not yet selected.
- Treat schema migrations as versioned application changes; coordinate their execution with releases. Migration tooling and runner remain TBD.
- Consider availability, privacy, latency, cost, and operational burden together. Public application access does not require public database access.

## Security and privacy

- Never store plaintext passwords. Use a maintained password-hashing library with per-password salts and an appropriate adaptive algorithm; algorithm and parameters require review. Never implement cryptography yourself.
- Enforce server-side input validation, parameterized database access, and per-user authorization for every preference operation. Follow least privilege.
- Do not commit secrets or include passwords, tokens, personal data, connection strings, or OpenWeather keys in logs, prompts, screenshots, or documentation. Use synthetic data and redact sensitive evidence.
- Secret management, workload identity, TLS, session/token controls, abuse protection, and network isolation must be reviewed before implementation. Key Vault and Managed Identity are candidates, not approved deployments.
- Do not expose internal errors to users or hide failures behind success-shaped responses. Use explicit, sanitized errors and observable failure paths.
- Cache only data approved for caching. Never cache authenticated responses publicly or log sensitive request bodies.
- Before delivery, review external dependencies, authentication threats, retention/deletion needs, and external-provider data flows. Do not claim compliance without verification.

## Engineering and verification

- Make focused changes, preserve unrelated work, reuse existing patterns, and update directly related documentation. Do not introduce speculative abstractions.
- Once tooling exists, use its documented format, lint, type-check, build, and test commands. Do not invent commands or install tooling just for documentation work.
- Test new behavior and regressions. Cover password hashing/verification, login failures, authorization and user isolation, preference persistence, and OpenWeather success, timeout, quota, and failure handling.
- Use mocks or controlled fixtures for routine external-provider tests; do not consume live credentials or incur costs without approval.
- Verify deployment, migration, restore, and failover behavior when those capabilities are implemented. Do not substitute a provider SLA for an application availability test.
- Report checks actually run, their results, and anything unverified. Documentation-only work needs link/content checks, not nonexistent application tests.

## AI accountability

- Follow the [AI documentation convention](../docs/ai/README.md). Record significant AI-assisted decisions, evidence, rejected suggestions, and the final human decision.
- An AI recommendation, generated file, or successful test is not human architectural approval.
