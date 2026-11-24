export function sharedPlannerCurrency(rows: readonly { currency: string }[]): string | null {
  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size === 0) return "EUR";
  const currency = currencies.values().next().value;
  return currencies.size === 1 && currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function plannerAmount(value: number, currency: string | null, fmt: (value: number) => string) {
  if (currency === "EUR") return `€${fmt(value)}`;
  return currency && /^[A-Z]{3}$/.test(currency) ? `${fmt(value)} ${currency}` : "—";
}
