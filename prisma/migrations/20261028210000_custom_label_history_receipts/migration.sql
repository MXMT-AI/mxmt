-- Copy legacy custom-label receipts once, so history never has to detoast file payloads.
-- Preserve the original artifact and receipt in after for exact historical downloads.
UPDATE "MerchandisingAction"
SET context = context || jsonb_build_object('receipt', after->'receipt')
WHERE "entityType" = 'CUSTOM_LABEL_EXPORT'
  AND context->>'kind' = 'CUSTOM_LABEL_EXPORT_V1'
  AND NOT (context ? 'receipt')
  AND jsonb_typeof(after->'receipt') = 'object';
