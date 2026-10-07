# Cross-agent project contract

## Goal

Build a small, public, Azure-hosted weather application with registration/login,
secure password hashing, OpenWeather data, saved location preferences, and
PostgreSQL persistence.

## Rules for every agent

- Current scope is documentation only. Do not create application/Terraform code, initialize frameworks, install dependencies, add executable pipelines, or provision resources without explicit authorization.
- Deploy in a European Azure region; prefer PaaS/managed services. Design for high availability, geographically distributed latency, privacy, and security.
- Terraform owns reproducible infrastructure. Eventual CI/CD is required; GitHub Actions and all named Azure service choices remain proposals.
- Read [requirements](docs/requirements.md) and relevant [ADRs](docs/adr/README.md). Preserve the distinction between assignment requirements, assumptions, and decisions.
- Do not implement unresolved choices or mark an ADR Accepted without recorded human approval. No compute platform, exact region, network topology, or entry point is selected yet.
- Never expose secrets or personal data in code, logs, AI prompts, or documentation. Never store plaintext passwords; enforce server-side authorization and least privilege.
- Separate presentation, domain behavior, provider integration, persistence, infrastructure, and delivery responsibilities without assuming microservices.
- Make focused changes, preserve others' work, update related docs, and run appropriate existing checks. State what was and was not verified.
- Record significant AI assistance using [the AI convention](docs/ai/README.md). AI output is not approval.
- Define and approve the [frontend design system](docs/design/README.md) before UI implementation.

[Copilot instructions](.github/copilot-instructions.md) expand this contract for
Copilot; neither file overrides assignment requirements or human approval.
