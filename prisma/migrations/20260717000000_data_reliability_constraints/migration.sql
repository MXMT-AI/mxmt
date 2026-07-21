-- Remove duplicate brands per tenant before adding uniqueness.
WITH ranked_brands AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", lower(name) ORDER BY id) AS rn
  FROM "Brand"
)
UPDATE "Sku" s
SET "brandId" = canonical.id
FROM ranked_brands duplicate
JOIN "Brand" duplicate_brand ON duplicate_brand.id = duplicate.id
JOIN "Brand" canonical ON canonical."tenantId" = duplicate_brand."tenantId"
  AND lower(canonical.name) = lower(duplicate_brand.name)
JOIN ranked_brands canonical_rank ON canonical_rank.id = canonical.id AND canonical_rank.rn = 1
WHERE s."brandId" = duplicate.id AND duplicate.rn > 1;

WITH ranked_brands AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", lower(name) ORDER BY id) AS rn
  FROM "Brand"
)
UPDATE "CatalogUpload" c
SET "brandId" = canonical.id
FROM ranked_brands duplicate
JOIN "Brand" duplicate_brand ON duplicate_brand.id = duplicate.id
JOIN "Brand" canonical ON canonical."tenantId" = duplicate_brand."tenantId"
  AND lower(canonical.name) = lower(duplicate_brand.name)
JOIN ranked_brands canonical_rank ON canonical_rank.id = canonical.id AND canonical_rank.rn = 1
WHERE c."brandId" = duplicate.id AND duplicate.rn > 1;

WITH ranked_brands AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", lower(name) ORDER BY id) AS rn
  FROM "Brand"
)
UPDATE "CatalogItem" c
SET "brandId" = canonical.id
FROM ranked_brands duplicate
JOIN "Brand" duplicate_brand ON duplicate_brand.id = duplicate.id
JOIN "Brand" canonical ON canonical."tenantId" = duplicate_brand."tenantId"
  AND lower(canonical.name) = lower(duplicate_brand.name)
JOIN ranked_brands canonical_rank ON canonical_rank.id = canonical.id AND canonical_rank.rn = 1
WHERE c."brandId" = duplicate.id AND duplicate.rn > 1;

WITH ranked_brands AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", lower(name) ORDER BY id) AS rn
  FROM "Brand"
)
DELETE FROM "Brand" b
USING ranked_brands r
WHERE b.id = r.id AND r.rn > 1;

-- Merge duplicate sales records into one row per tenant/SKU/date/channel.
WITH merged_sales AS (
  SELECT
    MIN(id) AS keep_id,
    "tenantId",
    "skuId",
    date,
    channel,
    SUM("qtySold") AS "qtySold",
    SUM(revenue) AS revenue,
    BOOL_OR("isPromo") AS "isPromo",
    SUM(returns) AS returns
  FROM "SalesRecord"
  GROUP BY "tenantId", "skuId", date, channel
), duplicate_sales AS (
  SELECT s.id
  FROM "SalesRecord" s
  JOIN merged_sales m ON m."tenantId" = s."tenantId"
    AND m."skuId" = s."skuId"
    AND m.date = s.date
    AND m.channel = s.channel
  WHERE s.id <> m.keep_id
)
UPDATE "SalesRecord" s
SET "qtySold" = m."qtySold",
    revenue = m.revenue,
    "isPromo" = m."isPromo",
    returns = m.returns
FROM merged_sales m
WHERE s.id = m.keep_id;

WITH merged_sales AS (
  SELECT MIN(id) AS keep_id, "tenantId", "skuId", date, channel
  FROM "SalesRecord"
  GROUP BY "tenantId", "skuId", date, channel
)
DELETE FROM "SalesRecord" s
USING merged_sales m
WHERE s."tenantId" = m."tenantId"
  AND s."skuId" = m."skuId"
  AND s.date = m.date
  AND s.channel = m.channel
  AND s.id <> m.keep_id;

-- Keep the latest inventory snapshot row per tenant/SKU/date.
WITH ranked_inventory AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", "skuId", "snapshotDate" ORDER BY id DESC) AS rn
  FROM "InventorySnapshot"
)
DELETE FROM "InventorySnapshot" i
USING ranked_inventory r
WHERE i.id = r.id AND r.rn > 1;

-- Keep one catalog upload per tenant/brand/season and move items to it.
WITH ranked_uploads AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", "brandId", season ORDER BY "uploadedAt" DESC, id DESC) AS rn
  FROM "CatalogUpload"
)
UPDATE "CatalogItem" item
SET "catalogId" = canonical.id
FROM ranked_uploads duplicate
JOIN "CatalogUpload" duplicate_upload ON duplicate_upload.id = duplicate.id
JOIN "CatalogUpload" canonical ON canonical."tenantId" = duplicate_upload."tenantId"
  AND canonical."brandId" = duplicate_upload."brandId"
  AND canonical.season = duplicate_upload.season
JOIN ranked_uploads canonical_rank ON canonical_rank.id = canonical.id AND canonical_rank.rn = 1
WHERE item."catalogId" = duplicate.id AND duplicate.rn > 1;

WITH ranked_items AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", "catalogId", sku ORDER BY id DESC) AS rn
  FROM "CatalogItem"
)
DELETE FROM "CatalogItem" item
USING ranked_items r
WHERE item.id = r.id AND r.rn > 1;

WITH ranked_uploads AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId", "brandId", season ORDER BY "uploadedAt" DESC, id DESC) AS rn
  FROM "CatalogUpload"
)
DELETE FROM "CatalogUpload" upload
USING ranked_uploads r
WHERE upload.id = r.id AND r.rn > 1;

UPDATE "CatalogUpload" upload
SET "itemCount" = counts.count
FROM (
  SELECT "catalogId", COUNT(*)::int AS count
  FROM "CatalogItem"
  GROUP BY "catalogId"
) counts
WHERE upload.id = counts."catalogId";

CREATE UNIQUE INDEX "Brand_tenantId_name_key" ON "Brand"("tenantId", name);
CREATE UNIQUE INDEX "SalesRecord_tenantId_skuId_date_channel_key" ON "SalesRecord"("tenantId", "skuId", date, channel);
CREATE UNIQUE INDEX "InventorySnapshot_tenantId_skuId_snapshotDate_key" ON "InventorySnapshot"("tenantId", "skuId", "snapshotDate");
CREATE UNIQUE INDEX "CatalogUpload_tenantId_brandId_season_key" ON "CatalogUpload"("tenantId", "brandId", season);
CREATE UNIQUE INDEX "CatalogItem_tenantId_catalogId_sku_key" ON "CatalogItem"("tenantId", "catalogId", sku);
