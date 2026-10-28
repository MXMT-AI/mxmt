import {Temporal} from "@js-temporal/polyfill";
import {isRecord} from "./api-contracts";
import {financialDecimal as D} from "./financial-decimal.mjs";

export class AnalogForecastError extends Error {
 constructor(readonly code:string,readonly status=400){super(code);}
}
export const forecastId=(v:unknown):string=>{
 if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new AnalogForecastError("INVALID_FORECAST_ID");return v;
};
const exact=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).sort().join()===fields.slice().sort().join();
const integer=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
const decimal=(v:unknown)=>typeof v==="string"&&/^\d{1,18}(\.\d{1,18})?$/.test(v);
const measure=(v:unknown)=>typeof v==="string"&&v.length<=160&&/^\d{1,50}(\.\d{1,100})?(e[+-]?\d{1,3})?$/.test(v)&&D(v).isFinite()&&D(v).lte("1e50");
const text=(v:unknown,max=1000)=>typeof v==="string"&&!!v.trim()&&v.length<=max&&!/[\p{Cc}\p{Cf}\p{Cs}<>]/u.test(v);
export interface AnalogPolicy {
 version:1;sourceId:string;dictionaryId:string;dictionaryConfigId:string;dimensionIds:string[];
 method:"equal_weight_saved_velocity";historyDays:84;minInStockDays:number;minAnalogs:number;maxAnalogs:number;candidateLimit:number;
 horizonDays:number;maxTargetAgeDays:number;
 price:{mode:"ratio_filter_no_elasticity";maxRelativeDifference:string};
 season:"same_calendar_no_adjustment";returns:"published_net_exclude_negative";fallback:"manual_review";
 evaluation:{baselines:["zero","category_mean"];actuals:"complete_horizon_stock_observations";minScoredCases:number;minCoverage:string;maxMae:string;maxAbsBias:string};
 rationale:string;
}
/** Explicit draft parameters only; parsing neither approves business rules nor activates a forecast. */
export function parseAnalogPolicy(v:unknown):AnalogPolicy {
 const bad=():never=>{throw new AnalogForecastError("INVALID_ANALOG_POLICY");};
 if(!isRecord(v)||!exact(v,["version","sourceId","dictionaryId","dictionaryConfigId","dimensionIds","method","historyDays","minInStockDays","minAnalogs","maxAnalogs","candidateLimit","horizonDays","maxTargetAgeDays","price","season","returns","fallback","evaluation","rationale"])||v.version!==1||v.method!=="equal_weight_saved_velocity"||v.historyDays!==84||v.season!=="same_calendar_no_adjustment"||v.returns!=="published_net_exclude_negative"||v.fallback!=="manual_review"||!text(v.rationale)||!Array.isArray(v.dimensionIds)||!v.dimensionIds.length||v.dimensionIds.length>5||new Set(v.dimensionIds).size!==v.dimensionIds.length)return bad();
 for(const id of [v.sourceId,v.dictionaryId,v.dictionaryConfigId,...v.dimensionIds])forecastId(id);
 if(!integer(v.minInStockDays,28,84)||!integer(v.minAnalogs,1,50)||!integer(v.maxAnalogs,Number(v.minAnalogs),50)||!integer(v.candidateLimit,Number(v.maxAnalogs)+1,500)||!integer(v.horizonDays,1,84)||!integer(v.maxTargetAgeDays,0,83))return bad();
 const p=v.price,e=v.evaluation;
 if(!isRecord(p)||!exact(p,["mode","maxRelativeDifference"])||p.mode!=="ratio_filter_no_elasticity"||!decimal(p.maxRelativeDifference)||D(p.maxRelativeDifference as string).gt(1))return bad();
 if(!isRecord(e)||!exact(e,["baselines","actuals","minScoredCases","minCoverage","maxMae","maxAbsBias"])||JSON.stringify(e.baselines)!=='["zero","category_mean"]'||e.actuals!=="complete_horizon_stock_observations"||!integer(e.minScoredCases,1,100)||![e.minCoverage,e.maxMae,e.maxAbsBias].every(decimal)||D(e.minCoverage as string).gt(1))return bad();
 return structuredClone(v) as unknown as AnalogPolicy;
}
export interface AnalogRow {
 skuId:string;categoryId:string|null;productKind:string;currency:string|null;price:string|null;priceHistoryComplete:boolean;
 firstReceiptDate:string|null;receiptHistoryComplete:boolean;seasonMonths:number[];
 velocityPerWeek:string|null;velocityState:string;velocityBasis:string;
 windowFrom:string;windowTo:string;observedDays:number;inStockDays:number;historyComplete:boolean;
 attributes:Record<string,{state:string;valueIds:string[]}>;evidence:unknown;
}
export interface AnalogPacket {asOf:string;from:string;to:string;targetId:string;rows:AnalogRow[]}
export const forecastPeriod=(asOf:string,horizon:number)=>({from:Temporal.PlainDate.from(asOf).add({days:1}).toString(),to:Temporal.PlainDate.from(asOf).add({days:horizon}).toString()});
const age=(a:string,b:string)=>Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b)).days;
const seasonCovers=(months:number[],from:string,to:string)=>{
 let date=Temporal.PlainDate.from(from),end=Temporal.PlainDate.from(to);
 while(Temporal.PlainDate.compare(date,end)<=0){if(!months.includes(date.month))return false;date=date.add({days:1});}return true;
};
const knownAttributes=(r:AnalogRow,p:AnalogPolicy)=>p.dimensionIds.every(id=>r.attributes[id]?.state==="KNOWN"&&r.attributes[id].valueIds.length===1);
const positive=(v:string|null)=>v!==null&&decimal(v)&&D(v).gt(0);
/** Shared saved velocity is used only with complete observations and a non-fallback exposure denominator. */
function candidateReason(r:AnalogRow,target:AnalogRow,packet:AnalogPacket,p:AnalogPolicy):string|null {
 if(r.productKind!=="MERCHANDISE"||r.categoryId!==target.categoryId||r.currency!==target.currency)return "SCOPE_MISMATCH";
 if(!r.firstReceiptDate||!r.receiptHistoryComplete||r.firstReceiptDate>r.windowFrom)return "LAUNCH_COHORT_UNVERIFIED";
 if(r.windowFrom!==Temporal.PlainDate.from(packet.asOf).subtract({days:84}).toString()||r.windowTo!==Temporal.PlainDate.from(packet.asOf).subtract({days:1}).toString()||!r.historyComplete||r.observedDays!==84||r.inStockDays<p.minInStockDays||r.inStockDays>84||r.velocityBasis!=="SNAPSHOT_DAYS")return "EXPOSURE_UNAVAILABLE";
 if(!["KNOWN","ZERO"].includes(r.velocityState)||r.velocityPerWeek===null||!measure(r.velocityPerWeek))return "NET_SALES_UNAVAILABLE";
 if(!r.priceHistoryComplete||!positive(r.price)||D(r.price!).div(target.price!).minus(1).abs().gt(p.price.maxRelativeDifference))return "PRICE_NOT_COMPARABLE";
 if(!seasonCovers(r.seasonMonths,r.windowFrom,packet.to))return "SEASON_NOT_COMPARABLE";
 return null;
}
/** Research preview only. No target sales/velocity enters analog selection, weighting or the point estimate. */
export function estimateAnalogs(packet:AnalogPacket,p:AnalogPolicy){
 const period=forecastPeriod(packet.asOf,p.horizonDays),target=packet.rows.find(r=>r.skuId===packet.targetId);
 if(packet.rows.length>p.candidateLimit||new Set(packet.rows.map(r=>r.skuId)).size!==packet.rows.length||packet.from!==period.from||packet.to!==period.to)throw new AnalogForecastError("INVALID_ANALOG_PACKET");
 const unavailable=(reason:string,exclusions:Array<{skuId:string;reason:string}>=[])=>({status:"manual_review" as const,reason,forecastUnits:null,analogs:[],exclusions,baselines:{zero:"0",category_mean:null as string|null},uncertainty:{kind:"unevaluated" as const,interval:null},demandBasis:"conditional_on_in_stock_net_units",procurementAction:false});
 if(!target||target.productKind!=="MERCHANDISE"||!target.categoryId||!target.currency||!positive(target.price))return unavailable("TARGET_SCOPE_OR_PRICE_UNAVAILABLE");
 if(!target.firstReceiptDate||!target.receiptHistoryComplete||age(target.firstReceiptDate,packet.asOf)<0||age(target.firstReceiptDate,packet.asOf)>p.maxTargetAgeDays)return unavailable("TARGET_LAUNCH_UNVERIFIED_OR_NOT_NEW");
 if(!knownAttributes(target,p))return unavailable("TARGET_ATTRIBUTES_UNAVAILABLE");
 if(!seasonCovers(target.seasonMonths,packet.from,packet.to))return unavailable("TARGET_SEASON_UNAVAILABLE");
 const candidates:AnalogRow[]=[],baseline:AnalogRow[]=[],exclusions:Array<{skuId:string;reason:string}>=[];
 for(const row of [...packet.rows].sort((a,b)=>a.skuId<b.skuId?-1:a.skuId>b.skuId?1:0)){
  if(row.skuId===target.skuId)continue;
  let reason=candidateReason(row,target,packet,p);
  if(!reason){baseline.push(row);if(!knownAttributes(row,p))reason="ATTRIBUTES_UNAVAILABLE";else if(p.dimensionIds.some(id=>row.attributes[id].valueIds[0]!==target.attributes[id].valueIds[0]))reason="ATTRIBUTE_MISMATCH";}
  if(reason)exclusions.push({skuId:row.skuId,reason});else candidates.push(row);
 }
 const selected=candidates.slice(0,p.maxAnalogs);for(const r of candidates.slice(p.maxAnalogs))exclusions.push({skuId:r.skuId,reason:"ANALOG_LIMIT"});
 if(selected.length<p.minAnalogs)return unavailable("INSUFFICIENT_ANALOGS",exclusions);
 const units=(rows:AnalogRow[])=>rows.reduce((sum,r)=>sum.plus(r.velocityPerWeek!),D(0)).div(rows.length).mul(p.horizonDays).div(7).toString();
 return {status:"estimated" as const,reason:null,forecastUnits:units(selected),analogs:selected.map(r=>({skuId:r.skuId,weight:{numerator:1,denominator:selected.length},velocityPerWeek:r.velocityPerWeek,inStockDays:r.inStockDays,firstReceiptDate:r.firstReceiptDate,windowFrom:r.windowFrom,windowTo:r.windowTo,evidence:r.evidence})),exclusions,baselines:{zero:"0",category_mean:baseline.length?units(baseline):null},uncertainty:{kind:"unevaluated" as const,interval:null},demandBasis:"conditional_on_in_stock_net_units",procurementAction:false};
}
export interface ForecastScoreCase {forecastId:string;horizonDays:number;forecastUnits:string|null;baselines:{zero:string;category_mean:string|null};actualUnits:string|null;exclusion:string|null}
/** Paired, time-split scores: zero actuals remain in MAE/bias; WAPE is undefined for an all-zero denominator. */
export function scoreAnalogCases(cases:ForecastScoreCase[],p:AnalogPolicy){
 if(!cases.length||cases.length>100||new Set(cases.map(c=>c.forecastId)).size!==cases.length||cases.some(c=>c.horizonDays!==p.horizonDays||c.actualUnits!==null&&!measure(c.actualUnits)||c.forecastUnits!==null&&!measure(c.forecastUnits)||!measure(c.baselines.zero)||c.baselines.category_mean!==null&&!measure(c.baselines.category_mean)))throw new AnalogForecastError("INVALID_FORECAST_EVALUATION");
 const scored=cases.filter(c=>!c.exclusion&&c.actualUnits!==null&&c.forecastUnits!==null&&c.baselines.category_mean!==null);
 const metric=(name:"forecast"|"zero"|"category_mean")=>{
  if(!scored.length)return {mae:null,bias:null,wape:null};
  let absolute=D(0),signed=D(0),actual=D(0);
  for(const c of scored){const value=name==="forecast"?c.forecastUnits!:c.baselines[name]!,error=D(value).minus(c.actualUnits!);absolute=absolute.plus(error.abs());signed=signed.plus(error);actual=actual.plus(c.actualUnits!);}
  return {mae:absolute.div(scored.length).toString(),bias:signed.div(scored.length).toString(),wape:actual.isZero()?null:absolute.div(actual).toString()};
 };
 const coverage=D(scored.length).div(cases.length).toString(),metrics={forecast:metric("forecast"),zero:metric("zero"),category_mean:metric("category_mean")};
 const meetsDraftThresholds=scored.length>=p.evaluation.minScoredCases&&D(coverage).gte(p.evaluation.minCoverage)&&metrics.forecast.mae!==null&&D(metrics.forecast.mae).lte(p.evaluation.maxMae)&&D(metrics.forecast.bias!).abs().lte(p.evaluation.maxAbsBias);
 return {submitted:cases.length,scored:scored.length,coverage,horizonDays:p.horizonDays,metrics,zeroDemandPolicy:"included_in_mae_and_bias_wape_null_when_total_actual_zero",biasSign:"forecast_minus_actual",cases,meetsDraftThresholds,releaseApproved:false,calibratedIntervals:false};
}
