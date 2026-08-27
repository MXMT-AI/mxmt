import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/server-auth";
import { DATA_TABLE_KEYS, type DataTableKey } from "@/lib/data-table-api";
import DataReportingWorkspace, {
  type InitialTablePreference,
} from "@/components/data-reporting/DataReportingWorkspace";

export const dynamic = "force-dynamic";

export default async function DataReportingPage() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) redirect("/login");

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

  const initialPreferences = Object.fromEntries(
    preferences.map((preference) => [
      preference.sheetKey,
      {
        visibleColumns: Array.isArray(preference.visibleColumns)
          ? preference.visibleColumns.filter((value): value is string => typeof value === "string")
          : [],
        pageSize: preference.pageSize,
        sortColumn: preference.sortColumn,
        sortDirection: preference.sortDirection === "desc" ? "desc" : "asc",
      },
    ])
  ) as Partial<Record<DataTableKey, InitialTablePreference>>;

  return <DataReportingWorkspace userRole={user.role} initialPreferences={initialPreferences} />;
}
