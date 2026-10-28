# #95 — Versioned commercial marketing briefs

## Scope and compatibility

The existing Commercial Marketer endpoint gains explicit `mode: marketing_v2`.
Requests without a mode retain the five-channel legacy contract and dependency
checks. Unknown modes are rejected. No legacy agent is silently switched to a
paid capability. Website is a separate channel, with banner and landing-page
preparation, rather than a marketplace alias. Existing commercial fallback copy
and Calendar recommendation-to-row mapping are reused; website maps to `ban1`.

The new implementation is an API/service deliverable. It does not add another
navigation entry or a new marketing workspace. Existing consumers remain on
their current contract. The shared approval modal gains the website label.

No schema migration, customer workbook changes, live provider calls, budget
activation, ad submissions, email sending or website publication are included.
Business acceptance and actual model-copy evaluation remain pending in #92.

## Input and generation

`POST /api/agents/commercial-marketer` with a signed ANALYST-or-higher session:

```json
{
  "mode": "marketing_v2",
  "briefId": "autumn-brand-campaign",
  "revision": 1,
  "snapshotId": "saved-screen-snapshot-id",
  "scenarioExportId": "95aabbcc-1122-4123-8123-001122334455",
  "kind": "reprice",
  "brandId": "saved-brand-id",
  "channels": ["paid_social", "smm", "website"],
  "audience": "Покупці бренду",
  "brandVoice": "Спокійний і конкретний",
  "campaign": {"from": "2026-11-01", "to": "2026-11-07"},
  "budget": {"amount": "1000.00", "currency": "UAH"}
}
```

These IDs and values are synthetic examples, not approved customer inputs.
Budget may explicitly be `null`; client approval/status fields are forbidden.
The amount is proposed campaign spend, separate from the AI usage budget, and
becomes approved only through the owner approval action below.

Bounds: one brand, one actor-owned export, at most 50 frozen export rows, one to
three distinct channels, audience/voice each at most 500 characters, real ordered
calendar dates at most 90 days apart, and sequential revisions from 1 through
10,000. Every export SKU must belong to the selected tenant/brand; mixed exports
must be narrowed and exported again. Reordering uses the saved procurement
scenario, never a claim that its recommended quantity has arrived.

`marketing_briefs` capability version/prompt version 1 uses the shared #93
execution/ledger with the additive `marketing-briefs-v1` output format. All
selected channels share one provider request, so the entire request (including
all allowed attempts) is reserved before dispatch. The inherited policy bounds
are at most 200,000 input tokens, 16,000 output tokens and three attempts; an
owner should set smaller explicit limits appropriate to their evaluated case.
There is no per-channel paid fan-out or default model/price/cap provisioning.

The execution fingerprint includes the actor, capability, schema, brief inputs,
current snapshot/config/source provenance, and frozen scenario/offer rows.
Only whitelisted SKU identity, stock/quantity, currency, old/new price and
effective-discount fields are added to this context. CSV bodies, unit costs and
unrelated export rows are excluded. The old merchandising chat continues to
receive its original scenario summary without these extra offer rows.

## Output and failures

Version 1 returns the immutable draft ID/revision, original bounded brief inputs,
brand, frozen server `offer`, constraints, and channel drafts. Each draft has
objective, audience, brand voice, message, CTA, proposed assets, campaign timing,
source references and `generated` or `factual_fallback` mode. Exact prices,
discounts, stock, dates and budget remain separate server fields shared by every
channel. They are never replaced by AI text. Every initial result is a draft
requiring owner approval; an exported repricing scenario is not PM approval.

The trusted server chooses the output format; clients cannot choose parsers or
system prompts. Each model channel is independently validated. Unknown fields,
oversized/missing copy, numeric prose, unsupported pointers and a conservative
set of stock/discount/arrival/guarantee claims cause that channel to fall back.
Missing channels also fall back. Other valid channels are retained. A malformed
whole response or provider failure produces labeled factual preparation drafts.
The UI/API must retain the labels and constraints; fallback is not generated copy.

This validation limits known failure modes; it does not establish semantic
truth, suitable Ukrainian style or complete prohibited-claim detection. Human
copy review is always required. Input audience/voice and imported product text
are untrusted context; rendered consumers must escape text.

The returned usage reference retains actual execution state, charged/held amount
and policy currency even when provider/output failure produced only fallbacks.
Partial-channel validation uses the same actual usage for the one request; it
does not invent a per-channel cost split. Provider errors with unknown usage
keep conservative attempt charges under #93's recovery/reconciliation rules.

Completed drafts are reused until a revision changes. The same revision with
different inputs/context is rejected; the next revision must be exactly +1.
Changed audience, voice, channels, dates, budget, scenario or source context
cannot reuse an old approval. A retry after a terminal AI execution can complete
a previously pending draft without another paid call. A live pending generation
returns a conflict. If the process dies before creating an execution record,
the owner may advance the brief revision; investigate/recover any stale ledger
reservation using #93 before enabling further calls. This implementation does
not promise cancellation or refunds on disconnection.

## Approval and Calendar handoff

The existing recommendation approval endpoint accepts a versioned command:

```json
{
  "mode": "marketing_v2",
  "briefId": "autumn-brand-campaign",
  "draftId": "server-returned-draft-id",
  "phase": "offer"
}
```

The service rechecks ADMIN/SUPER_ADMIN membership in the same tenant, resolves
evidence using the saved draft author's actor-owned scenario, and requires the
latest READY revision with an identical evidence fingerprint. `offer` records
an audited owner approval of that exact proposal and budget. Missing budget
remains missing; this action cannot confirm a reorder delivery or invent stock.
The draft stays immutable; the returned approval receipt is separate evidence
of approval, with approver/time, input hash and evidence fingerprint.

Send the same command with `phase: calendar` after reviewing the copy to approve
the internal preparation tasks. Paid-social handoff requires a non-null campaign
budget. Calendar tasks use the campaign start's ISO week, carry the full campaign
dates in their label, and record the ISO week-year in the audit. They do not
assert that an advertisement, delivery or website offer is live. Each row is
unique by tenant, draft ID and row key. Repeating either approval is idempotent;
requesting a different week cannot move the approved task because clients do
not provide the week. Schedule a changed campaign through a new brief revision.

Claiming a new revision clears prior tasks' approval metadata and labels them
`[Застарілий бриф]`, preserving their audit/history rather than deleting them.
The old approval receipts remain historical and cannot authorize the new draft.
Snapshot/source changes also block old generation/approval on revalidation.

## Legacy calendar audit

`/api/calendar/ai-plan` was reviewed before considering reuse. It reads legacy
classifications and null-source inventory alongside direct SalesRecord
aggregates; it has no pinned ScreenSnapshot/scenario, brief approval, versioned
MVP metric provenance or #93 request reservation. Its hardcoded event dates and
rolling dates are not the approved campaign contract. Consequently it is not
used for v2 marketing evidence, approval or calendar creation. The new handoff
uses the existing controlled approval route, shared row builder and MarketingEvent
uniqueness. The legacy Calendar Agent's five-channel dependency flow is retained.

## Verification and business rubric

Synthetic tests use PGlite with production migrations, saved scenario actions,
fake provider outputs and signed API cookies. They cover full-request reservation,
exact shared offers/timing, no-cost disabled preparation, partial/whole invalid
output, failed-provider charges, replay, revisions, role/tenant/brand isolation,
stock uncertainty, owner approval, website handoff, stale tasks and duplicates.
No authenticated browser or live provider/customer UAT is claimed for this API
work. Verification completed: full suite 125 files / 1,244 tests, TypeScript,
production build and diff checks passed. After adding the terminal-execution
resume and in-flight duplicate regression cases, both marketing test files
passed again (29 tests). No production source changed after the full suite/build.

For #92, record the input revision/snapshot/scenario, model/pricing revision,
generated/fallback modes, exact usage, approval receipts and reviewer decisions.
Evaluate paid social (audience/creative/CTA), SMM (organic narrative and format),
website (banner message and landing structure), Ukrainian clarity, factual offer,
stock/budget disclosure and prohibited claims. Any invented figure, approved
discount/received-delivery claim, hidden fallback or cross-tenant evidence is a
failure. Unconfirmed business rules remain unconfirmed; passing fixtures does
not close this customer acceptance gate.
