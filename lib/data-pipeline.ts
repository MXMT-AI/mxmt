import { DataImportTrigger } from "@prisma/client";
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
