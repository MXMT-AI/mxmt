import type { SqlClient } from "@/lib/connectors/database";
import type { ConnectorJob } from "@/lib/connectors/jobs";
import { DataImportTrigger, Prisma } from "@prisma/client";
import { calculateArticleReport, type ArticleCalculationResult } from "@/lib/article-report";
import { importRawDataFromDrive, type RawImportResult } from "@/lib/data-import";

export interface DataPipelineResult {
  import: RawImportResult;
  calculation: ArticleCalculationResult | null;
}

export async function runDataPipeline({
  tenantId,
  trigger = DataImportTrigger.MANUAL,
  calculate = true,
  dateFrom,
  dateTo,
  asOfDate,
}: {
  tenantId: string;
  trigger?: DataImportTrigger;
  calculate?: boolean;
  dateFrom?: string;
  dateTo?: string;
  asOfDate?: string;
}): Promise<DataPipelineResult> {
  const importResult = await importRawDataFromDrive(tenantId, trigger);
  const calculationResult = calculate
    ? await calculateArticleReport({
        tenantId,
        importRunId: importResult.importRunId,
        dateFrom,
        dateTo,
        asOfDate,
      })
    : null;
  return { import: importResult, calculation: calculationResult };
}

export async function completeConnectorInputs(tx: SqlClient, job: Pick<ConnectorJob, "tenantId" | "sourceId" | "importRunId" | "resource">) {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorRecalculation" ("importRunId","tenantId","sourceId","inputProvenance")
    SELECT ${job.importRunId},${job.tenantId},${job.sourceId},jsonb_build_object('resource',${job.resource}::text,'importRunId',${job.importRunId}::text,'activeCatalogRunId',s."activeImportRunId",'orderWatermark',c.checkpoint,'engine','salesdrive-v2','inputConsistency','trigger-watermarks-not-frozen-calculation-inputs')
    FROM "DataSource" s LEFT JOIN "SyncCursor" c ON c."tenantId"=s."tenantId" AND c."sourceId"=s.id AND c.resource='orders'
    WHERE s.id=${job.sourceId} AND s."tenantId"=${job.tenantId} ON CONFLICT DO NOTHING`);
}
