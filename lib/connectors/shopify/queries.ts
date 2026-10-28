const money = "shopMoney { amount currencyCode }";
const page = "pageInfo { hasNextPage endCursor }";
const transaction = `id kind status processedAt test amountSet { ${money} }`;
export const QUERIES = {
  Identity: `query Identity { shop { id myshopifyDomain ianaTimezone currencyCode } currentAppInstallation { app { id } accessScopes { handle } } }`,
  Locations: `query Locations($after:String) { locations(first:100,after:$after) { nodes { id name isActive } ${page} } }`,
  Orders: `query Orders($after:String,$filter:String!,$sort:OrderSortKeys!) { orders(first:1,after:$after,query:$filter,sortKey:$sort) { nodes { id createdAt updatedAt cancelledAt test taxesIncluded currencyCode displayFinancialStatus totalPriceSet { ${money} } subtotalPriceSet { ${money} } transactionsCount { count precision } transactions(first:250) { ${transaction} } refunds { id updatedAt } } ${page} } }`,
  OrderLines: `query OrderLines($id:ID!,$after:String) { order(id:$id) { id updatedAt lineItems(first:100,after:$after) { nodes { id sku quantity currentQuantity originalUnitPriceSet { ${money} } discountAllocations { allocatedAmountSet { ${money} } } variant { id } } ${page} } } }`,
  RefundLines: `query RefundLines($id:ID!,$after:String) { refund(id:$id) { id updatedAt refundLineItems(first:100,after:$after) { nodes { id quantity subtotalSet { ${money} } totalTaxSet { ${money} } lineItem { id sku variant { id } } } ${page} } } }`,
  RefundTransactions: `query RefundTransactions($id:ID!,$after:String) { refund(id:$id) { id updatedAt totalRefundedSet { ${money} } transactions(first:100,after:$after) { nodes { ${transaction} } ${page} } } }`,
  OrderFence: `query OrderFence($id:ID!) { order(id:$id) { id updatedAt } }`,
  Variants: `query Variants($after:String) { productVariants(first:1,after:$after) { nodes { id sku title barcode price compareAtPrice updatedAt selectedOptions { name value } product { id title vendor productType updatedAt } inventoryItem { id tracked } } ${page} } }`,
  Levels: `query Levels($id:ID!,$after:String) { inventoryItem(id:$id) { id tracked inventoryLevels(first:100,after:$after) { nodes { id location { id isActive } quantities(names:["on_hand"]) { name quantity } } ${page} } } }`,
  Cost: `query Cost { inventoryItems(first:1) { nodes { id unitCost { amount currencyCode } } ${page} } }`,
} as const;
export type QueryName = keyof typeof QUERIES;
