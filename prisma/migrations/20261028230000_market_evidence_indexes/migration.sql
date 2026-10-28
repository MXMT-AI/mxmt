CREATE INDEX "MerchandisingAction_market_cache_idx"
ON "MerchandisingAction" ("tenantId", (context->>'cacheKey'), "createdAt" DESC, id DESC)
WHERE "entityType"='MARKET_EVIDENCE' AND context->>'kind'='MARKET_EVIDENCE_V1';

CREATE INDEX "MerchandisingAction_market_quota_idx"
ON "MerchandisingAction" ("tenantId", (context->>'quotaKey'), (context->>'budgetFrom'), (context->>'budgetTo'))
WHERE "entityType"='MARKET_REQUEST' AND context->>'kind'='MARKET_REQUEST_V1';

CREATE INDEX "MerchandisingAction_market_expiry_idx"
ON "MerchandisingAction" ((context->>'expiresAt'))
WHERE "entityType"='MARKET_EVIDENCE' AND context->>'kind'='MARKET_EVIDENCE_V1'
  AND COALESCE(after->>'purged','false')<>'true';
