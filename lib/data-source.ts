import { DataSourceKind } from "@prisma/client";

// Existing reports and the 07:00 scheduler consume the Sheets contract only.
// Adding a SalesDrive/YML source must not switch those consumers implicitly.
export const SHEETS_SOURCE_FILTER = { kind: DataSourceKind.GOOGLE_SHEETS } as const;
