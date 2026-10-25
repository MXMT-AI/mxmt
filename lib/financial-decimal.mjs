import { Prisma } from "@prisma/client";

const FinancialDecimal = Prisma.Decimal.clone({ precision: 48 });
/** Local financial precision; never change the legacy global Decimal defaults.
 * @param {string | number} value
 */
export const financialDecimal = (value) => new FinancialDecimal(value);
