import {Temporal} from "@js-temporal/polyfill";
import {isRecord} from "./api-contracts";
import {financialDecimal as D} from "./financial-decimal.mjs";
export const RETROSPECTIVE_POLICY_VERSION="retrospective-v1";
export const RETROSPECTIVE_SKU_LIMIT=500;
export class RetrospectiveExecutionError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export const retrospectiveId=(v:unknown):string=>{if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new RetrospectiveExecutionError("INVALID_RETROSPECTIVE_ID");return v;};
const exact=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).sort().join()===fields.slice().sort().join();
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=1000&&!/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export const retrospectiveInstant=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace(".000Z","Z")===v.replace(".000Z","Z");
export type ExecutionEvent="APPLIED"|"SENT"|"ACCEPTED"|"RECEIVED";
export interface ExecutionCommand {requestKey:string;exportId:string;kind:"reprice"|"reorder";event:ExecutionEvent;occurredAt:string;evidenceReference:string;skuIds:string[];previousExecutionId:string|null;receiptIds:string[]}
export function parseExecutionCommand(v:unknown):ExecutionCommand {
 const bad=():never=>{throw new RetrospectiveExecutionError("INVALID_EXECUTION_CONFIRMATION");};
 if(!isRecord(v)||!exact(v,["requestKey","exportId","kind","event","occurredAt","evidenceReference","skuIds","previousExecutionId","receiptIds"])||!uuid(v.requestKey)||!uuid(v.exportId)||!["reprice","reorder"].includes(String(v.kind))||!["APPLIED","SENT","ACCEPTED","RECEIVED"].includes(String(v.event))||!retrospectiveInstant(v.occurredAt)||!text(v.evidenceReference)||!Array.isArray(v.skuIds)||!v.skuIds.length||v.skuIds.length>RETROSPECTIVE_SKU_LIMIT||new Set(v.skuIds).size!==v.skuIds.length||!Array.isArray(v.receiptIds)||v.receiptIds.length>25||new Set(v.receiptIds).size!==v.receiptIds.length)return bad();
 for(const id of [...v.skuIds,...v.receiptIds])retrospectiveId(id);
 if(v.kind==="reprice"&&(v.event!=="APPLIED"||v.previousExecutionId!==null||v.receiptIds.length)||v.kind==="reorder"&&(v.event==="APPLIED"||v.event==="SENT"&&v.previousExecutionId!==null||v.event!=="SENT"&&!uuid(v.previousExecutionId)||v.event!=="RECEIVED"&&v.receiptIds.length||v.event==="RECEIVED"&&!v.receiptIds.length))return bad();
 return {...structuredClone(v) as unknown as ExecutionCommand,requestKey:v.requestKey.toLowerCase(),exportId:v.exportId.toLowerCase(),occurredAt:new Date(v.occurredAt).toISOString(),skuIds:(v.skuIds as string[]).slice().sort(),receiptIds:(v.receiptIds as string[]).slice().sort()};
}
export function retrospectiveWindows(occurredAt:string,timezone:string,days:number){
 if(!retrospectiveInstant(occurredAt)||!Number.isInteger(days)||days<1||days>90)throw new RetrospectiveExecutionError("INVALID_RETROSPECTIVE_WINDOW");
 const launch=Temporal.Instant.from(occurredAt).toZonedDateTimeISO(timezone).toPlainDate();
 return {launchDate:launch.toString(),before:{from:launch.subtract({days}).toString(),to:launch.subtract({days:1}).toString()},after:{from:launch.add({days:1}).toString(),to:launch.add({days}).toString()},days,timezone};
}
export interface DailyInventoryValue {date:string;stockCost:string|null;complete:boolean}
export function observedGmroi(grossProfit:string|null,salesComplete:boolean,from:string,to:string,inventory:DailyInventoryValue[]){
 const days=Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days+1;
 const unavailable=(reason:string)=>({state:"UNAVAILABLE" as const,reason,value:null,averageObservedInventoryCost:null,annualized:false,basis:"DAILY_OBSERVATION_APPROXIMATION" as const});
 if(!salesComplete||grossProfit===null)return unavailable("SALES_OR_PROFIT_INCOMPLETE");
 if(inventory.length!==days||new Set(inventory.map(d=>d.date)).size!==days||inventory.some(d=>d.date<from||d.date>to||!d.complete||d.stockCost===null||D(d.stockCost).lt(0)))return unavailable("INVENTORY_INCOMPLETE");
 const average=inventory.reduce((sum,d)=>sum.plus(d.stockCost!),D(0)).div(days);
 if(average.lte(0))return unavailable("ZERO_INVENTORY_DENOMINATOR");
 return {state:"AVAILABLE" as const,reason:null,value:D(grossProfit).div(average).toString(),averageObservedInventoryCost:average.toString(),annualized:false,basis:"DAILY_OBSERVATION_APPROXIMATION" as const};
}
