-- Frozen filterable read models refer to the same tenant-scoped derived manifest.
CREATE UNIQUE INDEX "SkuDaily_screen_identity" ON "SkuDaily" (id,"skuId","tenantId");
CREATE TABLE "MerchandisingScreenFact" (
 "snapshotId" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"lineId" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL,"orderId" TEXT NOT NULL,"skuId" TEXT,sku TEXT,name TEXT,
 "brandId" TEXT,"brandName" TEXT,"categoryId" TEXT,"categoryName" TEXT,
 "channelId" TEXT,"channelName" TEXT,currency TEXT,"productKind" TEXT NOT NULL,kind TEXT NOT NULL,
 "inCurrent" BOOLEAN NOT NULL,"inPriorYear" BOOLEAN NOT NULL,
 revenue DECIMAL(38,12),quantity DECIMAL(38,12),"grossProfit" DECIMAL(38,12),
 PRIMARY KEY("snapshotId","lineId"),
 FOREIGN KEY("snapshotId","tenantId") REFERENCES "MerchandisingConfig"(id,"tenantId") ON DELETE CASCADE,
 CHECK(kind IN ('SALE','RETURN','CORRECTION','PREORDER')),
 CHECK("inCurrent" OR "inPriorYear")
);
CREATE INDEX "ScreenFact_filters" ON "MerchandisingScreenFact" ("tenantId","snapshotId","brandId","categoryId","skuId","channelId");
CREATE TABLE "MerchandisingScreenSku" (
 "snapshotId" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"skuId" TEXT NOT NULL,"dailyId" TEXT NOT NULL,details JSONB NOT NULL,
 PRIMARY KEY("snapshotId","skuId"),
 FOREIGN KEY("snapshotId","tenantId") REFERENCES "MerchandisingConfig"(id,"tenantId") ON DELETE CASCADE,
 FOREIGN KEY("dailyId","skuId","tenantId") REFERENCES "SkuDaily"(id,"skuId","tenantId") ON DELETE NO ACTION,
 CHECK(jsonb_typeof(details)='object')
);
CREATE INDEX "ScreenSku_scope" ON "MerchandisingScreenSku" ("tenantId","snapshotId");
