import { timingSafeEqual } from "node:crypto";
import { DataImportTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runDataPipeline, type DataPipelineResult } from "@/lib/data-pipeline";

export const DATA_SCHEDULE_TIMEZONE = "Europe/Kyiv";
export const DATA_SCHEDULE_HOUR = 7;
const SCHEDULER_CONCURRENCY = 2;

export interface ScheduleDecision {
  shouldRun: boolean;
  businessDate: string;
  localTime: string;
  timezone: string;
}

export interface ScheduledTenantResult {
  tenantId: string;
  ok: boolean;
  importOutcome?: DataPipelineResult["import"]["outcome"];
  importRunId?: string;
  importStatus?: string;
  calculationOutcome?: NonNullable<DataPipelineResult["calculation"]>["outcome"];
  calculationRunId?: string;
  calculationStatus?: string;
  error?: string;
}

interface SchedulerDatabase {
  dataSource: {
    findMany(args: {
      select: { tenantId: true };
      distinct: ["tenantId"];
      orderBy: { tenantId: "asc" };
    }): Promise<Array<{ tenantId: string }>>;
  };
}

type Pipeline = (input: {
  tenantId: string;
  trigger: DataImportTrigger;
  calculate: true;
  asOfDate: string;
}) => Promise<DataPipelineResult>;

export function scheduledImportDecision(
  now = new Date(),
  timezone = DATA_SCHEDULE_TIMEZONE
): ScheduleDecision {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const businessDate = `${value("year")}-${value("month")}-${value("day")}`;
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    shouldRun: hour === DATA_SCHEDULE_HOUR,
    businessDate,
    localTime: `${businessDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timezone,
  };
}

export function cronSecretMatches(authorization: string | null, configuredSecret: string | undefined): boolean {
  if (!configuredSecret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const actual = Buffer.from(configuredSecret);
  const candidate = Buffer.from(supplied);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

async function runTenant(
  tenantId: string,
  businessDate: string,
  pipeline: Pipeline
): Promise<ScheduledTenantResult> {
  try {
    const result = await pipeline({
      tenantId,
      trigger: DataImportTrigger.CRON,
      calculate: true,
      asOfDate: businessDate,
    });
    return {
      tenantId,
      ok: true,
      importOutcome: result.import.outcome,
      importRunId: result.import.importRunId,
      importStatus: result.import.status,
      calculationOutcome: result.calculation?.outcome,
      calculationRunId: result.calculation?.calculationRunId,
      calculationStatus: result.calculation?.status,
    };
  } catch (error) {
    return { tenantId, ok: false, error: message(error) };
  }
}

export async function runScheduledDataPipelines(
  businessDate: string,
  db: SchedulerDatabase = prisma,
  pipeline: Pipeline = runDataPipeline
): Promise<ScheduledTenantResult[]> {
  const sources = await db.dataSource.findMany({
    select: { tenantId: true },
    distinct: ["tenantId"],
    orderBy: { tenantId: "asc" },
  });
  const results: ScheduledTenantResult[] = [];
  for (let index = 0; index < sources.length; index += SCHEDULER_CONCURRENCY) {
    const batch = sources.slice(index, index + SCHEDULER_CONCURRENCY);
    results.push(...await Promise.all(
      batch.map(({ tenantId }) => runTenant(tenantId, businessDate, pipeline))
    ));
  }
  return results;
}
