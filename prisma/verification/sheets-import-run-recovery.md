# Sheets RUNNING-claim recovery — 2026-10-30

## Reported behavior

The production test account displayed `A raw data import is already running for
this source`, while the previously active import and report remained visible.
The screenshot alone does not establish whether that particular claim was still
executing or was left behind after a terminated request. Browser access was
disabled during diagnosis, so its production row was not inspected or modified.

The raw importer had no expiry for RUNNING claims. A process terminated before
its catch handler could therefore retain the partial unique source/RUNNING index
indefinitely. A later unique-constraint failure during staging could also be
misreported as a concurrent import because the importer mapped every P2002.

## Recovery contract

- A raw claim has a hard ten-minute execution window, exceeding the five-minute
  hosting request budget. Before importing, expire only overdue RUNNING claims
  belonging to the same tenant/source; never expire the currently active import.
- Keep the database unique index as the concurrency arbiter. A fresh concurrent
  claim remains RUNNING and a second claim receives a conflict.
- Reject activation after the local execution deadline. The activation transaction
  also requires the exact claim ID, tenant, source and RUNNING state; a reclaimed
  worker cannot publish over its successor. Run completion and active-source
  selection remain atomic.
- Failed, unpublished payloads use the existing cleanup/pruning policy. Published
  facts and dependent import provenance remain protected by the existing filters.
- Translate a unique conflict only when claiming the run. Later staging-integrity
  failures retain their actual failure category.
- Return distinct live-import and expired-import API codes with recovery guidance.

## Interface behavior

`Refresh view` explicitly reloads saved data rather than downloading Google data.
The workspace explains this alongside Import and Refresh MVP reports. It confirms
successful view refresh, polls status every ten seconds while a remote RUNNING
claim is visible, disables duplicate import clicks for a fresh claim, and permits
retry once the hard execution window expires. It uses actual completedAt fields
for the saved import and report timestamps.

This change does not automatically approve mappings, invent business evidence or
turn a saved-data refresh into an import.

## Verification

- Native isolated PostgreSQL / Prisma 7 replay: a real fresh RUNNING row rejected
  a second import; after making that synthetic claim overdue, the real saved Zavod
  workbook imported in approximately 15 seconds. The previous claim could not be
  activated afterward (Prisma P2025). Legacy calculation completed in about two
  seconds with 3,978 rows and WARNING.
- Unit/API tests cover overdue-claim scope, activation fencing, overlong execution,
  claim collisions versus later uniqueness errors, and explicit recovery codes.
- Full suite: 171 files passed; 1,700 tests passed, one skipped. TypeScript and
  production build passed with local fixture JWT secrets.
- No production claim was force-cleared, production schema was changed, or live
  financial/external action executed. Browser UI verification remains pending.

After deployment, inspect the latest attempt before retrying. Wait for a fresh
claim; retry an expired claim through Import, then verify the new active import,
MVP projection and a newly calculated snapshot. Complete the separately approved
Zavod category/stock-observation activation before expecting populated metrics.
