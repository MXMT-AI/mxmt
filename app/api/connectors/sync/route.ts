import { importHandlers } from "@/lib/connectors/import-route";
import { getSyncProgress, requestSyncCycle, resumeSyncCycle, resumeSyncBackfill } from "@/lib/connectors/sync-cycles";
import { processSalesDriveSync } from "@/lib/connectors/sync-worker";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export const {GET,POST}=importHandlers({read:async (tenantId)=>{
  const progress=await getSyncProgress(tenantId), c=progress.cycle;
  return {...progress,job:c ? {...c,state:c.state==='QUEUED'?'PENDING':c.state==='ACTION_REQUIRED'?'PAUSED':c.state,mode:'REFRESH',stats:{},issues:[],availableAt:c.requestedAt,updatedAt:c.completedAt ?? c.requestedAt}:null};
},actions:{resumeBackfill:resumeSyncBackfill,resume:resumeSyncCycle,refresh:(tenantId)=>requestSyncCycle(tenantId,'both'),step:processSalesDriveSync},knownErrors:['NOT_CONFIGURED','CATALOG_NOT_CONFIGURED','INVALID_SOURCE_MAPPING']});
