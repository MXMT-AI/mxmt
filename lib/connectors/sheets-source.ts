import "server-only";
import {Prisma} from "@prisma/client";
import type {SqlClient} from "./database";
import type {ReportingSourceChoice} from "../reporting-source-contract";

export async function readSheetsSources(tenantId:string,tx:SqlClient,sourceId?:string):Promise<ReportingSourceChoice[]>{
  const rows=await tx.$queryRaw<Array<{
    id:string;name:string;mappingRevision:number|null;projectionReady:boolean;
  }>>(Prisma.sql`
    SELECT s.id,s.name,m.revision "mappingRevision",
      COALESCE(r.status IN ('SUCCESS','WARNING')
        AND r.stats->'merchandisingProjection'->>'version'='1'
        AND r.stats->'merchandisingProjection'->>'sourceId'=s.id
        AND r.stats->'merchandisingProjection'->>'importRunId'=r.id
        AND r.stats->'merchandisingProjection'->>'mappingId'=m.id,false) "projectionReady"
    FROM "DataSource" s
    LEFT JOIN LATERAL (
      SELECT id,revision FROM "MerchandisingConfig" c
      WHERE c."tenantId"=s."tenantId" AND c."configType"='SOURCE_MAPPING'
        AND c.key='sheets:'||s.id AND c."isActive" AND c."approvedAt" IS NOT NULL
        AND c."approvedById" IS NOT NULL AND length(btrim(c."approvalReference"))>0
        AND c.values->'sheets'->>'version'='1'
        AND c.values->'sheets'->>'fileId'=s."driveFileId"
      ORDER BY c.revision DESC LIMIT 1
    ) m ON true
    LEFT JOIN "DataImportRun" r ON r.id=s."activeImportRunId"
      AND r."tenantId"=s."tenantId" AND r."sourceId"=s.id
    WHERE s."tenantId"=${tenantId} AND s.kind='GOOGLE_SHEETS'
      ${sourceId?Prisma.sql`AND s.id=${sourceId}`:Prisma.empty}
    ORDER BY s.id`);
  return rows.map(row=>({
    sourceId:row.id,provider:"sheets",accountHost:row.name,revision:row.mappingRevision??0,
    lastCheck:null,selectable:row.mappingRevision!==null,
    readiness:row.mappingRevision===null?"MAPPING_REQUIRED":row.projectionReady?"READY":"IMPORT_REQUIRED",
  }));
}
