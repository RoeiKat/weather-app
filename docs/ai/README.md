# AI usage and decision evidence

AI may assist research, documentation, design, implementation, testing, and
review. Humans remain accountable. AI output is neither verified fact nor
approval.

## When and where to record

- Record every significant AI-assisted architectural or implementation decision, including recommendations rejected or deferred.
- Add a dated record here, named `YYYY-MM-DD-short-topic.md`, or append a clearly identified entry to an existing relevant record.
- Link the record from the affected ADR and pull request when available. Routine completion/formatting can be summarized in a change description unless it changes behavior.
- Record before considering the work complete. Unknown approval stays **Pending**; never infer a human decision from generated documentation.
- Never copy secrets, passwords, tokens, private customer data, or confidential code into external AI systems or records. Redact prompts/evidence, disclose redactions, and use synthetic examples. Respect client/tool data-handling approval.

## Record format

```text
Title / date:
Author / human decision owner:
AI tool and model (if known; otherwise Unknown):
Related requirement / ADR / PR:
Problem/question:
Prompt: exact relevant prompt or a labeled, faithful summary;
        identify redactions and reference a safe transcript if available.
AI recommendation:
What was verified: sources, checks, results, and limitations.
What was accepted/rejected: distinguish suggestions kept in a draft
                            from human-approved decisions.
Final human decision: Pending, Approved, Rejected, or Deferred;
                      include owner, date, and durable approval reference.
Follow-up / unresolved risks:
```

Verify provider claims with current official sources, cost claims with dated
estimates, and implemented behavior with relevant tests. Preserve contrary
evidence and failures. A recommendation may be revised after verification.

## Initial record: documentation foundation

- **Date:** 2026-10-07.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting client representative; identity/approval authority TBD.
- **Problem/question:** Establish repository documentation and AI conventions before application or infrastructure work.
- **Prompt (faithful summary, not a transcript):** Create repository Copilot instructions, an agent contract, categorized requirements, unselected architecture alternatives, ADR guidance/template and six Proposed placeholders, AI documentation rules, and a design-system placeholder. Do not create application/Terraform code, initialize frameworks, install dependencies, provision Azure resources, or approve unresolved architecture.
- **AI recommendation:** Use requirements as the baseline, explicit Proposed/TBD ADRs, evidence-based comparison, complementary instruction files, and human approval records.
- **What was verified:** Repository inspection found only Git metadata and no existing project files. Instruction-file guidance and official Azure compute/container comparison excerpts were consulted; references are in [alternatives](../architecture/alternatives.md). Service configurations, prices, quotas, SLOs, and runtime behavior were not validated.
- **What was accepted/rejected:** The requested documentation structure was used in this draft. No service winner, framework, exact region, or deployment topology was selected. No separate human acceptance of the draft or architecture has been recorded.
- **Final human decision:** **Pending** review of these documents. The request authorized documentation creation, not architecture approval.
- **Follow-up:** Resolve [open questions](../requirements.md), validate candidate evidence, and record human decisions before implementation.
