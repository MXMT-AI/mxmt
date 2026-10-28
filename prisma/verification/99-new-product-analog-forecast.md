# #99 — New-product analog forecasting preparation

## Owner decision and activation boundary

On 2026-10-28 the owner chose **prepare the mechanism; rules and activation later**.
No real policy, approved similarity rule, business horizon or release threshold is
installed. All numeric fixtures are synthetic test parameters. This delivery has
no activation/approval operation: policy configurations remain inactive drafts,
forecasts are `draft_preview`, and evaluations always return `releaseApproved: false`.
An API caller cannot turn a preview into an approved procurement recommendation.

This is an advisory research mechanism, separate from actual demand, existing
reordering calculations and CSV exports. No Forecast/Buyer agent, UI, scheduler,
external market integration or LLM call is added. No price/order is changed.
Applicable customer acceptance remains #92; closed preparation tasks do not approve
customer data or forecast accuracy. Real #97 attribute dictionaries are also still
subject to their own sample/meaning approval.

## Supported draft method and parameters

`AnalogPolicy` in `lib/analog-forecast.ts` is the exact contract. The owner may save
an explicit draft, with no defaults, using:

- `POST /api/merchandising/forecasts/policies/<profileId>` — ADMIN/SUPER_ADMIN,
  body `{expectedRevision, policy}`; a matching tenant dictionary revision and
  source are required. Saving a draft does not approve the dictionary or rules.
- `GET` on that path — ANALYST or above; signed tenant and database membership.

A draft selects the source, pinned dictionary configuration and physical dimensions;
minimum observed in-stock days, minimum/maximum analog count, candidate limit,
horizon, maximum target age, price tolerance, evaluation thresholds and rationale.
Changing the draft produces an immutable new revision; prior evaluation cases are
not mixed into that revision. There is no free-text system prompt, client-authored
history, candidate list, numerical override or external signal in a preview request.

The initial **supported research method**, not an approved business recommendation,
is `equal_weight_saved_velocity`:

1. Use one current saved MVP snapshot for the selected source/settings/publications.
   The existing bounded #96 envelope validator verifies publication identity; saved
   #36 SKU metrics supply exposure, receipt cohort and velocity. The source snapshot
   must have today's business date and a cutoff no later than execution time.
2. Require the target to be merchandise with known category, currency, current price,
   complete verified-receipt history and a first receipt within the configured age.
   A planned launch with no verified receipt is manual review; `dateAdded`, product
   names, images and SKU status are not invented launch dates.
3. Read every category candidate, bounded to at most 500 total SKUs including target,
   before fetching physical attribute bodies. Exceeding the configured limit is an
   explicit error, not silently incomplete pagination or top-N selection.
4. Candidates must share category/currency and be launched by the start of the saved
   84-day history window. Require all 84 stock observations, the configured minimum
   observed in-stock days and saved `SNAPSHOT_DAYS` velocity with KNOWN/ZERO state.
   Receipt-date fallback and unknown/return-dominated net velocity are excluded.
   The technical minimum exposure is 28 days because the existing daily engine uses
   that denominator floor; lower values would not represent uncensored daily rates.
5. Require recorded positive prices in all 84 historical stock observations, the
   same historical/current price and currency, and the explicit relative price
   tolerance to the target. Price changes or missing price evidence are excluded;
   no elasticity, currency conversion or inferred discount is applied. Current price
   and historical price evidence identifiers/hash are frozen with the packet.
6. Require the target's season to cover the forecast period and the analog's saved
   season to cover its entire history through the forecast end. No calendar-season
   shift or seasonal multiplier is guessed. This conservative method may exclude
   seasonal items; a launch-aligned or adjusted method needs a separate policy.
7. Use only single KNOWN values in every selected approved #97 dimension. Unknown,
   unmapped, conflicting or multivalue membership is explicit; analog values must
   exactly match the target's. Optional dimensions/weights are not invented.
8. Sort eligible analogs by canonical SKU ID and take the configured maximum;
   report discarded candidates and exclusion reasons. This is deterministic exact
   membership with stable truncation, not a learned similarity ranking. Each chosen
   analog has the exact rational weight `1 / selected count`.
9. Estimate `mean(saved weekly velocity) × horizon days / 7` using the shared
   financial Decimal helper. Reuse saved net-sales/returns semantics and preserve
   precision. Target velocity/sales never enters selection or the estimate.

The supported history is fixed at the existing 84-day publication contract;
horizons are bounded to 1–84 days and new-target age to 0–83 days. These are
implementation bounds, not approved customer defaults. Wider history, alternate
cohorts, launch-age alignment, brand constraints, different similarity weights or
season/price adjustments require a new supported method and evaluation.

The point estimate is **net units conditional on observed in-stock exposure and
future availability**, not latent unconstrained demand or a guaranteed sales uplift.
Current price is assumed unchanged. Daily stock observations do not prove continuous
intraday availability. Sparse history or no suitable analogs yields `manual_review`
with `forecastUnits: null`; observed zero net sales can remain a genuine zero rate.
There are no estimated confidence percentages or prediction intervals: uncertainty
is `unevaluated`, interval is null, and procurementAction is false.

## Frozen previews and provenance

`POST /api/merchandising/forecasts/preview` requires ANALYST or above:

```json
{
  "profileId": "watch",
  "snapshotId": "saved-mvp-snapshot-id",
  "targetId": "canonical-new-sku-id",
  "preview": true
}
```

The current dictionary must match the policy's pinned revision and be approved.
The route rejects query overrides and `preview: false`. API evidence is private,
no-store; client headers cannot override tenant or role. Expected policy/context
failures retain stable HTTP error codes; unexpected storage failures are sanitized.

Before returning, the service stores an immutable `ANALOG_FORECAST` audit action:
policy version/configuration, target/source/origin, next-day forecast interval,
MVP source/settings/sales/daily provenance, normalized attributes and evidence IDs,
price evidence, complete projected candidate packet, exclusions, exact weights,
point estimate and baselines. No raw product descriptions or customer PII is stored.
An identical tenant/context/policy/packet hash reuses the frozen receipt. Changed
inputs create a new preview; they do not rewrite an old forecast or its origins.

The origin is collected **before** the forecast period begins. Retrospective
recreation from current corrected product/history data is rejected. Actual
rolling-origin evaluation must collect forecasts prospectively, wait for outcomes,
and then score saved receipts. Existing old snapshots alone do not prove what
features were known at an old origin. This follows the temporal separation in
[Hyndman and Athanasopoulos, time-series cross-validation](https://otexts.com/fpp3/tscv.html)
(checked 2026-10-28); it is not validation of this method on customer data.

## Time-split evaluation

`POST /api/merchandising/forecasts/evaluate` requires ANALYST or above:

```json
{
  "profileId": "watch",
  "cases": [
    {"forecastId": "frozen-forecast-id", "outcomeSnapshotId": "later-sales-snapshot-id"}
  ]
}
```

At most 20 cases are loaded per API request. Cases must reference this tenant's
stored forecast and current policy revision; duplicate forecast IDs or duplicate
source/target/business-date origins are rejected. Forecast timestamps must precede
the forecast period and the outcome period must have fully ended before scoring.
No client actuals, weights, confidence or predicted units are accepted.

Each later current-source snapshot must cover the exact saved forecast sales
period and have stock as-of the following business date. Saved canonical merchandise
sales facts, including signed returns/corrections, supply actual net units; preorders
are excluded. The current sales publication must have complete coverage and agree
on category/currency/source. Negative net outcomes are return-dominated, not zero.

The supported `complete_horizon_stock_observations` actuals policy additionally
requires one verified positive-stock observation on **each date of the forecast
horizon**. Evidence must match the tenant/source/SKU, successful import, business
timezone/date and outcome cutoff. The audit retains each observation's ID, date,
quantity, retail price, import ID and source record key. Pre-launch zero stock outside the horizon does
not exclude a new product. A missing, unverified or zero-stock horizon day excludes
the outcome with a reason; it remains in the coverage denominator. No lost-sale
imputation creates convenient zero demand. Changed/missing future retail prices
or currencies also exclude the outcome under the constant-price assumption. Retail
price is a list-price proxy; transaction-level discounts/promotional uplift are not
modeled and need explicit business review. Daily observations remain an imperfect
proxy for intraday availability, a limitation requiring business evaluation.

The frozen baselines are zero and the same eligible category/price/season cohort's
mean saved velocity, before physical-attribute matching. Both are computed at the
origin; neither can see future outcomes. All three methods use the same evaluable
cases for paired comparisons. Reports retain horizon, submitted/scored counts,
coverage, per-case exclusions, MAE in units, bias (`forecast minus actual`) and WAPE
as a ratio. Zero actuals remain in MAE/bias; WAPE is null when total actual is zero.
No MAPE division by zero, interval calibration or accuracy percentage is invented.

Draft thresholds record minimum scored cases/coverage and maximum MAE/absolute bias.
`meetsDraftThresholds` only compares these unapproved parameters. It never grants
release approval or claims baseline superiority. Evaluation receipts retain both
origin and later outcome envelopes and are idempotent for identical evidence.
The unit fixtures simulate frozen times; they do not represent a completed live
customer backtest or independent statistical sample.

## Deferred decisions and release work

Before live forecasting, the owner/business reviewer must approve real attribute
samples, analog membership/similarity, history and exposure minimums, target launch
meaning, horizon, season/price/returns treatment and fallback. Evaluate the supported
method against actual launch cohorts; choose a different method if it is unsuitable.

Freeze an evaluation plan before inspecting its outcomes: origins/cohorts, comparable
baselines, zero-demand policy, minimum coverage/sample size, MAE/bias thresholds and
required baseline comparison. Record actual results and relevance/uncertainty limits
under #92. Overlapping rolling horizons are not automatically independent samples.

Only after those decisions should a separately reviewed activation path be added.
Any procurement conversion requires its own explicit action and audit; existing
MOQ/reordering/export logic remains authoritative. Optional external signals from
#98 and optional LLM explanations require their own validation/budget decisions.
Neither is called or incorporated by this delivery.

## Operations and verification

No schema migration, default policy, live data import, provider call, scheduled job
or browser/UI change is required. Persistence reuses tenant-scoped versioned
configurations and existing immutable audit/idempotency indexes. Retention follows
the existing tenant audit-data lifecycle; there is no new raw source-body or model
prompt store. Inspect policy and forecast receipt IDs for research reproducibility.

Offline checks use isolated PGlite databases with production migrations and
synthetic source histories. They cover deterministic selection/weights/precision,
missing/censored/return-dominated history, attribute and price/season mismatches,
no-analog and zero-sales states, tenant/role isolation, bounds, frozen cache,
source/dictionary/policy revisions, time leakage, real saved outcome aggregation,
zero-demand metrics, duplicate origins and explicit non-approval.

Verification on 2026-10-28:

- `npm test -- --maxWorkers=2` — 139 test files / 1,408 tests passed, including
  38 new analog-forecast checks.
- `npx tsc --noEmit` — exit 0.
- `npm run build` — exit 0.
- `git diff --check` — exit 0.

No real customer backtest, policy approval, provider call or live migration was run.
