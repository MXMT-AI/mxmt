import { financialDecimal as D } from "./financial-decimal.mjs";
/** Approved D18 quantity formula, shared by policy previews and the MVP calculator. */
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
    .div(7)
    .mul(input.leadDays + input.coverDays)
    .ceil();
  const raw = target.sub(input.stock).sub(input.inTransit);
  const demand = raw.gt(0) ? raw : D(0);
  return demand.isZero() ? D(0) : demand.div(input.moq).ceil().mul(input.moq);
}
