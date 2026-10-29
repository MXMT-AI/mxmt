import {isRecord} from "./api-contracts";
import {retrospectiveInstant} from "./retrospective-contract";
export const SUPPLIER_DELIVERY_VERSION=1;
export const SUPPLIER_APPROVAL_TTL_MS=15*60*1000;
export const SUPPLIER_DELIVERY_MAX_ROWS=500;
export class SupplierDeliveryError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export const supplierActionId=(v:unknown):string=>{if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new SupplierDeliveryError("INVALID_SUPPLIER_DELIVERY_ID");return v;};
export const supplierText=(v:unknown,max=1000):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=max&&!/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export const supplierKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join()===keys.slice().sort().join();
export interface SupplierRecipient {version:1;supplierId:string;channelId:string;destinationId:string;label:string;currencies:string[];verificationReference:string;consentReference:string;validUntil:string}
/** Destination is an opaque approved catalog identifier, never an inferred email, URL or caller-supplied message recipient. */
export function parseSupplierRecipient(v:unknown):SupplierRecipient{
 if(!isRecord(v)||!supplierKeys(v,["version","supplierId","channelId","destinationId","label","currencies","verificationReference","consentReference","validUntil"])||v.version!==1||!supplierText(v.label,200)||!supplierText(v.verificationReference)||!supplierText(v.consentReference)||!retrospectiveInstant(v.validUntil)||!Array.isArray(v.currencies)||!v.currencies.length||v.currencies.length>5||new Set(v.currencies).size!==v.currencies.length||v.currencies.some(c=>typeof c!=="string"||!/^[A-Z]{3}$/.test(c)))throw new SupplierDeliveryError("INVALID_SUPPLIER_RECIPIENT");
 for(const id of [v.supplierId,v.channelId,v.destinationId])supplierActionId(id);return structuredClone(v) as unknown as SupplierRecipient;
}
export interface DeliveryAccessPolicy {version:string;sourceId:string;connectionRevision:number;channelId:string;accountId:string;approvalReference:string;canaryReference:string;quotaKey:string;from:string;to:string;maxSends:number;maxLookups:number;maxCancellations:number}
export function validateDeliveryAccess(p:DeliveryAccessPolicy,now:Date){
 for(const id of [p.version,p.sourceId,p.channelId,p.accountId,p.quotaKey])supplierActionId(id);
 if(!supplierText(p.approvalReference)||!supplierText(p.canaryReference)||!Number.isInteger(p.connectionRevision)||p.connectionRevision<1||!retrospectiveInstant(p.from)||!retrospectiveInstant(p.to)||Date.parse(p.from)>now.getTime()||Date.parse(p.to)<=now.getTime()||Date.parse(p.to)-Date.parse(p.from)>31*86400000||[p.maxSends,p.maxLookups,p.maxCancellations].some(n=>!Number.isInteger(n)||n<1||n>10000))throw new SupplierDeliveryError("SUPPLIER_DELIVERY_ACCESS_UNAPPROVED",409);
}
export interface DeliveryOutcome {state:"SENT"|"ACKNOWLEDGED"|"NOT_SENT"|"CANCELLED"|"UNKNOWN";deliveryId?:string;destinationId:string;payloadHash:string}
export interface SupplierDeliveryTransport {
 capabilities:{idempotentDispatch:true;terminalAttemptLookup:true;fencesCancelledAttempts:true;confirmedCancellation:true};
 /** One exact approved supplier/currency file group. Provider must honor deadline and persist an idempotency receipt. */
 send(input:{attemptId:string;destinationId:string;recipientRevision:number;payloadHash:string;subject:string;body:string;attachment:{name:string;content:string;sha256:string};approvedUntil:string;signal:AbortSignal}):Promise<unknown>;
 /** NOT_SENT is terminal/fenced. Cancellation-request acceptance alone is not CANCELLED; acknowledgment is never goods receipt. */
 lookup(input:{attemptId:string;signal:AbortSignal}):Promise<unknown>;
 cancel(input:{attemptId:string;originalAttemptId:string;deliveryId:string;destinationId:string;payloadHash:string;reason:string;approvedUntil:string;signal:AbortSignal}):Promise<unknown>;
}
/** Bind normalized provider evidence to the exact destination and approved payload rather than trusting generic HTTP success. */
export function parseDeliveryOutcome(value:unknown,destinationId:string,payloadHash:string):DeliveryOutcome{
 if(!isRecord(value)||Object.keys(value).some(k=>!["state","deliveryId","destinationId","payloadHash"].includes(k))||!["SENT","ACKNOWLEDGED","NOT_SENT","CANCELLED","UNKNOWN"].includes(String(value.state))||value.destinationId!==destinationId||value.payloadHash!==payloadHash)throw new SupplierDeliveryError("SUPPLIER_DELIVERY_EVIDENCE_INVALID",502);
 if(["SENT","ACKNOWLEDGED","CANCELLED"].includes(String(value.state))&&typeof value.deliveryId!=="string")throw new SupplierDeliveryError("SUPPLIER_DELIVERY_EVIDENCE_INVALID",502);
 if(value.deliveryId!==undefined)supplierActionId(value.deliveryId);return structuredClone(value) as unknown as DeliveryOutcome;
}
