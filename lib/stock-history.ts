import {Temporal} from "@js-temporal/polyfill";
import {financialDecimal as D} from "./financial-decimal.mjs";
export const STOCK_HISTORY_VERSION=1;
export const STOCK_HISTORY_COHORT_LIMIT=5000;
export interface StockHistoryObservation {
 date:string;currency:string|null;cohortSize:number;observedCount:number;quantity:string;coveredCost:string;costCount:number;firstObservedAt:string|null;lastObservedAt:string|null;
}
/** Request exact completed month-end dates and a consecutive 30-day readiness window; never carry a value forward. */
export function stockHistoryDates(asOf:string){
 const end=Temporal.PlainDate.from(asOf),month=end.with({day:1});
 const current=Array.from({length:12},(_,i)=>month.subtract({months:12-i}).with({day:1}).add({months:1}).subtract({days:1}).toString());
 const prior=current.map(d=>Temporal.PlainDate.from(d).subtract({years:1}).with({day:1}).add({months:1}).subtract({days:1}).toString());
 const readiness=Array.from({length:30},(_,i)=>end.subtract({days:30-i}).toString());
 return {current,prior,readiness,dates:[...new Set([...current,...prior,...readiness])].sort()};
}
/** Fixed current cohort, exact-day observations and explicit missing valuations keep historical stock separate from estimates. */
export function buildStockHistory(asOf:string,rows:StockHistoryObservation[]){
 const dates=stockHistoryDates(asOf),currencies=[...new Set(rows.map(r=>r.currency))];
 return {version:STOCK_HISTORY_VERSION,asOf,scope:"CURRENT_SNAPSHOT_COHORT" as const,channelScope:"ALL_CHANNELS" as const,basis:"OBSERVED_ON_MONTH_END_DATE" as const,byCurrency:currencies.map(currency=>{
  const scoped=rows.filter(r=>r.currency===currency),byDate=new Map(scoped.map(r=>[r.date,r]));
  const complete=(r:StockHistoryObservation|undefined)=>!!r&&r.cohortSize>0&&r.observedCount===r.cohortSize;
  const completeDays=dates.readiness.filter(date=>complete(byDate.get(date))).length;
  const point=(date:string)=>{
   const r=byDate.get(date),full=complete(r),knownCost=full&&currency!==null&&r!.costCount===r!.cohortSize;
   return {date,state:full?"OBSERVED" as const:"UNAVAILABLE" as const,quantity:full?D(r!.quantity).toString():null,stockCost:knownCost?D(r!.coveredCost).toString():null,coveredStockCost:currency!==null&&r?.costCount?D(r.coveredCost).toString():null,cohortSize:r?.cohortSize??0,observedCount:r?.observedCount??0,costCount:r?.costCount??0,firstObservedAt:r?.firstObservedAt??null,lastObservedAt:r?.lastObservedAt??null};
  };
  const ready=completeDays===30;
  return {currency,state:ready?"READY" as const:"INSUFFICIENT_HISTORY" as const,completeDays,requiredDays:30,points:ready?dates.current.map((date,i)=>({current:point(date),priorYear:point(dates.prior[i])})):[]};
 })};
}
export type StockHistory=ReturnType<typeof buildStockHistory>;
