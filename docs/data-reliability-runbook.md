# Data Reliability Runbook

## Health Check

Use `/api/health` after deploys and data imports.

Expected healthy response:

```json
{
  "ok": true,
  "status": "healthy",
  "checks": {
    "database": "ok",
    "data": {
      "status": "ok",
      "issues": []
    }
  }
}
```

`status: "degraded"` means the app is reachable, but data needs review.

## Data Issues

| Code | Meaning | Action |
| --- | --- | --- |
| `negative_inventory_quantities` | Inventory contains negative quantities | Review source spreadsheet rows and re-run sync after correction |
| `negative_sales_values` | Sales contain negative quantity, revenue, or returns | Review source rows and correct import source |
| `stale_drive_syncs` | Drive sync stayed `running` for more than 30 minutes | Re-run sync from Settings after confirming Drive file access |
| `stale_agent_runs` | Agent run stayed `running` for more than 2 hours | Re-run the affected agent after checking AI provider settings |
| `catalog_item_count_mismatches` | Catalog upload count differs from stored items | Re-upload the affected catalog file |

## Safe Re-Sync

Drive sync is idempotent:

- SKU records are upserted by tenant and SKU
- Inventory snapshots are upserted by tenant, SKU, and snapshot date
- Sales records are upserted by tenant, SKU, date, and channel
- Catalog uploads are replaced by tenant, brand, and season

Re-running sync should update current source state instead of duplicating records.

## Recovery Steps

1. Check `/api/health` and identify `checks.data.issues`.
2. Correct the source file if the issue comes from Google Sheets or catalog upload.
3. Re-run Drive sync or re-upload the catalog.
4. Re-check `/api/health`.
5. If issues remain, inspect the affected table using the issue code as the starting point.

## Deploy Notes

Before production deploy:

```bash
npx prisma migrate deploy
npm run build
```

Do not skip migrations: Phase 3 relies on unique database constraints for idempotent imports.
