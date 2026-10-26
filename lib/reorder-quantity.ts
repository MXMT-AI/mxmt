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
  // Divide last so a rounded repeating quotient cannot cross an integer before ceil.
  const target = D(input.weeklyVelocity)
    .mul(input.leadDays + input.coverDays)
    .div(7)
    .ceil();
  const raw = target.sub(input.stock).sub(input.inTransit);
  const demand = raw.gt(0) ? raw : D(0);
  return demand.isZero() ? D(0) : demand.div(input.moq).ceil().mul(input.moq);
}
