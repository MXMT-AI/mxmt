-- Immutable connector journal pages consume a durable per-run budget.
ALTER TABLE "DataImportRun"
  ADD COLUMN "connectorJournalBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "connectorJournalPages" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "DataImportRun_connector_journal_nonnegative"
    CHECK ("connectorJournalBytes" >= 0 AND "connectorJournalPages" >= 0);

-- One-time serialization of existing pages preserves PostgreSQL JSONB text byte semantics.
-- Existing over-limit runs remain intact; application code blocks new pages, not replay.
UPDATE "DataImportRun" AS run
SET "connectorJournalBytes" = pages.bytes,
    "connectorJournalPages" = pages.count
FROM (
  SELECT "tenantId", "sourceId", "importRunId",
         SUM(octet_length(payload::text))::integer AS bytes,
         COUNT(*)::integer AS count
  FROM "DataSourceRecord"
  WHERE resource = 'shopify-query'
  GROUP BY "tenantId", "sourceId", "importRunId"
) AS pages
WHERE run.id = pages."importRunId"
  AND run."tenantId" = pages."tenantId"
  AND run."sourceId" = pages."sourceId";
