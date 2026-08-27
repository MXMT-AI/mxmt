# Scheduled data import on Vercel

The production data pipeline runs every day during the `07:00–07:59`
`Europe/Kyiv` window. It imports the Google workbook and calculates ARTICLE
REPORT, BY BRAND, and BY CATEGORY for every tenant that already has a
configured `DataSource`. Prisma reads and writes these records in the Neon
PostgreSQL database configured by `DATABASE_URL` and `DIRECT_URL`.

Run the first import manually from **Data & Reports** before enabling the cron.
That first run creates the tenant's `DataSource`; scheduled runs discover it
automatically.

## DST-safe Vercel configuration

Vercel evaluates cron expressions in UTC. Kyiv changes between UTC+2 and UTC+3.
The project therefore defines two once-daily jobs in `vercel.json`:

```text
04:00 UTC → 07:00 Kyiv during daylight-saving time
05:00 UTC → 07:00 Kyiv during standard time
```

Both endpoints use the same local-time gate. The invocation that does not fall
inside Kyiv's 07:00 hour returns HTTP 200 with `"skipped": true`. This design
works with the Vercel Hobby once-per-day-per-job restriction as well as Pro and
Enterprise plans.

Vercel Hobby may invoke a daily cron anywhere within the configured hour. Pro
and Enterprise invoke it within the configured minute. Therefore exact 07:00
minute precision requires a paid Vercel plan; on Hobby the run can start
between 07:00 and 07:59 Kyiv.

## Required Vercel environment variables

Add these variables for the **Production** environment and redeploy:

```text
CRON_SECRET=<random value of at least 16 characters>
DATABASE_URL=<Neon pooled connection string>
DIRECT_URL=<Neon direct connection string>
GOOGLE_DRIVE_FILE_ID=<source workbook ID>
GOOGLE_SERVICE_ACCOUNT_KEY=<base64 service account JSON, when required>
```

When `CRON_SECRET` is present, Vercel automatically sends it as
`Authorization: Bearer <CRON_SECRET>` to cron endpoints. The application rejects
missing or invalid credentials.

The cron configuration becomes active after the production deployment. Verify
it in **Vercel Project → Settings → Cron Jobs** and inspect each invocation via
**View Logs**.

Official references:

- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Cron usage and plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Manual verification

An authorized forced request bypasses only the local-time gate:

```bash
curl --fail --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  "https://your-production-domain.example/api/cron/data-import?force=1"
```

Expected successful response fields:

```json
{
  "ok": true,
  "skipped": false,
  "tenants": { "total": 1, "succeeded": 1, "failed": 0 }
}
```
