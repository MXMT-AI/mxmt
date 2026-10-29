import {isRecord} from "./api-contracts";
import {financialDecimal as D} from "./financial-decimal.mjs";
import {retrospectiveInstant} from "./retrospective-contract";
export const PRICE_WRITEBACK_VERSION=1;
export const PRICE_WRITEBACK_MAX_ITEMS=20;
export const PRICE_APPROVAL_TTL_MS=15*60*1000;
export class PriceWritebackError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export const priceId=(v:unknown):string=>{if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new PriceWritebackError("INVALID_PRICE_ACTION_ID");return v;};
export const exactKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.slice().sort().join();
export const priceAmount=(v:unknown):v is string=>typeof v==="string"&&/^\d{1,12}(\.\d{1,18})?$/.test(v)&&D(v).gt(0)&&D(v).decimalPlaces()<=2;
export const priceReference=(v:unknown):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=1000&&!/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export type ItemState="PENDING"|"DISPATCHING"|"SUCCEEDED"|"CONFLICT"|"FAILED"|"UNKNOWN"|"RECONCILED_APPLIED"|"RECONCILED_NOT_APPLIED";
export interface PriceItem {skuId:string;productId:string;currency:"UAH";oldPrice:string;newPrice:string;remoteVersion:string;state:ItemState;attemptId?:string;attemptAt?:string;remoteReceipt?:string;appliedVersion?:string;observedPrice?:string;observedVersion?:string;reason?:string}
export interface RemotePrice {productId:string;price:string;currency:"UAH";version:string;observedAt:string;exists:true;authoritative:true;basis:"NATIVE_BASE_PRICE";discount:"NONE"}
export interface PriceTransport {
 capabilities:{atomicExistingOnly:true;authoritativeNativeReads:true;terminalAttemptLookup:true};
 /** Return exact native product prices; YML conversion/cached effective price is insufficient. */
 read(input:{productIds:string[];attemptIds:string[];signal:AbortSignal}):Promise<{products:unknown;attempts?:Record<string,"APPLIED"|"NOT_APPLIED"|"UNKNOWN">}>;
 /** Atomically require existing product, expected version/price and approval deadline. Terminal NOT_APPLIED must fence late calls with that attempt ID. */
 compareAndSet(input:{attemptId:string;productId:string;expectedVersion:string;expectedPrice:string;newPrice:string;currency:"UAH";approvedUntil:string;signal:AbortSignal}):Promise<{state:"APPLIED"|"CONFLICT"|"REJECTED"|"UNKNOWN";receipt?:string;version?:string}>;
}
export interface PriceAccessPolicy {version:string;sourceId:string;connectionRevision:number;approvalReference:string;canaryReference:string;quotaKey:string;from:string;to:string;maxReads:number;maxWrites:number}
/** Access/rate/cost approval and canary are server-injected only; there is no production adapter or browser activation override. */
export function validatePriceAccess(p:PriceAccessPolicy,now:Date){
 for(const v of [p.version,p.sourceId,p.quotaKey])priceId(v);
 if(!priceReference(p.approvalReference)||!priceReference(p.canaryReference)||!Number.isInteger(p.connectionRevision)||p.connectionRevision<1||!retrospectiveInstant(p.from)||!retrospectiveInstant(p.to)||Date.parse(p.from)>now.getTime()||Date.parse(p.to)<=now.getTime()||Date.parse(p.to)-Date.parse(p.from)>31*86400000||![p.maxReads,p.maxWrites].every(n=>Number.isInteger(n)&&n>0&&n<=10000))throw new PriceWritebackError("PRICE_ACCESS_NOT_APPROVED",409);
}
/** Treat adapter observations as untrusted data: no extras, missing/duplicate IDs, discounted prices or guessed currencies. */
export function parseRemotePrices(v:unknown,ids:string[],now:Date){
 if(!Array.isArray(v)||v.length!==ids.length||new Set(ids).size!==ids.length)throw new PriceWritebackError("PRICE_REMOTE_EVIDENCE_INVALID",502);
 const seen=new Set<string>();
 for(const r of v){if(!isRecord(r)||!exactKeys(r,["productId","price","currency","version","observedAt","exists","authoritative","basis","discount"])||typeof r.productId!=="string"||!ids.includes(r.productId)||seen.has(r.productId)||!priceAmount(r.price)||r.currency!=="UAH"||r.exists!==true||r.authoritative!==true||r.basis!=="NATIVE_BASE_PRICE"||r.discount!=="NONE"||!retrospectiveInstant(r.observedAt)||Date.parse(r.observedAt)>now.getTime()||now.getTime()-Date.parse(r.observedAt)>30000)throw new PriceWritebackError("PRICE_REMOTE_EVIDENCE_INVALID",502);priceId(r.version);seen.add(r.productId);}
 return v as RemotePrice[];
}
export function priceOperationState(items:PriceItem[]){
 if(items.some(i=>i.state==="DISPATCHING"))return "DISPATCHING";
 if(items.some(i=>i.state==="UNKNOWN"))return "UNKNOWN";
 if(items.some(i=>i.state.startsWith("RECONCILED_")))return "RECONCILED";
 const successful=items.filter(i=>["SUCCEEDED","RECONCILED_APPLIED"].includes(i.state)).length;
 return successful===items.length?"SUCCEEDED":successful?"PARTIAL":"FAILED";
}
