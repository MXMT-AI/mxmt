# Versioned AI context and usage budgets (#93)

Branch: `feat/93-ai-context-usage-budgets`, based on merged #100 / main `e43f770`.
Status: server foundation implemented; new capabilities and live activation are
separate work. Business/customer acceptance remains in #92. No live migration,
provider call, workbook change or production activation was performed here.

## Consumer boundary

`lib/ai-execution/execute.ts` exports `executeAiCapability`. New server routes must
authenticate with the existing `requireApiUser("ANALYST")`, derive the principal
from that session, validate their body, and provide a **server-defined** capability
ID, version, prompt version and system prompt. Never pass a browser-supplied
definition, principal, provider, pricing policy, schema or transport.

The service accepts a request key, saved screen snapshot ID, existing screen
filters and at most 20 user/assistant text messages (16,000 characters each).
It checks aggregate UTF-8 bytes plus a conservative framing allowance against the
configured input token cap. Multimodal/tool calls are not supported. Provider
usage above the reservation is recorded in full and stops the execution; an
unexpected overage does not disappear to make the ledger fit the cap.

The current output schema is `evidence-advice-v1`: exactly `summary` and
`recommendations`; each recommendation has text and nonempty JSON-pointer
references into the supplied facts. Unknown references, additional fact fields,
malformed/truncated JSON and invalid usage fail the run. This is a foundation
schema; richer brief/forecast contracts need explicit revisions in their children.

Schema validation does not prove every sentence is true. Generated prose is
explicitly non-authoritative. Consumers must render facts from `result.evidence`,
render generated content as text, preserve coverage/unknown reasons, and use the
#92/#94 evaluation rubric before customer acceptance. No model response can merge
into or replace the immutable financial/stock facts or execute an action.

Old `/api/ai`, agent routes, AgentRun output contracts and shared frontend helpers
are not migrated. Their existing `chat()` string interface and one SDK retry
remain unchanged. New `chatWithUsage()` disables SDK retries; the durable execution
layer explicitly records and reserves every application attempt. Neither helper
changes provider credentials or adds a default paid v2 policy.

## Evidence and lifecycle

The adapter reuses selected-source resolution, saved ScreenSnapshot, financial
publication and daily publication readers and screen summary functions. It
validates tenant membership/role, source selection/revision, live source/config
state, saved input keys, calculation versions, config IDs, period and daily row
coverage. No selected connector is `AI_CONTEXT_UNSUPPORTED`; an empty valid
publication is not implicitly a legacy context. Missing snapshots/publications,
incomplete headers or busy/changed sources are rejected before provider dispatch.

The evidence envelope pins:

- tenant, snapshot/source/provider, selection revision and source-state key;
- sales/daily calculation IDs, versions and input keys;
- settings IDs, business period/timezone, as-of and actual stock observation
  bounds/missing-observation count from the frozen daily rows;
- canonical filters and coverage diagnostics, plus the authoritative summaries.

Channel filters narrow sales but intentionally do not narrow shared stock.
Monobrand filtering follows the existing profile rules. Summary calculations are
not reimplemented in the AI layer. Snapshot resolution is read-only and does not
trigger a new import or financial calculation.

Checks run under the tenant transaction lock before reservation, each provider
attempt and final persistence. Source/settings changes invalidate the operation
or its replay; past incurred charges remain. A completed replay requires the same
actor, inputs, server definition and evidence hash and does not call the provider.
A running replay returns `AI_EXECUTION_IN_PROGRESS`; changed inputs under the same
key return `AI_IDEMPOTENCY_CONFLICT`. An error is terminal for that key; an explicit
new request key starts a new budgeted execution.

Existing AgentRun partial uniqueness and stale timeout are reused, with agent type
`v2:<capability>`. These additive rows do not pretend to be existing nine-agent UI
outputs. Dependency consumers must revalidate through the versioned service rather
than reading a saved AgentRun output and assuming it is current. Future capability
routes/UI live in #94–#99, not this foundation task.

## Policy provisioning and activation

The migration creates `AiBudgetPeriod`, `AiExecution`, `AiUsageAttempt` and composite
tenant-scoped foreign keys. It inserts **no policy or activation row**. Missing or
disabled policies fail closed with `AI_POLICY_REQUIRED` before a provider call.
Missing provider credentials are detected before dispatch and release the unused
reservation with a configuration error; no provider attempt is invented.

Trusted administrative server code can call:

1. `createAiBudgetPeriod(principal, {startsAt, endsAt, policy, approvalReference})`.
2. Review the created period and its stored policy.
3. `setAiBudgetEnabled(principal, periodId, true, approvalReference)`.

Both operations verify an ADMIN/SUPER_ADMIN membership in the same tenant.
Provisioning creates a disabled period. There is no public provisioning endpoint,
environment auto-discovery, model purchase or live default in this change. Use an
approved administrative context; do not expose these functions as anonymous APIs.

Required owner inputs before live activation:

| Input | Required contract |
| --- | --- |
| Period/reset | Explicit UTC start/end instants, inclusive start/exclusive end, at most 366 days. Periods for one tenant may not overlap, even while disabled. No implicit local-midnight/monthly reset. |
| Currency and tenant cap | Three-letter currency and nonnegative monetary cap, decimal strings with at most eight fractional places. No FX conversion. All capabilities share this tenant-period cap. |
| Provider/model | Supported provider (`openai` or `anthropic`) and explicitly approved model. SDK-returned model/version and response ID are retained per attempt. Availability is verified separately before activation. |
| Pricing revision | Dated/evidence-backed revision identifier and monetary rates **per million tokens** for uncached input, output, cache reads and cache writes. Input counts exclude separately billed cache tokens. This feature does not enable provider caching or differential cache TTL pricing; extending token categories needs a new pricing contract. |
| Capability caps | Per-period and per-request cost caps; maximum input/output tokens and 1–3 attempts. The request cap must cover its full worst-case allowance including all permitted attempts. |
| Approval | Owner-approved values, reference and administrative actor. Synthetic test rates are not production recommendations or current vendor prices. |

Policies are immutable after creation in the supported application API. To stop
new attempts, disable the period with a recorded approval reference. Existing
attempts may finish and be charged; disabling is not cancellation of an already
sent request. Re-enabling the same period does not reset its charges/reservations.
A new period must use a non-overlapping interval. Amendments/reset-policy changes
require an explicit follow-up design, not direct edits that erase prior spend.

## Accounting, retries and failures

Tenant locks serialize reservations across all capabilities and period creation,
using the same tenant boundary as source/settings changes. The initial transaction
creates the AgentRun/execution and reserves the **entire request** worst case.
Tenant spent + reserved and capability charged + held are checked before dispatch.
Unique tenant/request keys and execution/attempt ordinals prevent duplicate runs
or charges. These operations are atomic; failed ledger updates roll back together.

Each text-only attempt allowance is:

```text
ceil_8((max(input_rate, cache_read_rate, cache_write_rate) * input_token_cap
        + output_rate * output_token_cap) / 1,000,000)
request reservation = attempt allowance * maximum attempts
```

Each provider attempt gets a durable STARTED row before network access. Known
usage is priced with its saved policy using Decimal arithmetic and upward monetary
rounding to eight places. Unknown outcome, missing/invalid usage and estimated
usage retain the entire allowance as a conservative charge, labeled accordingly.
`spent` therefore includes provisional charges; it is not an assertion of the
vendor's final invoice. Provider exceptions never imply a free call.

On settlement, the attempt allowance leaves reserved/held and the charge enters
spent/charged. At completion/error, only never-started allowances are released.
Retries have separate rows and all count; an unknown first attempt plus an exact
successful retry costs the unknown allowance **plus** actual retry usage. Batches
must invoke the same service with separately keyed requests; they do not get a
separate tenant budget. Deterministic caller-side grouping cannot bypass the shared
period/capability caps.

No automatic retry follows malformed/truncated output, invalid usage, a source
change, disabled/expired policy or usage overrun. A transport exception may consume
the next explicitly reserved attempt up to the configured maximum. Restarting a
worker never redispatches a previously STARTED attempt on replay.

Same-capability bulk consumers must queue their separately keyed executions
sequentially under the existing active-run guard; different capabilities can
overlap but still share the tenant cap. A future grouped/batched API must not
interpret a UI bulk action as permission to bypass those guards or budgets.

If a process dies or settlement fails, its reservation remains. The legacy stale
run closer may mark the AgentRun error; it does **not** refund AI money. An operator
must verify the old worker is no longer active, then use:

```text
recoverAiExecution(adminPrincipal, executionId, restrictedEvidenceReference)
```

Recovery rejects runs younger than the existing five-minute timeout, conservatively
settles STARTED attempts as UNKNOWN, releases only unused allowances, closes the
execution/run as error and writes a recovery audit entry. It does not contact the
provider. A late response cannot resurrect the terminal execution. Keep the
original policy/ledger records while any uncertain charge is outstanding.

After checking provider evidence, an operator can call
`reconcileAiAttempt(adminPrincipal, executionId, attemptId, verifiedUsage, evidenceRef)`.
This replaces a conservative charge with exact usage under the original pricing
revision and atomically adjusts execution and period totals. It records the prior
charge/usage, new charge/usage, actor and evidence reference. Identical replay is
free; conflicting changes to an already exact usage record are rejected. Evidence
references do not authenticate a vendor invoice by themselves: the operator is
responsible for verifying the restricted evidence, including a confirmed zero.

## Data retention and errors

Persist only the evidence aggregates, definition/prompt/schema/pricing versions,
prompt hash and bounds, validated generated advice, usage and bounded provider
response/model IDs. User conversation, system prompt, raw provider output and
provider exception text are not persisted by this foundation. Keys remain in the
existing server environment. No new public debug/usage export is exposed.

Only same-tenant ANALYST/ADMIN/SUPER_ADMIN members execute/read replays; policy and
recovery operations require administrator membership. Provider failures return a
stable code, not raw upstream text. Completed evidence/advice stays attached to
its existing AgentRun. No automatic retention deletion is introduced: never delete
unsettled financial ledger rows or blindly cascade-delete AgentRuns/periods to
recover a budget. Tenant erasure and settled-ledger retention need the operator's
separate retention policy. Future UI/API must keep usage/debug data role scoped.

## Migration and rollback

1. Test the committed migration against an isolated environment with existing
   tenant/AgentRun rows. The automated fixture executes all production migrations
   locally in PGlite; it never uses configured DATABASE_URL.
2. In an approved deployment, apply migrations through the existing Prisma process
   using the configured direct migration connection before deploying v2 callers.
3. Leave all periods absent/disabled until the owner supplies approved caps,
   pricing/reset policy and the applicable #92 acceptance evidence.
4. If rolling application code back, disable paid v2 periods first, drain/recover
   in-flight executions and preserve all ledger tables. Legacy routes can keep
   using their existing schema. Do not drop accounting evidence as a rollback.

The live migration/deployment and any production-like isolated Neon verification
remain separate from this local implementation. No such operations are inferred
from passing a synthetic suite.

## Verification

Tests cover tenant/role boundaries, missing/disabled policies, overlapping periods,
source/context revalidation, separate sales/stock filter semantics, exact/cache
token costs, idempotent replay/settlement/reconciliation, unknown/estimated usage,
explicit retries, shared concurrent caps, request/capability limits, exact overages,
malformed/hostile extra fact fields, unknown references, output truncation, rollback
of ledger writes, crash recovery and period expiry. SDK fakes verify no hidden v2
retries and preserve the legacy text interface/retry configuration.

Recorded checks: full `npm test -- --maxWorkers=2` — 120 files / 1,181 tests passed;
`npx prisma validate`, `npx tsc --noEmit`, `npm run build` and `git diff --check`
passed. No synthetic result is customer or forecast accuracy acceptance.
