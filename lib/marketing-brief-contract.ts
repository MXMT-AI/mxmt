import { isRecord } from "./api-contracts";
import { AiExecutionError, boundedText, identifier } from "./ai-execution/contracts";
import { MARKETING_CHANNELS, type MarketingChannel, type MarketingCopy } from "./marketing-brief-output";
import type { AiEvidence } from "./ai-execution/context";

export interface MarketingBriefRequest {
  mode:"marketing_v2";
  briefId:string;
  revision:number;
  snapshotId:string;
  scenarioExportId:string;
  kind:"reprice"|"reorder";
  brandId:string;
  channels:MarketingChannel[];
  audience:string;
  brandVoice:string;
  campaign:{from:string;to:string};
  budget:{amount:string;currency:string}|null;
}
export interface MarketingDraft {
  version:1;
  briefId:string;
  revision:number;
  draftId:string;
  brand:{id:string;name:string};
  request:MarketingBriefRequest;
  evidenceFingerprint:string;
  offer:NonNullable<AiEvidence["facts"]["scenario"]>;
  status:"draft";
  approvalRequired:true;
  constraints:string[];
  channels:Array<MarketingCopy & {channel:MarketingChannel;mode:"generated"|"factual_fallback";reason?:string;audience:string;brandVoice:string;timing:MarketingBriefRequest["campaign"]}>;
  executionId:string|null;
  runId:string|null;
  usage:{executionId:string;state:string;charged:string;held:string;currency:string}|null;
}
const invalid=():never=>{throw new AiExecutionError("AI_INVALID_MARKETING_BRIEF",400);};
export function parseMarketingBrief(value:unknown):MarketingBriefRequest {
  if (!isRecord(value) || Object.keys(value).sort().join()!=="audience,brandId,brandVoice,briefId,budget,campaign,channels,kind,mode,revision,scenarioExportId,snapshotId" || value.mode!=="marketing_v2") return invalid();
  for (const key of ["briefId","snapshotId","brandId"] as const) identifier(value[key]);
  if (!Number.isSafeInteger(value.revision)||Number(value.revision)<1||Number(value.revision)>10000 || !["reprice","reorder"].includes(String(value.kind))) return invalid();
  if (typeof value.scenarioExportId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.scenarioExportId)) return invalid();
  boundedText(value.audience,500);boundedText(value.brandVoice,500);
  if (!Array.isArray(value.channels)||!value.channels.length||value.channels.length>3||new Set(value.channels).size!==value.channels.length||value.channels.some(c=>!MARKETING_CHANNELS.includes(c)))return invalid();
  const date=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(v).getTime())&&new Date(v).toISOString().slice(0,10)===v;
  if (!isRecord(value.campaign)||Object.keys(value.campaign).sort().join()!=="from,to"||!date(value.campaign.from)||!date(value.campaign.to)||String(value.campaign.from)>String(value.campaign.to)||new Date(String(value.campaign.to)).getTime()-new Date(String(value.campaign.from)).getTime()>90*86400000)return invalid();
  if (value.budget!==null&&(!isRecord(value.budget)||Object.keys(value.budget).sort().join()!=="amount,currency"||typeof value.budget.amount!=="string"||!/^\d{1,9}(\.\d{1,2})?$/.test(value.budget.amount)||typeof value.budget.currency!=="string"||! /^[A-Z]{3}$/.test(value.budget.currency)))return invalid();
  const request=structuredClone(value) as unknown as MarketingBriefRequest;
  request.channels.sort();request.scenarioExportId=request.scenarioExportId.toLowerCase();
  return request;
}
