# Google Sheets reporting — step 5: actionable source readiness

Step 4 is committed as `e8bb5bb`. This step adds shared localized source/recovery
UI while preserving existing design tokens, controls and server authorization.
No source selection, mapping approval, import or activation is triggered by viewing
these states.

## User-visible behavior

The five MVP screens reuse ReportingError rather than maintaining five generic
error blocks. Known codes explain missing source selection, Sheets mapping
approval, missing Sheets projection, remote access/import requirements or changed
selection. Recovery links go to Settings or Data & Reports as appropriate; Retry
continues to refresh the report snapshot rather than pretending to import data.
Unknown failures show sanitized generic recovery text, never raw error strings.

ReportingSourceStatus shows the selected source name/provider. On the five-screen
shell it uses a compact presentation so the detailed recovery text is not repeated
above the error card. Data & Reports uses the full readiness explanation and
clarifies that Google Sheets / SalesDrive tabs select a view, while Settings owns
reporting-source selection. A READY source means inputs are ready; it does not
claim that history or every financial metric is complete.

The status request reads only existing safe source-list metadata, is abortable and
non-cacheable, and supports retry. Source-change events refresh the status; a
successful manual Sheets projection now emits that existing event. The component
never starts synchronization, financial calculations or external actions.

## Verification

- Full offline suite: 158 files / 1,582 tests passed.
- All five targeted recovery tests passed after the final presentation adjustment.
- TypeScript and whitespace checks passed.
- Tests cover localized action destinations, Sheets versus remote readiness,
  incomplete-history language, alert/retry/link markup and infrastructure-text
  sanitization.
- Local Chrome showed the no-selected-source scenario with actionable Settings
  recovery. The duplicate explanation found during visual inspection was removed
  from the compact source summary.
- Final production build passed in a separate temporary source copy with synthetic
  JWT values and no production environment files.

No live mapping, source selection, production mutation, commit or push is part of
this step. Real-data acceptance and evidence/latency verification remain step 6.
