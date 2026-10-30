import { Prisma } from "@prisma/client";

const FinancialDecimal = Prisma.Decimal.clone({ precision: 48 });
export const financialDecimal = (value) => new FinancialDecimal(value);
