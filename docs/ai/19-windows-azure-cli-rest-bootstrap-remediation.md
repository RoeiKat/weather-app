# Windows Azure CLI REST and database bootstrap remediation

- **Date:** 2026-10-08.
- **Author/tool:** AI assistant using Copilot SDK in VS Code; model Unknown.
- **Human decision owner:** Requesting user.
- **Related requirements/decisions:** N-04, D-02/D-03 and S-02 in
  [requirements](../requirements.md), [ADR-005](../adr/ADR-005-network-security.md),
  [ADR-006](../adr/ADR-006-cicd-strategy.md), and the
  [delivery/bootstrap implementation record](16-terraform-cicd-implementation.md).
- **Human decision status: PENDING REVIEW**
- **Final human decision:** Pending. The current prompt authorizes scoped local
  remediation and read-only inspection, not a bootstrap retry or Azure mutation.
  No architectural acceptance or live-command approval is inferred.

## Prompt

**Faithful summary, not a verbatim transcript:** Diagnose
`node infra\scripts\database-admin.mjs principals` from the current repository,
not previous assumptions. Read the Azure helper, SQL administrator helper,
backend release helper, delivery tests, bootstrap SQL, migration Job Terraform,
related AI records and worktree changes. Identify the precise failing REST
operation; expose real, sanitized CLI diagnostics. Verify Windows execution,
JSON file syntax and REST schemas with the installed CLI and Microsoft sources.
Inspect Azure state using read-only commands and determine whether the temporary
administrator secret remains. Do not mutate Azure, execute SQL, rerun bootstrap,
or automatically clean up a live secret. Implement a small cross-platform fix,
preserve immutable images, credential confidentiality, cleanup/recovery checks
and Linux CI compatibility, update tests without weakening assertions, run the
delivery suite, and document the session here with pending human review.
Report cause, changed files, evidence, test results and the next manual command.

**User-reported error:**

```text
Temporary SQL administrator token removal FAILED; pause releases and remove the
Job secret with human authorization. SQL operation also failed: Azure command
failed: rest --method (code unknown, status 1, signal none)
```

No credentials, tokens, request bodies, personal values, subscription identifiers
or raw state are reproduced. Provider messages below omit resource and operation
identifiers. Earlier session records were read as history, not proof that the
current implementation was correct.

## Verified diagnosis: multiple distinct failures

### Recorded live failure: Job start, followed by cleanup conflict

Read-only, resource-scoped Azure Activity Log inspection recovered these events:

| UTC time on 2026-10-08 | Operation | Result | Safe provider evidence |
| --- | --- | --- | --- |
| 13:55:39 | Job configuration PATCH | Accepted, HTTP 202 | Token attachment entered an asynchronous provisioning operation. |
| 13:55:42 | Job `POST /start` | Failed, HTTP 400 | `One or more validation errors occurred.` The `$` validation message was `Unknown properties volumes in StartJobExecutionTemplate are not supported`. |
| 13:55:43 | Job configuration PATCH | Failed, HTTP 409 | `ContainerAppsJobOperationInProgress`: the Job could not be modified while an active provisioning operation was in progress. |
| 13:57:48 | Later Job write | Succeeded | A later write completed; this session did not perform it. |

The Job GET and initial execution listing are outside the token lifecycle
`try/finally`; failure there cannot produce the reported combined cleanup error.
In the recorded run, attachment was accepted, the subsequent **start request**
was rejected, and the **cleanup PATCH** was rejected independently. There was
no successful start to poll in that sequence.

The live GET template has `containers`, `initContainers`, and `volumes`;
`volumes` is an empty array. Its container also has an empty `probes` array.
The original helper cloned the entire GET template and passed it to `/start`.
For API `2025-07-01`, that endpoint accepts only `containers` and
`initContainers`, whose execution-container fields are `name`, `image`,
`command`, `args`, `env`, and `resources`. Even empty unsupported fields do not
belong in this request. This is a REST schema mismatch, not failed PostgreSQL
authentication, an ACR publication problem, or SQL migration failure.

The original helper also treated an accepted PATCH as completed provisioning.
It started the Job and attempted a cleanup PATCH without awaiting completion
of the attachment operation. That explains the independently verified cleanup
conflict. Successful CLI exit does not make HTTP 202 synchronous.

The original CLI stderr was discarded and cannot be reconstructed byte-for-byte.
The provider Activity Log, rather than a new mutating request, supplies the real
HTTP status, validation message and cleanup error code above.

### Additional defect in the current uncommitted edit

Initial worktree inspection found only an uncommitted change in
[azure.mjs](../../infra/scripts/azure.mjs): `@${bodyFile}` had become
`@{${bodyFile}}`. That edit is a separate current regression; it must not be
confused with the Activity Log's earlier schema failure.

Installed Azure CLI **2.91.0** help says `Use @{file}`, but its own example and
Microsoft's quoting guide use `@body.json` / `@<file>`. Local loopback tests
with the actual installed CLI established behavior, without Azure requests:

| Body argument | Actual HTTP body | Content-Type |
| --- | --- | --- |
| `@path` | File's JSON content, matching the synthetic input | `application/json` |
| `@{path}` | Literal `@{path}`, not file content | Absent |

This was also reproduced through the original Node `cmd.exe /d /s /c az`
wrapper. A synthetic endpoint rejecting non-JSON media types produced real
CLI stderr `ERROR: Unsupported Media Type(...)` and exit status 1. This is
local transport evidence, not a claim that Azure's recorded start failure was
`UnsupportedMediaType`. The current braced-file syntax would corrupt both
token PATCH bodies and execution-start bodies.

The old helper hid all these errors behind `rest --method`; its combined error
also omitted the cleanup subprocess diagnostic.

## Execution path after remediation

1. Require human mode, inspect the logged-in account, read initialized Terraform
   bootstrap outputs and render the actual principal SQL.
2. GET the migration Job; refuse unexpected secrets, inspect execution overlap,
   validate its private database host and the approved immutable ACR digest.
3. Obtain the human's short-lived SQL token, then PATCH its temporary secret.
4. Poll GET until provisioning succeeds and the temporary secret name appears.
5. Recheck execution overlap. Project the documented execution-template fields
   and POST `/start`; discover the new execution and poll its status.
6. Verify that the actual execution used the expected immutable image, command
   and arguments. Job failures remain explicit.
7. In `finally`, PATCH out the temporary secret and poll GET until provisioning
   succeeds and the secret is absent. Azure's actual empty response is
   `secrets: null`; omitted and empty-array shapes also mean no secrets.
   Other shapes are rejected, not treated as cleanup success.
8. On cleanup failure, retain both sanitized failures in the aggregate error,
   pause releases and require authorized human intervention.

Cleanup remains best-effort under process termination, token expiry, unavailable
Azure or failed provisioning. The helper never reports successful removal
without read-back verification. It does not silently retry mutating requests,
remove other operators' secrets, or promise that a killed process can run
`finally`.

## Code and documentation changes

| File | Scoped change |
| --- | --- |
| [Azure helper](../../infra/scripts/azure.mjs) | Resolve the Windows CLI on PATH and execute the official launcher's companion Python module directly (`python.exe -IBm azure.cli`), avoiding shell parsing. Linux/macOS retain direct `az`. Use `@path` JSON files for every REST body, serialize before allocating a temporary directory, and remove files in `finally`. Expose bounded, sanitized stderr summaries, provider codes and validation messages; never expose raw stdout, subprocess errors, credentials, headers or body dumps. |
| [SQL administrator helper](../../infra/scripts/database-admin.mjs) | Add operation labels, bounded provisioning/secret read-back checks after attachment and removal, valid empty-secret handling, and both failure diagnostics in cleanup errors. Preserve human-only execution, immutable image validation and cleanup on failed attachment/start/execution. |
| [Backend release helper](../../infra/scripts/backend-release.mjs) | Project GET's JobTemplate to the documented JobExecutionTemplate at the shared start boundary, excluding empty `volumes` and `probes`. Preserve supported init-container and container settings. Refuse nonempty unsupported volume/probe configuration rather than silently change behavior. Label overlap, start, discovery and polling errors for both migrations and human administration. |
| [Delivery tests](../../infra/test/delivery.test.mjs) | Exercise the shared transport/body abstraction, real GET-shaped fixtures, exact start schema, asynchronous PATCH completion, null/omitted/invalid secret responses, every relevant failing REST stage, double failures, redaction, temporary-file lifecycle and immutable execution validation. Retain existing release, rollback, drift, SQL rendering and recovery assertions, including malformed/missing body-file checks. |
| [Bootstrap instructions](16-terraform-cicd-implementation.md) | Explain provisioning waits, read-back cleanup, execution-template projection and shell-free Windows invocation, linking this pending remediation. |
| This record | Document prompt, observed diagnosis, local changes, validation and pending approval. |

No Terraform, SQL, architecture, application dependencies or workflow definitions
were changed. No packages were installed, and no commit was made.

## Validation

- Initial delivery baseline on the supplied worktree: **26 tests, 17 passed,
  9 failed**. Windows mocks attempted to read the braced filename literally
  and failed with ENOENT. Previous passing records did not validate this edit.
- The editor test tool discovered no Node tests; the existing direct Node
  runner was used, not a new test framework.
- Final `node --test .\infra\test\delivery.test.mjs`: **47 tests, 47 passed,
  0 failed, 0 skipped, 0 cancelled** on Windows with Node **24.15.0**.
  Scenario deployments and SQL operations in that suite are mocked.
- Installed-CLI loopback validation of the fixed production REST helper:
  direct bundled Python invocation, paths containing spaces and `& % !`,
  JSON containing quotes, backslashes and shell metacharacters, correct JSON
  content type, preserved request content, sanitized HTTP-error diagnostics,
  and removal of both temporary body files: passed. Only the destination URL
  was redirected to the synthetic local server and authentication was skipped.
- Installed-CLI execution-flow loopback: the shared execution helper completed
  overlap listing, projected start, execution discovery and immutable-command
  polling against a strict synthetic server. Platform templates were unchanged;
  actual CLI HTTP 400 ProblemDetails retained the verified `volumes` diagnostic
  without the echoed synthetic secret. Passed with five local HTTP requests
  and zero Azure requests.
- Linux/macOS command selection and the same file-body contract were tested
  locally; the suite was not executed on a Linux host.
- Whitespace, changed-file scope and local documentation links checked.
  Terraform validation/application tests were not rerun because their files
  were unchanged.

Regression development exposed two further issues before final validation:
redaction before JSON-error projection could destroy diagnostic structure,
and Azure's actual empty-secret response was null rather than an array.
Both were corrected with explicit regressions. No live mutation was used
to validate or discover them.

### Read-only Azure state inspected

Using the initialized Terraform deployment output to identify only the
existing migration Job, and the current human CLI context:

- Account type: `user`; no identity/token value recorded.
- Job GET: provisioning `Succeeded`, no temporary administrator token reference
  in the stored container template, and no secret names; empty secrets are null.
- Complete execution listing: no executions, including none running.
- Resource-scoped Activity Log: failed events within six hours and a bounded
  operation timeline; only selected status, error and schema evidence recorded.
- GET field names: empty Job `volumes` and container `probes`, confirming the
  response/request schema mismatch.

No `listSecrets` value retrieval, SQL administrator token acquisition, container logs, database
connection, real bootstrap, resource mutation, infrastructure apply, Job start,
or manual cleanup was performed by this session. The later successful writes
in the Activity Log are pre-existing history, not actions of this assistant.

**Current cleanup conclusion:** `temporary-sql-admin` is not attached.
No live cleanup command is required at inspection time.

## Microsoft sources verified on 2026-10-08

- [Azure CLI quoting guidance](https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully-quoting):
  the `@<file>` convention bypasses shell JSON interpretation.
- [Jobs Start, API 2025-07-01](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/start?view=rest-resource-manager-containerapps-2025-07-01):
  exact execution-template/container schema and accepted response statuses.
- [Jobs Update, API 2025-07-01](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/update?view=rest-resource-manager-containerapps-2025-07-01):
  PATCH and asynchronous HTTP 202 semantics.
- Installed `az rest --help`, official Windows `az.cmd` launcher and
  `az containerapp job secret remove --help`; these are local evidence.

## Human follow-up: approval required

Do not automatically retry bootstrap or advance to migrations. Review this
remediation and explicitly approve the next live command first.
With the existing human login, initialized Terraform root and previously
validated environment variables/digest, that command is:

```powershell
node .\infra\scripts\database-admin.mjs principals
```

If a later read-only check finds a leftover token instead, pause releases,
confirm no execution/provisioning operation is active, and obtain explicit
human cleanup authorization. The installed CLI's safe, name-specific command
is shown for review only; it was not run and is not required by current state:

```powershell
az containerapp job secret remove `
  --subscription $env:AZURE_SUBSCRIPTION_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --name $env:MIGRATION_JOB_NAME `
  --secret-names temporary-sql-admin `
  --only-show-errors --output none
```

That interactive command retains the CLI confirmation prompt. Verify absence
with a name-only read afterward; do not retrieve or print secret values.
Private SQL connectivity, actual principal creation and the next live run
remain unverified and unapproved.
