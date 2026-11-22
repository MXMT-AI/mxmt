import AgentsPage from "@/components/agents/agents-page/agents-page";
import { requireWorkspaceTenantId } from "@/lib/workspace-request";
import { workspaceReportStorage } from "@/lib/workspace-report-storage";
import { readReportPublication } from "@/lib/merchandising-publication";

export default async function Page() {
  const demoDate = process.env.MXMT_DEMO_AGENT_DATE;
  if (demoDate) {
    return <AgentsPage savedPeriod={{ analysisDate: demoDate, dateFrom: demoDate.slice(0, 7) + "-01" }} />;
  }
  const tenantId = await requireWorkspaceTenantId();
  const storage = await workspaceReportStorage(tenantId);
  const publication = storage && await readReportPublication(tenantId, storage);
  const savedPeriod = publication
    ? { analysisDate: publication.asOf, dateFrom: publication.dateFrom }
    : undefined;
  return <AgentsPage key={publication?.version} savedPeriod={savedPeriod} />;
}
