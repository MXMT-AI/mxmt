import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/server-auth";
import {
  DATA_TABLE_KEYS,
  isDataTableKey,
  normalizeTablePreferences,
  type DataTableKey,
  type TablePreferenceInput,
} from "@/lib/data-table-preferences";
import DataReportingHub from "@/components/data-reporting/data-reporting-hub/data-reporting-hub";


export default async function DataReportingPage() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return redirect({href: "/login", locale: await getLocale()});

  const preferences = await prisma.dataTablePreference.findMany({
    where: {
      tenantId: user.tenantId,
      userId: user.userId,
      sheetKey: { in: [...DATA_TABLE_KEYS] },
    },
    select: {
      sheetKey: true,
      visibleColumns: true,
      pageSize: true,
      sortColumn: true,
      sortDirection: true,
    },
  });

  const savedPreferences: Partial<Record<DataTableKey, TablePreferenceInput>> = {};
  for (const preference of preferences) {
    if (isDataTableKey(preference.sheetKey)) {
      savedPreferences[preference.sheetKey] = preference;
    }
  }
  const initialPreferences = normalizeTablePreferences(savedPreferences);

  return <DataReportingHub userRole={user.role} initialPreferences={initialPreferences} />;
}
