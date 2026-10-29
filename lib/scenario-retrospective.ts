import {Temporal} from "@js-temporal/polyfill";
import {isRecord} from "./api-contracts";
export class RetrospectiveError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export interface RetrospectiveRequest {exportId:string;kind:"reprice"|"reorder";period:{from:string;to:string}}
/** Prepare evaluation intent only; an export is neither a launched promotion nor a sent or received supplier order. */
export function parseRetrospectiveRequest(v:unknown):RetrospectiveRequest {
 if(!isRecord(v)||Object.keys(v).sort().join()!=="exportId,kind,period"||typeof v.exportId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.exportId)||!["reprice","reorder"].includes(String(v.kind))||!isRecord(v.period)||Object.keys(v.period).sort().join()!=="from,to")throw new RetrospectiveError("INVALID_RETROSPECTIVE_REQUEST");
 try{
  for(const date of [v.period.from,v.period.to])if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Temporal.PlainDate.from(date,{overflow:"reject"}).toString()!==date)throw Error();
  const days=Temporal.PlainDate.from(v.period.from as string).until(Temporal.PlainDate.from(v.period.to as string)).days;if(days<0||days>365)throw Error();
 }catch{throw new RetrospectiveError("INVALID_RETROSPECTIVE_PERIOD");}
 return {exportId:v.exportId.toLowerCase(),kind:v.kind as RetrospectiveRequest["kind"],period:v.period as RetrospectiveRequest["period"]};
}
/** These unresolved business inputs are a versioned preparation contract, never an inferred performance calculation. */
export const RETROSPECTIVE_GATES={
 version:1,
 execution:"CONFIRMED_ACTUAL_START_AND_APPLIED_ROWS_REQUIRED",
 attribution:"OBSERVED_SALES_ARE_NOT_CAUSAL_UPLIFT",
 gmroi:{state:"POLICY_NOT_APPROVED",value:null,decisions:["GROSS_PROFIT_AND_RETURNS_SCOPE","TIME_WEIGHTED_AVERAGE_INVENTORY_COST","OWNERSHIP_AND_CURRENCY","ZERO_OR_MISSING_DENOMINATOR","ANNUALIZATION_AND_PERIOD"]},
 actuals:"PINNED_COMPLETE_SALES_AND_STOCK_EVIDENCE_REQUIRED",
 reorder:"SENT_ACCEPTED_AND_RECEIVED_ARE_DISTINCT_EVENTS",
 externalActions:{priceWriteBack:"NOT_IMPLEMENTED",supplierOrderSending:"NOT_IMPLEMENTED"},
} as const;
