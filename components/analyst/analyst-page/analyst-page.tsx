import { requireWorkspaceTenantId } from "@/lib/workspace-request";
import AnalystApp from "@/components/analyst/analyst-app/analyst-app";
import { loadAnalystClassification } from "@/lib/analyst-classification";
import { prisma } from "@/lib/prisma";

export default async function AnalystPage() {
  const tenantId = await requireWorkspaceTenantId();

  const [classification, tenant] = await Promise.all([
    loadAnalystClassification(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  return (
    <AnalystApp
      initialSkus={classification.skus}
      initialSummary={classification.summary}
      businessModel={classification.businessModel}
      tenantName={tenant?.name ?? ""}
    />
  );
}
