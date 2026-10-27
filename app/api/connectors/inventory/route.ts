import { importHandlers } from "@/lib/connectors/import-route";
import { enqueueInventoryImport, getInventoryProgress, processInventoryJob, resumeInventoryImport } from "@/lib/connectors/inventory-jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const { GET, POST } = importHandlers({
  read: getInventoryProgress,
  actions: { start: enqueueInventoryImport, resume: resumeInventoryImport, step: processInventoryJob },
  knownErrors: ["CATALOG_NOT_CONFIGURED","IMPORT_BUSY","INVALID_SOURCE_MAPPING"],
});
