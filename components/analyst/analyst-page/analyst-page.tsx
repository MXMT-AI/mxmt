import { headers } from "next/headers";
import AnalystApp from "@/components/analyst/analyst-app/analyst-app";
import { loadAnalystClassification } from "@/lib/analyst-classification";
import { prisma } from "@/lib/prisma";

export default async function AnalystPage() {
  const requestHeaders = await headers();
  const tenantId = requestHeaders.get("x-tenant-id")!;

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
