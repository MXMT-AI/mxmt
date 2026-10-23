/** Validate the provider-independent UTC watermark without accepting ambiguous local dates. */
export function utcWatermark(value: string): Date | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return Number.isFinite(date.getTime()) && date.toISOString() === canonical ? date : null;
}
