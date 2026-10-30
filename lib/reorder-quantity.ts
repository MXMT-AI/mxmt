import { financialDecimal as D } from "./financial-decimal.mjs";
export function reorderQuantity(input: {
  weeklyVelocity: string;
  leadDays: number;
  coverDays: number;
  stock: string;
  inTransit: string | null;
  moq: number;
}) {
  if (input.inTransit === null) return null;
  const target = D(input.weeklyVelocity)
    .mul(input.leadDays + input.coverDays)
    .div(7)
    .ceil();
  const raw = target.sub(input.stock).sub(input.inTransit);
  const demand = raw.gt(0) ? raw : D(0);
  return demand.isZero() ? D(0) : demand.div(input.moq).ceil().mul(input.moq);
}
