# MVP business rules and decision register

Issue: [#27](https://github.com/MXMT-AI/mxmt/issues/27) · Parent: [#26](https://github.com/MXMT-AI/mxmt/issues/26)

Revision: 0.1, October 23, 2026 (`Europe/Kyiv`)

Status: **D01–D22 approved; E01–E03 evidence gates remain open**.

Accountable decision owner: **Viktor Svertoka (`ViktorSvertoka`)**, confirmed in this task's conversation. The reference was authored for development by Andrii, Olia, and Sasha; no approval from them is asserted here.

This is a decision document, not an active configuration or a change to financial calculations. The decision owner approved every `Dxx` policy below at revision 0.1 on October 23, 2026; [approval is recorded in #27](https://github.com/MXMT-AI/mxmt/issues/27#issuecomment-6371606697). Technical observations (`Txx`) are verified facts, not customer-data approvals. Evidence requests (`Exx`) distinguish missing customer data from approved policy choices.

## 1. Sources and authority

1. [Digital Merchandiser reference and specification](https://claude.ai/artifact/NKECTQztioMNUsgsRjMhwq#artboard-4a9b5111b2ae), v0.1 dated October 12, 2026; reread on October 23. Section references below refer to this artifact.
2. [SalesDrive Swagger](https://api.salesdrive.me/api/docs/) and [published OpenAPI](https://api.salesdrive.me/swagger/openapi-uk.php), retrieved October 23. The latter is YAML, OpenAPI 3.1.1; SHA-256: `44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e`.
3. [Existing Sheets import contract](data-import-contract.md), especially sections 5, 6, 8, and 16. Its approved rules apply to the existing pipeline; they are not approval of the new SalesDrive rules.
4. Current code at `8a67e39`: [normalization](../lib/data-normalization.ts), [article reports](../lib/article-report.ts), [classification](../lib/classify.ts), [reordering](../lib/reorder-calc.ts), [promotions](../lib/promo-calc.ts), [scheduler](../lib/data-scheduler.ts), and [schema](../prisma/schema.prisma).

Resolution order: explicit approval recorded here → agreed client configuration → versioned calculations. Reference examples and existing legacy behavior do not silently override an unresolved decision. When a rule changes, version the settings/calculation and reconcile results before activation; retain provenance and the previous approved version.

## 2. Verified observations

| ID | Observation | Consequence |
| --- | --- | --- |
| T01 | The existing Next.js/React/Prisma application already has tenant isolation, imports, diagnostics, and calculation helpers. | Reuse these boundaries. The optional FastAPI suggestion in section 2 does not require a rewrite or a second client identity model. |
| T02 | The current Sheets normalizer includes statuses `5`/`7`, excludes `6` and others, and falls back to `orderTime`/`updateAt`. Its period and velocity rules are current-month/14-day rules. | New statuses, date policies, 12-week velocity, and thresholds are deliberate contract changes, not fixes to silently apply to legacy reports. |
| T03 | The artifact still ends at the section 10a Reordering heading. Referenced section 11 is absent. | Numbers visible in individual blocks are provisional reference observations; E01 blocks final numerical acceptance. |
| T04 | `ceil(31 × 0.70) = 22`, whereas R4 says 21. | The example cannot validate both the stated formula and an eligible population of 31. An eligible population of 30 would yield 21, but no evidence establishes that population. |
| T05 | Prototype reorder controls show lead time **30** and post-delivery coverage **60** days. Existing code instead uses a fixed 45-day target; `Brand.leadTimeDays` defaults to 14. | D18 approves the prototype's 30/60 policy for the new profile without rewriting existing tenant defaults. |
| T06 | A stock pull at 03:00 observes stock at that actual time, not necessarily yesterday at 23:59. | Never relabel a current pull as a historical end-of-day observation. |

### SalesDrive connector corrections verified against the published schema

The current schema documents `X-Api-Key`, `/api/statuses/`, and `/api/arrival-product/list/`. Order reading uses a form-scoped key; arrival-document reading requires account-level read permission. A single legacy `Form-Api-Key` assumption is insufficient.

`percentDiscount` and `percentCommission` are 0/1 unit flags, paired with `discount` and `commission`; `percentCommission` is **not** the commission percentage. `preSale` was not found in the retrieved schema, which does not prove it is absent from Zavod's payloads.

Arrival documents include types 1–4: receipts, transfers, write-offs, and inventory adjustments. Importing all as purchases would corrupt first-arrival dates, quarantine, STR, and cost. `paymentDate` is the sale date; `updateAt` is a general order-change timestamp. YML cost export is optional. Validate actual account capabilities in E02 before activation.

The order-list schema documents 10 requests/minute, 100/hour, and 1,000/day; verify budget scope across keys/endpoints rather than assuming independent quotas. These observations correct connector assumptions; they do not verify customer-specific field population or accounting meaning.

## 3. Approved business decisions

All rows: owner `ViktorSvertoka`; status **Approved**, October 23, 2026. The issue references identify affected implementation/acceptance areas; E01–E03 still gate customer-specific validation and activation. Policy approval does not fill unknown customer values or retroactively change the legacy contract.

| ID | Decision and approved resolution | Affected issues |
| --- | --- | --- |
| D01 | **Sale statuses:** `[5, 59, 60]` for the new Zavod profile, tenant-configurable. Confirm names and accounting meaning using E02; IDs are not universal across clients. Keep legacy Sheets inclusion unchanged until the new version is implemented and reconciled. | #30, #34, #35, #38 |
| D02 | **Returns, refusals, preorders:** subtract genuine returns (`7`) once; exclude refusal `6` unless evidence identifies a real refund event, which must be modeled separately. Keep paid preorder `33` separate until handover/final sale. A status change must not create a second sale/refund fact. | #30, #34, #35, #38 |
| D03 | **Dates:** use `paymentDate` for sales and a verified return-event date for returns. A generic `updateAt` is not proof of return date. Permit sale `orderTime` fallback only as explicitly flagged/inferred; keep unknown return dates in diagnostics and outside final financial acceptance until a verified fallback is approved. Preserve the old contract's behavior for old runs. | #30, #33, #35, #38 |
| D04 | **Amounts and discounts:** exported `ProductPaymentAmount`/`ProductcostPriceAmount` are reconciliation evidence, not assumed API fields. Normalize a line-level net amount once; do not subtract a discount twice. Use `percentDiscount` to identify percentage vs amount, then verify whether absolute discounts apply per unit or per line and whether `price` is gross/net using E02. Currency and unit cost must also be verified. | #29, #30, #33, #35, #38 |
| D05 | **Commission and preorder fields:** never map the 0/1 `percentCommission` flag into `commission_pct`. Inspect it with `commission` and confirm whether the commission is supplier income or a channel fee. Do not infer consignment ownership from either field. If `preSale` is absent/unreliable, use approved status/configuration mapping. | #29, #30, #34, #35 |
| D06 | **Excluded projects:** use explicit tenant-scoped channel/tag/project identifiers. “Generals” is a reference example, not an approved exclusion list. Start with no configured exclusions until the owner supplies/approves the exact list; show that configuration as unverified during reconciliation. | #34, #35, #38 |
| D07 | **Services and gift cards:** exclude gift cards from merchandise revenue/margin/stock and show their movement separately. Include service revenue as stated in section 10a, but exclude services from stock and SKU classification. Confirm service cost/profit treatment; do not interpret unknown service cost as 100% profit. Show the service component so totals can be reconciled. | #33, #35, #38 |
| D08 | **Ownership and margin completeness:** brand defaults with explicit SKU overrides; preserve unknown ownership until confirmed. Own-stock GP = net revenue − known cost; consignment GP = net revenue × approved commission ratio. Treat zero cost on an ordinary product as missing unless explicitly verified. Exclude unknown-profit rows from both the covered GP and its margin denominator; show covered revenue, excluded counts, and a partial-data label. Do not present partial GP as a complete benchmark match. | #34, #35, #38, #44, #49 |
| D09 | **One repricing CSV schema:** use the union of section 10 and R5: `sku;barcode;brand;category;name;old_price;new_price;discount_pct;promo_days;reason`, UTF-8 BOM, `;`, selected eligible rows only. Export effective discount from final prices. The reorder CSV remains `supplier;sku;barcode;name;qty;unit_cost;sum`. | #44, #48 |
| D10 | **Eligible population and rank:** N counts filtered, valid, own-stock dead/risk SKUs with positive stock/retail price, excluding service/gift-card/unknown-ownership rows. Sort deterministically by goal priority, then canonical SKU ID. `k=ceil(N×share)`; rank is zero-based. `k=0`: empty preview/no export; `k=1`: maximum discount; `k>1`: first maximum, last minimum. Seasonal goal applies the maximum to all k. Manual inclusion stays subject to eligibility. | #44, #45, #48 |
| D11 | **Parameter validation:** percentage units are explicit; min discount 5–35%, max 20–60%, share 10–100% in steps of 5. Reject `min > max` with a field error and block export until valid. Do not silently swap the user's values. Presets only populate inputs. Parameter/filter changes reset manual prices. | #44, #45 |
| D12 | **Rounding, floor, manual prices:** calculated prices round to nearest UAH 10, with half ties upward. With protection on, floor = `ceil(cost/10)×10`; it applies to manual input as a validation rule too. Manual prices retain their explicitly entered positive value to 2 decimals rather than being silently rounded. Below cost requires protection off plus an explicit liquidation flag/reason. Reject zero/invalid prices and automatic “markdowns” that would increase price above the current price; surface a data/eligibility issue instead. | #44, #45, #48 |
| D13 | **WOH boundaries:** use unrounded values: healthy `WOH ≤ 12`, risk `12 < WOH ≤ 26`, dead `WOH > 26` or `days_since_sale ≥ dead_days`. Apply service/data-error/new/off-season/OOS precedence first; a 6-week new-product quarantine means age strictly below 42 days. Unknown last-sale/receipt dates stay data-quality exceptions rather than zero-day ages. Positive stock with zero velocity is not healthy: retain an explicit zero-velocity state, avoid division/NaN, and classify under the approved dead rule after exclusions. | #36, #37, #38 |
| D14 | **Shortage eligibility and counting:** follow section 8 precedence; service/data-error, quarantined new, off-season, and inactive SKUs do not enter automatic shortage recommendations. For eligible active SKUs, count distinct IDs satisfying `qty=0 OR days_to_zero < lead_days+14`. Do not sum overlapping counts. Show off-season items separately, outside the headline count, with reorder quantity zero. Unknown velocity requires a visible/manual-review state. | #37, #41, #46, #47 |
| D15 | **Default reporting period:** local calendar days 1–6 → previous complete month; day 7 onward → current month through yesterday. This resolves the “less than seven days” wording. Custom periods remain inclusive. LY uses the same approved calendar interval; specify leap-day endpoint handling in #35. | #34, #35, #40 |
| D16 | **Availability colors:** green `ratio ≥ 0.85`, amber `0.70 ≤ ratio < 0.85`, red `<0.70`; classify before display rounding. Zero active SKUs → unavailable, not 0%. Approved base thresholds: margin 45%, turnover 3 months, dead 90 days (60/90/120 choices), WOH 12/26, new-product quarantine 6 weeks, category season all year until explicitly configured. Client settings remain versioned and editable. | #34, #37, #38, #41 |
| D17 | **STR cohort:** for MVP, measure since the SKU's first verified external supplier receipt and label it accordingly; later receipts do not silently reset the cohort. This reconciles section 7's first-arrival wording with O8's ambiguous “current batch.” Genuine lot-level/current-batch STR requires approved cohort IDs/allocation and is not inferred from the latest receipt alone. Missing cohort date → unavailable/diagnostic, not a fabricated date. | #31, #36, #38, #43 |
| D18 | **Reorder defaults and MOQ:** lead 30 days, post-delivery cover 60 days from the prototype, MOQ 1; allow supplier settings and scenario overrides. `q=max(0,ceil(speed_wk/7×(lead+cover))-on_hand-in_transit)`, then round positive q up to the MOQ multiple. Zero demand stays zero. These are new-profile settings, not changes to existing 14/45-day defaults. | #34, #46, #47 |
| D19 | **In-transit stock:** use a verified source or an explicit user-maintained value. Unknown is not zero. Show the missing-data reason and block that SKU's final reorder export until its value or explicit zero is confirmed; a provisional preview must disclose any assumption. | #29, #34, #46, #48, #49 |
| D20 | **Supplier representation:** group exports by stable tenant-scoped supplier ID. A brand's default supplier may be overridden per SKU; one supplier may supply several brands. Never equate brand display text with supplier identity. Confirm ownership/purchase terms for consignment before showing procurement cash totals. | #28, #31, #34, #46, #48 |
| D21 | **Snapshot truth and historical periods:** store actual observation time, timezone/business date, and source provenance. Schedule at 03:00 Kyiv, but label a current observation as such; do not pretend it is the previous day's 23:59 stock. Use verified historic snapshots/exports for historic period comparisons, otherwise show unavailable. Do not use a current October stock pull as September's benchmark. | #31, #32, #36, #38, #43 |
| D22 | **Which arrival documents count:** only verified external supplier receipt documents (`type=1`, with approved posting/status rules) establish first receipt, cost and STR cohorts. Transfers/write-offs/inventory adjustments remain distinct raw movement types; internal movements must not reset the new-product clock. Document/supplier/product mappings need E02 verification. | #29, #31, #36, #37, #38 |

Uncontested reference requirements remain applicable: calculate metrics on the server; use the 12-week sales window and a minimum 4-week velocity denominator, with observed in-stock days and an explicitly identified receipt-date fallback while history is insufficient. Reuse one result/version across KPI, detail and export views. The new stock snapshots start on day one; their missing historical coverage must remain visible.

### Approved worked examples for later regression tests

These examples define approved policy behavior; they are not customer-data fixtures or executed application tests. D04's alternative absolute-discount interpretations still require E02 evidence to select the actual customer mapping.

| Decision | Input | Approved policy result |
| --- | --- | --- |
| D04 | price 100, qty 2, discount 10, percentage flag 1; price confirmed pre-discount | net 180. For flag 0, per-line discount gives 190 and per-unit gives 180: E02 must select the actual interpretation. |
| D09–D10 | 31 eligible SKUs, share 70% | 22 selected. “21” remains a reference discrepancy until corrected/explained by an approved fixture. |
| D10 | min 15%, max 40%, k=1 / k=2 | one SKU: 40%; two SKUs: 40%, 15%. |
| D12 | current 250, cost 231, target discount 40%, protection on | calculated 150, cost floor 240, final 240, effective discount 4%; floor is disclosed. |
| D12 | current 100, cost 55, manual 54, protection on | reject. With protection off and explicit liquidation, the below-cost manual value can be accepted. |
| D13 | eligible stocked SKU, no higher-priority status, WOH 12 / 12.01 / 26 / 26.01 | healthy / risk / risk / dead. |
| D14 | SKU A is OOS and also satisfies the risk predicate; SKU B is off-season | headline counts A once and excludes B. |
| D15 | October 6 / October 7, 2026, Kyiv | September 1–30 / October 1–6. |
| D16 | availability 0.6999 / 0.70 / 0.8499 / 0.85 | red / amber / amber / green. |
| D18 | speed 7/week, lead 30, cover 60, stock 10, transit 5, MOQ 6 | demand 90, net need 75, MOQ-rounded order 78. |
| D18–D19 | zero demand / unknown in-transit quantity | zero order without MOQ uplift / export blocked pending confirmation. |
| D21 | stock requested October 23 at 03:00, no prior-day snapshot | observed October 23 at 03:00; no verified October 22 23:59 quantity. |

## 4. Approved Zavod policy profile and approval record

The D01–D22 register is the single source for the approved policy values; do not maintain a second copied settings file. **The new Zavod policy profile is approved at revision 0.1.** Customer-specific field mappings and values remain subject to E02–E03. The existing Sheets pipeline continues to use its own approved contract until a new implementation is validated and activated.

| Approval field | Current value |
| --- | --- |
| Profile | `zavod-salesdrive-mvp`, policy revision 0.1 |
| Decision owner | `ViktorSvertoka` |
| Decision status | Business policy approved; customer evidence pending |
| Approved decision IDs / exceptions | D01–D22 / no policy exceptions requested; E01–E03 gates retained |
| Approval date and evidence link | October 23, 2026 (`Europe/Kyiv`), [owner approval recorded in #27](https://github.com/MXMT-AI/mxmt/issues/27#issuecomment-6371606697) |
| Customer field-mapping verification | E02 pending |
| Frozen benchmark verification | E01 pending |
| Runtime activation | Not performed or authorized by policy approval alone |

The decision owner explicitly approved the submitted D01–D22 revision 0.1 package, including its stated evidence blockers, in the project conversation. The linked issue comment records that approval. This does not assert an approval by Sasha, Olia, or Andrii. Later exceptions must state the chosen alternative, affected setting, rationale, and owner. Policy approval does not verify payload population, supplier terms, or benchmark figures; any policy change increments the version and invalidates affected comparison results.

## 5. Missing evidence and acceptance blockers

| ID | Required evidence | Current state and acceptance effect |
| --- | --- | --- |
| E01 | Full section 11 or a frozen, owner-approved September 2026 reference package, including the detailed reorder specification missing after the final heading. | Not available in the published artifact or repository materials reviewed. Blocks final reconciliation #38 and MVP acceptance #51. Recording this absence satisfies the “obtain or record as blocker” part of #27, but does not pass the blocked acceptance checks. |
| E02 | Sanitized Zavod samples: status dictionary including 5/6/7/33/59/60; paid sale, partial/complete return and preorder→sale; qty>1 percentage/absolute discount; `commission`+unit flag and any `preSale`; YML including cost/currency; supplier receipt and non-receipt movements; verified receipt posting status, identity mapping and event timestamps. | Not supplied or read from a live customer account in this task. Blocks account-specific field mappings and activation in #29–#31, final financial calculations #35, and reconciliation #38. Do not request secrets in issue comments; configure read credentials through the application/approved local environment. |
| E03 | Exact excluded channel/project IDs; brand/SKU ownership and commission terms; supplier mapping, lead/MOQ, in-transit values and category seasons. | Customer-specific values remain unverified despite approval of the policy/defaults. Missing values must remain visible as configuration/data-quality gaps, not hardcoded Zavod assumptions. Relevant gates are D05–D08, D14, D16, D18–D20. |

For E01, each dataset/metric needs its source, period/timezone, filters, units/currency, observation/export time, exact versus rounded precision, formula/settings version, approver and content hash. Keep raw customer exports out of this public repository. Store an approved sanitized fixture or a reference to restricted evidence; preserve provenance without publishing customer records.

### Provisional reference observations, not a signed benchmark

| September 2026 metric | Visible reference value | Qualification |
| --- | ---: | --- |
| Revenue / gross profit | UAH 1,156,812 / 525,595 | Needs E01 and approved inclusion rules. Derived COGS is 631,217, not a separately verified source value. |
| Margin | 45.4% | Rounded display; do not treat it as full-precision input. |
| LY revenue / gross profit | UAH 1,583,791 / 726,565 | Same-period/filter verification required. |
| Orders / units | 309 / 312 | Distinct orders and product quantity are different measures. |
| Stock cost / units | approximately UAH 11.25m / 4,871 | Stock value is rounded; the actual stock observation date/source must be approved. |
| Channels | 522,126 + 499,927 + 73,465 + 61,293 | Sum is 1,156,811, one UAH below the headline. Explain from exact fixtures; do not “repair” a row to force agreement. |
| Old classification: dead/risk/healthy | approximately 7.34m / 3.45m / 0.45m UAH | Rounded totals sum to 11.24m; old classes are not acceptance targets for the new classifier. |
| Alternative no-sales dead-stock example | 874 SKUs / approximately UAH 6.29m | Different rule from the 1,013-SKU / 7.34m old example. Show a versioned comparison, not a mixed KPI. |
| Availability | 274 / 564 = approximately 48.6% | Needs approved active/season definitions. |

The specification's ±1% reconciliation criterion cannot substitute for an approved source scope, timestamp, and policy. Apply it to confirmed money/stock targets; record display-rounding differences separately. Classification requires side-by-side old/new results and explicit threshold approval, not forced equality to old totals.

## 6. Handoff, feature gates, and completion

- **#28:** extend existing tenant/product/import models; preserve unknown values, document movement types, supplier identities and provenance. Avoid a second independent tenant or product system.
- **#29–#31:** use the verified connector corrections above; validate account permissions and E02 mappings. Order and arrival timestamps/permission scopes differ. Do not assume spreadsheet headers are native API/YML field names.
- **#32:** add the new SalesDrive schedule without silently replacing the existing 07:00 Sheets schedule. Preserve DST handling and actual stock observation times.
- **#34–#38:** activate only approved/versioned decisions, retaining old report behavior for old runs. Keep E01–E03 diagnostics and reconciliation gates visible.
- **#40–#43:** preserve reference navigation and context; label stock timestamps, partial margin coverage, unknown values, and shortage/donut denominators accurately. Global channel filtering affects sales, not shared stock.
- **#44–#48:** implement only approved ranking/rounding/eligibility/export rules, with independent worked-example tests. Server calculations and exports must share one implementation; use existing components and avoid duplicated client formulas.
- **#49–#51:** expose unresolved data/settings and require evidence-backed reconciliation. Do not mark incomplete customer checks passed.

Native dependencies connect #27 to #34, #35, #37, #44, #46 and #48. The business-policy gate is satisfied; the evidence gates above remain applicable after this documentation task closes. Historical dependency links may remain for traceability; policy approval must not be mistaken for final acceptance of the dependent tasks.

**The business approval requirement for #27 is satisfied; the documentation is ready for separate commit approval.** The missing benchmark is recorded as an acceptance blocker, as allowed by #27. No application behavior, configuration, migration, commit, or production activation has been performed by preparing and approving this register.
