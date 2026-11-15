export function parsePlannerQuantity(value: string, badInput = false, emptyValue?: number): number | null {
  if (badInput) return null;
  const quantity = value.trim() === "" ? emptyValue : Number(value);
  return quantity !== undefined && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}
