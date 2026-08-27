# Data reporting release verification

Verification date: 2026-08-27 (`Europe/Kyiv`)

## Neon migration

`20260827000000_data_import_reporting_schema` was applied successfully with
`prisma migrate deploy`. All four repository migrations are now present in the
connected Neon production database.

## Full pipeline result

The Google workbook was imported through `POST /api/data/import` and all
calculated reports completed.

| Dataset | Verified rows |
| --- | ---: |
| Product YML 2.0 | 4,085 |
| ZAVOD_API | 22,185 |
| ARTICLE REPORT source | 4,997 |
| ARTICLE REPORT calculated | 4,050 |
| BY BRAND calculated | 118 |
| BY CATEGORY calculated | 22 |

The workbook contained 31,267 source rows in total. Its BY BRAND and BY
CATEGORY source tabs were present but empty; the application successfully
generated both grouped reports from the calculated ARTICLE REPORT.

## API verification

The following authenticated endpoints returned HTTP 200 against the active
Neon import:

- `GET /api/data/status`
- `GET /api/data/issues`
- `GET /api/data/tables/product_yml`
- `GET /api/data/tables/zavod_api`
- `GET /api/data/tables/article_report`
- `GET /api/data/tables/by_brand`
- `GET /api/data/tables/by_category`

The active import and calculation have `WARNING` status rather than `FAILED`.
There are 1,373 normalization warnings and 403 informational issues. The
calculation also reports 15 products with negative calculated metrics. These
records remain available through the issues API for source-data review.

## Idempotency regression check

Live verification found that repeated Google XLSX exports can have different
ZIP metadata while containing identical cells. Import pipeline version 3 now
hashes normalized sheet contents instead of the XLSX binary. A repeated cron
call returned:

```json
{
  "importOutcome": "unchanged",
  "calculationOutcome": "cached"
}
```

No new snapshots or report rows were created by that repeated call.

## Production activation checklist

After this branch is merged and deployed:

1. Add `CRON_SECRET` (at least 16 random characters) to the Vercel Production
   environment and redeploy.
2. Confirm the existing Neon and Google Drive variables are available to the
   Production deployment.
3. In **Vercel → Project → Settings → Cron Jobs**, confirm both UTC slots from
   `vercel.json` are enabled.
4. Open `/data-reporting` as an authenticated admin and verify the five tabs.
5. Review the first production cron invocation in Vercel Logs.
