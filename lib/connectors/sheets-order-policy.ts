import type { SheetsFieldMapping } from "../sheets-mapping-contract";
import type { OrderPolicy } from "./order-normalization";
export function sheetsOrderPolicy(mapping: SheetsFieldMapping): OrderPolicy {
  return {
    statuses: mapping.policy.statuses,
    channels: mapping.policy.channels,
    amounts: {
      price: mapping.policy.salesAmount,
      absoluteDiscount: "line",
      currency: mapping.policy.currency,
      ...(mapping.policy.costAmount === "unavailable"
        ? {}
        : { cost: mapping.policy.costAmount }),
    },
  };
}
