import { importHandlers } from "@/lib/connectors/import-route";
import { enqueueOrderImport, getOrderImportProgress, processOrderJob, resumeOrderImport } from "@/lib/connectors/order-jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const { GET, POST } = importHandlers({
  read: async (tenantId) => ({ job: await getOrderImportProgress(tenantId) }),
  actions: { backfill: (tenantId) => enqueueOrderImport(tenantId,"BACKFILL"), incremental: (tenantId) => enqueueOrderImport(tenantId,"INCREMENTAL"), resume: resumeOrderImport, step: processOrderJob },
  knownErrors: ["BACKFILL_REQUIRED","NOT_CONFIGURED","IMPORT_BUSY","INVALID_SOURCE_MAPPING"],
});
