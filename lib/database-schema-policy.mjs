export function databaseSchemaPolicy(url) {
  const schemas = url.searchParams.getAll("schema");
  const schema = schemas[0] ?? "public";
  if (schemas.length > 1 || !schema || schema.includes("\0"))
    throw new Error("Invalid database option: schema");
  const transactionPooled =
    (url.hostname.endsWith(".neon.tech") && /-pooler(?=\.)/.test(url.hostname)) ||
    url.searchParams.get("pgbouncer") === "true";
  if (transactionPooled && schema !== "public")
    throw new Error("Custom schemas require a direct DATABASE_URL; transaction-pooled runtime URLs are unsupported.");
  return { schema, useSessionSearchPath: !transactionPooled };
}
