-- Latest as-of attribute evidence lookup stays indexed and independent of full retained feed payloads.
CREATE INDEX "DataSourceRecord_attribute_product_observation_idx"
ON "DataSourceRecord" ("tenantId", "sourceId", (payload->>'productId'), "observedAt" DESC, "createdAt" DESC, id DESC)
WHERE resource = 'product-attributes';
