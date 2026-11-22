import { prisma } from "@/lib/prisma";
import { SHEETS_SOURCE_FILTER } from "@/lib/data-source";
import { agentDataSourceMessages as ukrainianCopy } from "@/messages/uk.json";
import { workspaceReportStorage } from "@/lib/workspace-report-storage";
import { readReportPublication } from "@/lib/merchandising-publication";

export async function getActiveAgentImportRunId(tenantId: string): Promise<string | null> {
  if (process.env.MXMT_DEMO_AGENT_DATE) {
    const demo = await prisma.dataSource.findFirst({
      where: {
        kind: "CSV",
        sourceKey: "LA-310",
        tenantId,
        activeImportRun: { status: "SUCCESS", products: { some: {} } },
      },
      select: { activeImportRunId: true },
    });
    return demo?.activeImportRunId ?? null;
  }
  const storage = await workspaceReportStorage(tenantId);
  const publication = storage && await readReportPublication(tenantId, storage);
  if (publication?.agentSource) return publication.agentSource.importRunId;
  const source = await prisma.dataSource.findFirst({
    where: {
      ...SHEETS_SOURCE_FILTER,
      tenantId,
      activeImportRunId: { not: null },
      activeImportRun: { status: { in: ["SUCCESS", "WARNING"] } },
    },
    orderBy: { updatedAt: "desc" },
    select: { activeImportRunId: true },
  });

  return source?.activeImportRunId ?? null;
}

export function brandValueFromAgentId(brandId: string): string | null {
  if (brandId === "brand:null" || brandId === "__unbranded__") return null;
  if (brandId.startsWith("brand:value:")) return brandId.slice("brand:value:".length);
  throw new Error(ukrainianCopy.errorЗастарілийІдентифікаторБрендуПерезапустітьАгента);
}
