# Scheduled data import

The production data pipeline runs every day during the `07:00–07:59`
`Europe/Kyiv` window. The pipeline imports the Google workbook and calculates
ARTICLE REPORT, BY BRAND, and BY CATEGORY for every tenant that already has a
configured `DataSource`.

Run the first import manually from **Data & Reports** before enabling the cron
service. That first run creates the tenant's `DataSource`; later scheduled runs
discover it automatically.

## Why Railway calls the app hourly

Railway cron expressions use UTC. Kyiv changes between UTC+2 and UTC+3, so a
single daily UTC expression would move by one hour after a daylight-saving
transition. Configure Railway to invoke the application at minute zero of
every hour. The protected endpoint converts the current instant to
`Europe/Kyiv` and skips all calls outside the 07:00 local hour.

The import and calculation layers are idempotent. A repeated authorized call
does not duplicate source rows or report results.

## Required variables

Set the same values on the web service and the cron service:

```text
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
CRON_SECRET=<random secret generated with openssl rand -base64 32>
```

The web service also needs the existing Google Drive and database variables.

## Railway cron service

Create a second Railway service from this repository and configure:

```text
Start Command: npm run cron:data-import
Cron Schedule: 0 * * * *
```

The command calls `GET /api/cron/data-import` with
`Authorization: Bearer $CRON_SECRET`, prints the JSON result, and exits. A
failed HTTP response produces a non-zero process exit code so the run is
visible as failed in Railway.

Railway schedules cron services in UTC and expects each execution to exit when
its work is complete. See the official
[Railway Cron Jobs documentation](https://docs.railway.com/cron-jobs).

## Manual verification

An authorized forced request bypasses only the local-time gate:

```bash
curl --fail --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/cron/data-import?force=1"
```

Expected successful response fields:

```json
{
  "ok": true,
  "skipped": false,
  "tenants": { "total": 1, "succeeded": 1, "failed": 0 }
}
```

Outside the Kyiv 07:00 hour, a normal request returns HTTP 200 with
`"skipped": true`. Missing or invalid cron credentials return HTTP 503 or 401.
