export function dedupeBySku<T extends { sku: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.sku, item])).values()];
}
