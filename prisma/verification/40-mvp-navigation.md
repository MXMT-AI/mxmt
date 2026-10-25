# MVP navigation and shared filters (#40)

## Scope and reference

The shell follows the reference's primary sections (Overview, Sales, Stock),
action section (Repricing, Reordering) and Settings. The existing AI, Calendar,
Assortment, dashboard and reporting routes remain available under Other tools.
No route is removed and no source calculation is changed.

The Claude reference was inspected in the browser, including its Overview
sidebar/header. The implementation retains the application's existing theme and
system typography: dark base `#080c10`, surface `#0f1419`, border
`rgba(255,255,255,0.07)`, text `#e8ecf0`, muted `#6b7a8d`, accent `#00e5c4`;
the existing light theme provides the corresponding light surfaces. Navigation
uses a 224px rail on desktop and a native keyboard-operable disclosure on mobile.
Active links use a neutral surface, matching the reference hierarchy. Filter
controls wrap rather than introducing horizontal scrolling.

Routes `/overview`, `/sales`, `/stock`, `/repricing` and `/reordering` share one
layout and filter form. Destination components deliberately show a navigation-only
state: detailed KPI cards, tables and scenario controls belong to the subsequent
screen tasks. They do not display fixture values or call the legacy calculators.

## State contract

- URL parameters own applied state: `period=month|quarter|year|custom`, inclusive
  `dateFrom`/`dateTo`, and optional `channelId`. Explicit calendar presets restore
  their dates on reload; custom ranges remain custom.
- D15 defaults reuse `resolveSalesPeriod`: Kyiv days 1–6 select the previous full
  month, day 7 onward selects the current month through yesterday. Quarter/year
  presets end at the last completed day when the interval is current. Future-only,
  invalid or longer-than-366-day intervals are rejected.
- An unapplied form draft is local; Apply pushes one validated URL. Browser
  Back/Forward restores the applied form. Invalid links show a reset action rather
  than silently displaying another date interval.
- `merchandisingHref` preserves common filters, `snapshotId`, `asOf`, currency and
  explicit brand/category/SKU IDs across screen and action links. It discards
  source-screen pagination, sort and search. Use this helper for upcoming KPI and
  table links; do not forward all UI query parameters to the strict #39 API.
- `applyMerchandisingFilters` removes a pinned snapshot when the dates change.
  Changing only the channel keeps it. Stock always carries the All channels
  explanation; the global sales-channel selection remains available on return to
  Sales. The #39 API continues enforcing channel-independent inventory.
- `merchandisingGroup` omits brand grouping for an activated monobrand profile,
  including old links requesting `groupBy=brand`. It selects categories instead.
  Upcoming data screens should use the same helper when translating UI state to
  API parameters.

## Tenant settings, existing tools and access

The merchandising layout authenticates the session with `VIEWER` access and reads
only that tenant's activated profile and normalized channel IDs from its SalesDrive
connection. Queries run in one read-only repeatable-read transaction and return at
most 200 channel choices plus a truncation flag. Excluded channels are removed
before that limit. Missing/older linked channels remain selected and visible as
linked identities rather than being silently reset. No connector secrets or raw
payloads enter client props. No report publication or remote SalesDrive call is
needed to render navigation.

Loading, unavailable settings, invalid links and missing channel options have
localized states and recovery actions. Ukrainian/English labels reuse the current
language provider; document language follows the selected locale. Controls have
labels, native keyboard semantics, focus styles and 44px primary touch targets.
The main skip link is localized. Existing theme, token refresh and auth flows are
reused.

`MVP_NAVIGATION_ENABLED=false` hides the MVP menu group;
`LEGACY_NAVIGATION_ENABLED=false` hides Other tools. Both default to enabled.
These server-side deployment flags affect menu visibility only; routes retain
existing authentication and are not access-controlled by these flags. Shared
filters are carried through menu links to Settings/other tools without claiming
that legacy calculators consume them.

## Verification

```sh
npx vitest run tests/lib/merchandising-navigation.test.ts tests/lib/merchandising-navigation-store.test.ts tests/lib/merchandising-navigation-ui.test.ts
npm test -- --maxWorkers=2
npx tsc --noEmit
npm run build
git diff --check
```

The navigation suites cover D15 boundaries in Kyiv, month/quarter/year/leap-year
presets, invalid deep links, encoded channel IDs, snapshot invalidation, retained
cross-screen context, monobrand grouping, localized markup and menu configuration.
PGlite exercises the real settings/channel reader against synthetic tenants and
checks that rendering choices does not publish financial calculations.

Browser verification used actual shell components with a temporary local router
adapter and synthetic options, without connecting to an application database:
Overview → Sales → Repricing, a quarter selection, reload, browser Back, English,
light theme, and a 390px iframe showing monobrand Stock/custom dates. The mobile
menu was opened with Enter. This verifies component interaction and responsive
layout, not a deployed authenticated Next.js session or physical touch device.
No production data, migrations, import or deployment was performed.
