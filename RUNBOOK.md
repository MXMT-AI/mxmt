# MXMT Analytics Production Runbook

This runbook documents the current Railway production operation process.

## Production Stack

- App hosting: Railway
- Runtime: Next.js App Router
- Database: Railway PostgreSQL
- ORM: Prisma
- AI providers: Anthropic and/or OpenAI
- Source data: Google Drive / Google Sheets export

## Required Environment Variables

Set these in Railway service variables:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `AI_PROVIDER`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_DRIVE_FILE_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_DRIVE_EXPORT_FOLDER_ID`
- `NEXT_PUBLIC_APP_URL`

`GOOGLE_SERVICE_ACCOUNT_KEY` is optional for public-link Drive sync, but required for private Drive access and server-side export flows.

## Deploy Checklist

Before deploying:

1. Confirm the working branch is ready for production.
2. Run:

```bash
npm run build
```

3. Confirm Prisma migrations exist for schema changes.
4. Confirm Railway variables are present.
5. Confirm `/api/health` returns healthy on the target deployment after deploy.

Railway build command:

```bash
npm run build
```

Railway start command:

```bash
npm run db:migrate:deploy && npm run start
```

## Database Migration Process

Create a local development migration after editing `prisma/schema.prisma`:

```bash
npm run db:migrate
```

Review generated SQL in `prisma/migrations/**/migration.sql`.

Production deploy applies migrations with:

```bash
npm run db:migrate:deploy
```

Do not use `prisma db push` against production.

## Health Check

Endpoint:

```text
GET /api/health
```

Expected healthy response:

```json
{
  "ok": true,
  "status": "healthy",
  "checks": {
    "app": "ok",
    "database": "ok"
  }
}
```

If the endpoint returns `503`, check:

1. Railway app logs.
2. Railway PostgreSQL service status.
3. `DATABASE_URL` variable.
4. Latest migration status.

## Backup Checklist

Before risky production changes:

1. Create a Railway PostgreSQL backup or export.
2. Record the backup timestamp.
3. Confirm the target Railway database service is healthy.
4. Keep the previous successful deployment available until verification passes.

Minimum backup moments:

- before schema migrations
- before bulk Google Drive sync changes
- before import logic changes
- before deleting tenant or SKU data

## Restore Checklist

If production data must be restored:

1. Pause writes if possible.
2. Identify the backup timestamp.
3. Restore into a separate database first when possible.
4. Verify row counts for core tables:
   - `Tenant`
   - `User`
   - `Sku`
   - `SalesRecord`
   - `InventorySnapshot`
   - `AgentRun`
5. Point the app to restored `DATABASE_URL` only after validation.
6. Run smoke checks:
   - login
   - dashboard
   - settings
   - Drive sync status
   - latest agent runs

## Rollback Checklist

If deploy fails before migrations:

1. Redeploy the previous successful Railway deployment.
2. Confirm `/api/health`.
3. Review app logs.

If deploy fails after migrations:

1. Do not blindly rollback code if the old code is incompatible with the new schema.
2. Inspect the migration that was applied.
3. Prefer forward-fix migration when data has changed.
4. Restore database only if data corruption or destructive migration occurred.

## Failed Google Drive Sync

Symptoms:

- Settings page shows sync error.
- `/api/sync/drive` returns `500`.
- Dashboard or planner data is stale.

Check:

1. `GOOGLE_DRIVE_FILE_ID` is set.
2. If no service account key is set, the file is shared as `Anyone with the link → Viewer`.
3. If service account mode is used, the file is shared with the service account email.
4. Source sheet contains supported tabs:
   - `ARTICLE REPORT`
   - `ZAVOD_API`
5. Railway logs for `[sync/drive]` or thrown Google download errors.

Recovery:

1. Fix sharing or env variables.
2. Trigger sync again from `/settings`.
3. Verify imported counts for SKU, inventory, and sales.
4. If import logic changed, test on staging/local data before retrying production.

## Failed AI Agent

Symptoms:

- Agent status is `error`.
- `/agents` shows provider/model failure.
- `AgentRun.errorMsg` contains AI provider error.

Check:

1. `AI_PROVIDER` value.
2. Provider key exists:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
3. Provider account has quota.
4. Latest `AgentRun` row for `errorMsg`.
5. Debug modal if `_debug` exists.

Recovery:

1. Fix provider key/quota.
2. Re-run the failed agent.
3. If JSON parsing failed, inspect raw response in `_debug`.
4. If repeated, reduce prompt size or add a stricter fallback.

## Smoke Test After Deploy

Run these checks manually after production deploy:

1. Open `/login`.
2. Log in.
3. Open `/dashboard`.
4. Open `/settings` and verify Drive sync status.
5. Open `/agents` and refresh agent status.
6. Open `/calendar` and verify events load.
7. Open `/assortment` and verify planner data loads.
8. Call `/api/health`.

## Incident Notes

For every production incident, record:

- time started
- user-visible impact
- affected routes
- Railway deployment id
- database backup timestamp
- root cause
- recovery action
- follow-up fix
