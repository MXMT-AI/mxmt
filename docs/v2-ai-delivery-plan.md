# V2 AI capability specifications (#53)

Revision 0.1 · October 27, 2026 · Branch `feat/53-ai-capability-specifications`.

Status: discovery and implementation specifications, not shipped capabilities or
approved business rules. #53 delivers this audit and separately tracked work.
The original 8 SP is a discovery estimate, not a commitment for all child features.
Estimate children after their inputs and evaluation criteria are agreed.

## Delivery boundary and acceptance authority

The [parent issue](https://github.com/MXMT-AI/mxmt/issues/53) requires separate
sub-issues, input/cost/acceptance definitions and reuse plans. No new AI call,
schema migration, interface, provider integration or scheduled execution is
enabled by this document. All work remains v2 and does not expand the MVP gate.

The owner prioritized spreadsheet completion and agent validation in
[#92](https://github.com/MXMT-AI/mxmt/issues/92). Closure of #38 and the preparation
PR for #51 is not numerical acceptance, threshold approval or successful UAT.
Synthetic implementation work may proceed independently; activation and
customer-result acceptance require the applicable #92 evidence. Further UI work
dependent on unresolved business rules waits for those decisions.

Viktor owns product decisions. Named business reviewers and evidence must be
recorded for each child; this plan does not assert their approval. The policies in
`mvp-business-decisions.md` remain versioned historical decisions. Any revision
needs an explicit decision, affected calculation version and new evaluation.

## Audit of the current implementation

Reviewed on `main` at `3cd1097`. Runtime sources take precedence over architecture
examples and model labels in design documentation.

| Area | Existing implementation to reuse | Verified limit / required change |
| --- | --- | --- |
| Provider | `lib/ai.ts`: provider whitelist, server keys, timeout, one SDK retry, output token cap | Returns text only: no provider usage, monetary ledger or tenant budget reservation. Current configured model names are implementation observations, not pricing or model recommendations. |
| General chat | `app/api/ai/route.ts`: ANALYST auth, parsed bounded individual messages, server provider call | Client supplies messages and system prompt; it does not construct a server-authoritative merchandising context, pin a screen snapshot, record an AgentRun or bound aggregate conversation size. |
| Run lifecycle | `lib/agent-runs.ts`, `lib/agent-output.ts`, `lib/agent-batching.ts`, `AgentRun` | #9 already delivered concurrent-run rejection, stale recovery and JSON parsing. Parsing JSON is not capability schema validation; batching is not spend control. Extend rather than replace. |
| Agent provenance | `lib/agent-context.ts`, `lib/agent-dependencies.ts`, `lib/agent-data-source.ts` | Context uses active Sheets import + dates. This does not bind the selected connector, settings IDs and current MVP calculation versions. |
| MVP publications | `lib/merchandising-snapshot.ts`, `lib/merchandising-screen.ts`, `lib/sales-report.ts`, `lib/sku-daily-store.ts` | Reuse saved source/config/calculation IDs and freshness checks. `readPublishedSalesReport` and `readSkuDaily` provide existing result boundaries; complete paginated evidence is required. Do not replace them with agent SQL or formula copies. |
| Briefs | Commercial Marketer route, `lib/agent-fallbacks.ts` | Already drafts SMM/email/ads/store/marketplace content from current repricing/reordering agent dependencies. An automatic recommendation is not a PM-approved campaign; website deliverables and formal brief revision/evidence contracts are missing. |
| Calendar | Calendar Agent, `lib/calendar-analysis.ts`, recommendation approval route, `MarketingEvent` | Deterministic planning and explicit idempotent approval already exist. `app/api/calendar/ai-plan/route.ts` still reads legacy Sku/SalesRecord data; it cannot certify agreement with the new MVP snapshot. |
| Attributes | Product Attributes route, `lib/attribute-metrics.ts`, `lib/attribute-analysis.ts` | Category aggregation only; subcategory map is not populated. No normalized dial-color/size/material dimensions. Legacy 7-day sales/current-stock STR and category statuses differ from the daily SKU model and must not silently become its definitions. |
| Forecasts | `lib/promo-calc.ts`, legacy reorder simulation, new `lib/reorder-calc.ts` and `lib/reordering-store.ts` | Existing promo AI-percentage/elasticity scenarios and replenishment calculations are not validated cold-start analog forecasts. New-product model, cohort, exposure and backtest contract are absent. |
| Market signals / ad labels | Existing source records, SKU classifications and scenario history are potential inputs | No dedicated evidence-backed external trend feed or versioned Meta/Google custom-label publisher was found in the audited paths. Do not infer these features from internal sales trends or a label in the UI. |
| Frontend | `components/agents/{agents.config,agents.types,agents.utils}.ts`, `useAgentRuns.ts`, shared modals | #13 already extracted contracts/config/orchestration. Extend these after evaluation approval; do not create a second agents page or polling system. |

Existing contracts covered by #9 and #13 remain in place. The runbook incorrectly
described the invalid-provider fallback as Anthropic; current code selects OpenAI.
The runbook is corrected with this discovery. Legacy architecture cost tables are
unverified examples and must not be used as budgets for this work.

## Shared contract for every implementation child

These are proposed implementation requirements, not claims about the current API.

- Derive tenant and role from the authenticated session. Resolve source, snapshot,
  settings and all dependent resources within that tenant; client IDs are selectors,
  not proof of ownership. Recheck context before saving or approving an action.
- Persist a versioned evidence envelope: capability/version, source and selection
  revision, snapshot ID, financial/daily calculation IDs and versions, config IDs,
  date interval/timezone, actual stock observation, filters and coverage issues.
  Preserve the canonical sales-versus-shared-stock filter semantics from #39/#40.
  Cache keys include this envelope, relevant user inputs and prompt/schema/model
  versions. A source switch or settings change invalidates dependent results.
- Financial amounts, percentages, units, classification and scenario arithmetic
  come from existing server calculations. Bind cited facts to saved result fields;
  model text cannot overwrite them. Missing/partial data stays explicit. Treat
  imported names, descriptions, documents and chat text as untrusted content,
  never as authority to select a tenant, reveal a key or execute a tool.
- Validate capability output shape, enums, bounds and evidence references after
  `parseAgentJson`; reject unknown SKU/brand/source IDs. Separate generated text,
  deterministic facts and labeled fallback output. A model self-confidence score
  is not an evaluated prediction interval or customer approval.
- Reuse AgentRun lifecycle and request observability. Define terminal timeout,
  cancellation, retry, partial-batch and replay behavior. Retries must retain
  incurred usage; concurrent requests must not overrun a shared tenant budget.
- Meter every provider attempt and batch, including retries and failures with
  known usage. Record provider/model, input/output/cache token categories when
  available, usage source and a dated pricing revision. Estimated or unavailable
  usage remains labeled; a transport failure is not proof of zero spend.
- Before provider access, reserve the configured worst-case request allowance;
  enforce aggregate input/output, per-request, per-capability and tenant-period
  limits. Reconcile reservations with actual usage without releasing uncertain
  spend as zero. Pricing, currency, tenant caps and period reset policy must be
  configured/approved before activation. No numeric dollar estimates are asserted
  here. Cost = the sum of metered token categories × their versioned rates, plus
  any approved fixed external-source charges; account for all retries/batches.
- Retain only necessary product aggregates; no customer PII, credentials or full
  raw workbook in prompts/debug exports. Define output/usage retention and
  role-scoped debug visibility. A provider error must not leak prompt contents.
- Outputs are drafts/read-only advice. Price updates, supplier messages,
  advertising publication and calendar writes require their own explicit action
  and audit trail. Reuse calendar approval for authorized calendar writes.

Each child must attach offline fixtures, the business owner's expected outputs,
and actual evaluation results. Required shared cases: cross-tenant ID access,
stale/mixed snapshots, settings changes, missing history/cost, hostile source text,
invalid JSON/IDs, provider timeout, budget exhaustion and duplicate requests.
Deterministic facts must match saved results exactly at their declared precision;
text quality and forecasts need separately approved rubrics below. No paid live
provider run is necessary to complete #53's specification work.

## Execution sequence

| Order | Implementation issue | Required implementation dependencies |
| --- | --- | --- |
| 27.0 | [#93 — Context and usage budgets](https://github.com/MXMT-AI/mxmt/issues/93) | Existing MVP snapshot/publication contracts |
| 27.1 | [#94 — Chat and advice](https://github.com/MXMT-AI/mxmt/issues/94) | #93 |
| 27.2 | [#95 — Marketing briefs](https://github.com/MXMT-AI/mxmt/issues/95) | #93; approved scenario evidence |
| 27.3 | [#96 — Meta/Google labels](https://github.com/MXMT-AI/mxmt/issues/96) | #93; target feed contract and label rules |
| 27.4 | [#97 — Product attributes](https://github.com/MXMT-AI/mxmt/issues/97) | #93; approved attribute dictionary |
| 27.5 | [#98 — External market trends](https://github.com/MXMT-AI/mxmt/issues/98) | #93; approved external source/access policy |
| 27.6 | [#99 — New-product forecasts](https://github.com/MXMT-AI/mxmt/issues/99) | #93, #97; approved analog/backtest policy |

1. Foundation: consistent context, usage and budget controls (27.0).
2. Read-only advice (27.1) and attributes (27.4) can proceed independently on it.
3. Briefs (27.2) need foundation and approved scenario evidence; they do not depend
   on building a new general chat feature. Labels (27.3) use existing classification
   first; optional attribute labels wait for 27.4.
4. External market signals (27.5) are optional and independently gated on an
   approved source. They do not block internal attribute analysis or forecasting.
5. Cold-start forecasts (27.6) need 27.0, 27.4 and approved analog/evaluation policy.
   Forecasts do not replace ordinary reorder calculations or auto-approve orders.

Native GitHub sub-issues, project status and blocking links mirror this order.
All children start in Backlog. Business dependencies stay explicit rather than
moving the whole parent into the MVP release gate.

## 27.0 — Bind AI execution to versioned MVP context and usage budgets

### Inputs and reuse

Authenticated tenant, capability request, saved ScreenSnapshot, selected-source
revision, applicable calculations/config IDs, bounded prompt data and a configured
provider pricing/budget policy. Extend `lib/ai.ts`, AgentRun and context/dependency
helpers, using the existing snapshot/publication readers and #9 lifecycle guards.

### Deliverable

A shared server adapter resolves an immutable, tenant-scoped evidence envelope
for new v2 capabilities. Add schema-validated output handling, attempt-level usage
metadata and atomic reservation/reconciliation. Preserve existing routes until
their explicit migration; distinguish unsupported legacy context from empty data.
Document schema migration and recovery if persistence needs extension.

### Cost and limits

No model call for resolving context or checking a budget. Provider attempts are
metered by the shared contract; test using fake providers with exact usage,
estimated usage, unknown outcome and retry charging. Product owner supplies caps,
pricing revision and reset policy before live activation.

### Acceptance

- [ ] Tenant/source/config/calculation identity is pinned and checked on reads and writes.
- [ ] Concurrent reservations cannot exceed a tenant-period cap; replay cannot double-reserve or double-charge a known attempt.
- [ ] Attempts with unknown outcomes remain conservative and recoverable; retries/batches are all counted.
- [ ] Provider/model/prompt/schema versions and authoritative facts survive persistence and replay; malformed or hostile output cannot replace facts.
- [ ] Existing #9 run-lock/parse behavior and #13 UI contracts remain compatible; no legacy route is silently switched.

## 27.1 — Add evidence-backed merchandising chat and text advice

### Inputs and reuse

27.0 envelope, bounded conversation, requested topic and authorized sales/stock/
scenario result fields. Extend the existing `/api/ai` boundary and shared AI client;
reuse screen/drill-down query contracts rather than building another metrics API.
Do not accept a client-supplied system prompt as the merchandising policy.

### Deliverable

Read-only questions and answers with evidence references, scope/time labels,
missing-data reasons and deterministic fact cards. Reject unsupported requests
or ask for the missing context; never invent an order, stock date or financial
total. No arbitrary SQL/tool execution or autonomous price/calendar changes.

### Cost and limits

Reserve one bounded answer request; define maximum message count, aggregate input
size and output tokens through 27.0. Cache only identical tenant/context/question
versions; bounded server summarization, if used, is a separate metered attempt.

### Acceptance

- [ ] A question about revenue/GP/stock returns the same values, precision and scope as the cited saved result and drill-down.
- [ ] Cross-tenant IDs, stale conversation facts, missing costs and unavailable historical stock yield explicit restricted/unavailable results.
- [ ] Adversarial product text or chat cannot alter system policy, reveal data or trigger actions.
- [ ] Owner evaluates representative Ukrainian questions from #92 with a recorded relevance/correctness rubric; no invented facts are accepted.
- [ ] Budget, total conversation bounds, timeout and deterministic fallback tests pass before UI work is enabled.

## 27.2 — Extend marketing briefs for paid social, SMM and website

### Inputs and reuse

27.0 envelope, validated repricing/reordering scenario revision, approval state,
audience/brand voice, campaign dates and explicit budget/stock constraints. Extend
Commercial Marketer, commercial normalizers/fallbacks, Calendar Agent and existing
recommendation approval; preserve current channel consumers with versioned output.

### Deliverable

Versioned channel drafts for paid social, SMM and website banners/landing content:
objective, audience, message, factual offer, CTA, assets, timing, constraints and
source/scenario references. Separate suggested recommendations from PM-approved
offers. Website is an explicit deliverable rather than an implicit marketplace
brief. Calendar handoff retains approval and idempotency; audit legacy ai-plan
reads before reusing them. No ad submission, email sending or site publishing.

### Cost and limits

Bound brands × selected channels × output tokens and attempts per generation.
Extend existing bounded batches, using 27.0 reservations across the entire request.
Approved budget is an input, not a figure invented by the model. Reuse a draft
until evidence, scenario or brief revision changes.

### Acceptance

- [ ] Same scenario yields consistent price/discount/dates across all channel drafts; unapproved recommendations remain explicitly drafts.
- [ ] Missing budget, discount approval or stock is disclosed; a reorder recommendation cannot be described as a received delivery.
- [ ] Invalid AI output has a labeled factual fallback; partial channel failures preserve successful drafts with their actual incurred usage.
- [ ] Repeat calendar approval does not duplicate events; changed inputs invalidate draft approval.
- [ ] Business reviewers score channel suitability, Ukrainian copy, factual offer and prohibited claims on a recorded rubric.

## 27.3 — Generate versioned Meta and Google custom-label exports

### Inputs and reuse

27.0 snapshot, canonical SKU-to-provider item mapping, approved deterministic label
rules and target-specific feed contract. Reuse daily SKU classifications, settings,
server-side export authorization/audit patterns and source provenance. Existing
repricing/reordering CSV schemas stay unchanged.

### Deliverable

Preview and explicit export of deterministic custom labels with rule version,
provider item ID and rejection reasons. Before implementation, verify current
official Meta/Google field, slot, encoding and value restrictions and attach the
dated contract to this child. Owner approves label meanings, priorities and
overwrite/empty-value policy. Optional attribute labels depend on 27.4. No direct
ad-account sync, campaign modification or claim of advertising performance.

### Cost and limits

Zero LLM calls: label assignment uses server rules. Bound row count/export size,
batch reads and tenant quota; any later provider submission costs belong to a
separate integration decision, not this export feature.

### Acceptance

- [ ] Same snapshot/rules produces stable labels; preview and exported assignments match, with source version and timestamp retained.
- [ ] Only authorized tenant items with verified target IDs are exported; duplicate/missing mappings and unsupported values are reported.
- [ ] Target-specific fixtures validate field limits, escaping/encoding, Unicode, empty values and spreadsheet-formula injection handling.
- [ ] Owner-approved precedence handles overlapping classes and missing inputs without fabricated classifications.
- [ ] Export history identifies actor, scope and rule revision; repeated download does not execute external actions.

## 27.4 — Normalize and analyze real product attributes

### Inputs and reuse

27.0 evidence plus source SKU attribute fields, an owner-approved dimension/value
dictionary and mapping provenance. Initial dimensions (for example dial color,
size or material) must be selected with real sanitized samples. Extend canonical
product identity and connector normalization; keep raw evidence for remapping.
Reuse attribute analysis text composition, existing category UI contracts and
daily SKU/sales publications, not the legacy category STR formula as new truth.

### Deliverable

Tenant-scoped versioned attribute mapping and deterministic per-value aggregates:
coverage, eligible SKU count, stock, sales and approved performance measures.
Unknown/multivalue/conflicting attributes are explicit. Define attribution so
multivalue products do not silently double-count headline totals. AI may explain
aggregates, not infer physical attributes from an unverified name or photograph.

### Cost and limits

Mapping and aggregation require no LLM. Optional bounded explanatory text uses
27.0 token caps, cache and usage. No paid enrichment or image recognition is
included; such sources need separate consent, cost and accuracy evaluation.

### Acceptance

- [ ] Dictionary normalization handles case, Unicode, aliases, unknowns, conflicts and version changes without mixing tenants or SKU identities.
- [ ] Per-value totals reconcile to approved membership rules and saved metrics; returns and missing history remain visible.
- [ ] Category-only legacy results cannot be presented as dial-color/size evidence; inherited category thresholds do not become SKU rules.
- [ ] Tests cover duplicate/multivalue membership, unmapped SKUs, sparse groups and a mapping revision invalidating cached results.
- [ ] Owner approves sample attribute mappings and the performance/status rubric before activation.

## 27.5 — Add sourced external market-trend evidence

### Inputs and reuse

27.0 envelope plus explicitly approved source, access rights, geographic/category
scope, observation period, retrieval time and permitted retention. Reuse normalized
product/attribute dictionaries from 27.4 where applicable. Internal sales trends
remain separately labeled and need no external connector.

### Deliverable

A source adapter and evidence records with provenance, freshness, comparable
scope and an unavailable state. Summaries distinguish external observations,
internal sales and hypotheses. Select source/API, license, update cadence,
currency/normalization semantics and allowed redistribution before coding its
integration. Never fabricate a live market trend from the model's training data.

### Cost and limits

Track source subscription/request quota independently from optional LLM summary
usage. No external source is selected or purchased by #53. Owner must approve the
source's price and access limits; requests and summaries are capped and cached.

### Acceptance

- [ ] Every external assertion points to retained evidence with source, date, geography/category and freshness; missing rights/data blocks ingestion.
- [ ] No source configured, expired quota or incompatible scope produces an explicit unavailable result, not an invented trend.
- [ ] Source failures, stale evidence, hostile content and wrong attribute mapping have reproducible offline tests.
- [ ] Business review defines and evaluates a relevance rubric; correlation is not described as causation or a guaranteed sales uplift.
- [ ] Optional signals do not change financial/classification formulas or become an undocumented forecast input.

## 27.6 — Forecast new-product demand using approved analogs

### Inputs and reuse

27.0 context, 27.4 normalized attributes, launch/receipt dates, observed in-stock
exposure, comparable historical sales/returns, price/season/category and explicit
analog eligibility/horizon policy. Reuse daily exposure/velocity and server
Decimal helpers. Existing reorder quantity/MOQ logic remains authoritative for
ordinary replenishment; this is a separately versioned advisory forecast.

### Deliverable

Before implementation, owner approves an analog selection/similarity policy,
minimum history/cohort size, forecast horizon, season/price handling and fallback.
Implement deterministic server-side selection and estimation under that version;
return analog IDs, weights, exclusions, evidence dates, forecast units and an
honest uncertainty/insufficient-evidence state. Model text explains the result;
it cannot invent analog histories or compute the quantities. No new duplicate
Forecast/Buyer agent or automatic order submission is required.

### Cost and limits

Bound candidate count, history window, compute time and pagination. Deterministic
estimation has zero LLM cost; optional explanations use 27.0. External signals
from 27.5 are opt-in only after their contribution is separately validated.

### Acceptance

- [ ] Frozen fixtures yield reproducible analog membership/weights and outputs; target future data never enters feature selection or training.
- [ ] Out-of-stock censoring, returns, launch cohorts, price differences and missing attributes/exposure are handled explicitly under the approved policy.
- [ ] No suitable analogs or insufficient history yields unavailable/manual review, not a confident zero or fabricated sales.
- [ ] Time-split backtests against simple approved baselines report sample coverage, horizon, error (with a defined zero-demand policy) and bias; numeric pass thresholds require owner approval before release.
- [ ] Forecast intervals, if supplied, have evaluated calibration/coverage; otherwise label uncertainty qualitatively without invented confidence percentages.
- [ ] Forecasts stay separate from actual demand and existing reorder exports; conversion to procurement scenarios requires a separately reviewed action.

## Verification and handoff

Discovery verification: 12 existing contract test files / 58 tests passed on
October 27, 2026. Suites: AI provider, agent context, runs, output, batching,
period, metrics source, UI state, attribute analysis, calendar analysis,
calendar recommendation approval and campaign tracking. These checks preserve
the reuse baseline; they do not execute the planned v2 capabilities. No paid
provider calls, live customer reconciliation or browser verification were run.

For #53, verify referenced files exist, link every child under the parent/project,
and rerun the existing AI/context/attribute/calendar contract tests supporting
the audit. This is discovery evidence, not proof that the proposed v2 features
exist or satisfy customer acceptance. No UI/reference comparison is applicable
until UI implementation starts; then use `vercel-react-best-practices`,
`frontend-design`, `web-design-guidelines` and the existing component system.

Keep all child titles/specifications in English. Link implementation PRs to their
individual children, and record runtime/test evidence there. Closing #53 requires
the audited plan and created child issues, not completion of all child features.
