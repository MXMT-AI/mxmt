import { DataSourceKind } from "@prisma/client";

export const SHEETS_SOURCE_FILTER = { kind: DataSourceKind.GOOGLE_SHEETS } as const;
