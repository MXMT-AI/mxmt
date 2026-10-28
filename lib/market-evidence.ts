import {isRecord} from "./api-contracts";
import {financialDecimal as D} from "./financial-decimal.mjs";

export class MarketEvidenceError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export const marketId=(v:unknown):string=>{if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new MarketEvidenceError("INVALID_MARKET_ID");return v;};
export const marketText=(v:unknown,max=500):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=max&&!/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const keys=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).sort().join()===fields.slice().sort().join();
export const utcInstant=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace(".000Z","Z")===v.replace(".000Z","Z");
export const marketDate=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const marketMoney=(v:unknown):v is string=>typeof v==="string"&&/^\d{1,10}(\.\d{1,8})?$/.test(v);
/** Citation identity is separate from transport configuration; credentials/query strings are never retained as links. */
export function marketUrl(v:unknown):v is string{
 if(typeof v!=="string"||v.length>1500)return false;
 try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&u.href===v;}catch{return false;}
}
export interface MarketPolicy {
 version:1;adapterId:string;sourceName:string;sourceUrl:string;internalSourceId:string;
 scope:{geography:string;categoryId:string;externalCategory:string;attribute:null|{dictionaryId:string;configId:string;dimensionId:string;valueId:string;externalValue:string}};
 metric:{name:string;unit:"index"|"count"|"money";normalization:"relative_index"|"absolute";definitionReference:string;currency:string|null};
 rights:{reference:string;canIngest:boolean;canRetain:boolean;canDisplay:boolean;redistribution:"internal_only"|"aggregate_allowed";validFrom:string;validUntil:string;retentionHours:number};
 cadence:{refreshHours:number;maxAgeHours:number};
 budget:{key:string;from:string;to:string;currency:string;subscriptionAmount:string;perRequestAmount:string;periodCap:string;maxRequests:number};
 relevanceRubric:string;
}
/** Validate a source-neutral draft only; no vendor, license, commercial terms or physical mapping is inferred. */
export function parseMarketPolicy(value:unknown):MarketPolicy{
 const bad=():never=>{throw new MarketEvidenceError("INVALID_MARKET_POLICY");};
 if(!isRecord(value)||!keys(value,["version","adapterId","sourceName","sourceUrl","internalSourceId","scope","metric","rights","cadence","budget","relevanceRubric"])||value.version!==1||!marketText(value.sourceName,200)||!marketUrl(value.sourceUrl)||!marketText(value.relevanceRubric,2000))return bad();
 marketId(value.adapterId);marketId(value.internalSourceId);
 const s=value.scope,m=value.metric,r=value.rights,c=value.cadence,b=value.budget;
 if(!isRecord(s)||!keys(s,["geography","categoryId","externalCategory","attribute"])||typeof s.geography!=="string"||!/^[A-Z]{2}$/.test(s.geography)||!marketText(s.externalCategory,200))return bad();marketId(s.categoryId);
 if(s.attribute!==null){const a=s.attribute;if(!isRecord(a)||!keys(a,["dictionaryId","configId","dimensionId","valueId","externalValue"])||!marketText(a.externalValue,200))return bad();for(const k of ["dictionaryId","configId","dimensionId","valueId"])marketId(a[k]);}
 if(!isRecord(m)||!keys(m,["name","unit","normalization","definitionReference","currency"])||!marketText(m.name,120)||!marketText(m.definitionReference,1000)||!["index","count","money"].includes(String(m.unit))||!["relative_index","absolute"].includes(String(m.normalization))||
   (m.unit==="index")!==(m.normalization==="relative_index")||m.unit==="money"&&(typeof m.currency!=="string"||!/^[A-Z]{3}$/.test(m.currency))||m.unit!=="money"&&m.currency!==null)return bad();
 if(!isRecord(r)||!keys(r,["reference","canIngest","canRetain","canDisplay","redistribution","validFrom","validUntil","retentionHours"])||!marketText(r.reference,1000)||[r.canIngest,r.canRetain,r.canDisplay].some(v=>typeof v!=="boolean")||!["internal_only","aggregate_allowed"].includes(String(r.redistribution))||!utcInstant(r.validFrom)||!utcInstant(r.validUntil)||Date.parse(r.validFrom)>=Date.parse(r.validUntil)||!Number.isInteger(r.retentionHours)||Number(r.retentionHours)<48||Number(r.retentionHours)>2160)return bad();
 if(!isRecord(c)||!keys(c,["refreshHours","maxAgeHours"])||[c.refreshHours,c.maxAgeHours].some(v=>!Number.isInteger(v)||Number(v)<1||Number(v)>720)||Number(c.refreshHours)>Number(c.maxAgeHours)||Number(c.refreshHours)>Number(r.retentionHours)-24)return bad();
 if(!isRecord(b)||!keys(b,["key","from","to","currency","subscriptionAmount","perRequestAmount","periodCap","maxRequests"])||!utcInstant(b.from)||!utcInstant(b.to)||Date.parse(b.from)>=Date.parse(b.to)||Date.parse(b.to)-Date.parse(b.from)>366*86400000||typeof b.currency!=="string"||!/^[A-Z]{3}$/.test(b.currency)||![b.subscriptionAmount,b.perRequestAmount,b.periodCap].every(marketMoney)||!Number.isInteger(b.maxRequests)||Number(b.maxRequests)<1||Number(b.maxRequests)>10000)return bad();marketId(b.key);
 if(D(b.subscriptionAmount as string).gt(b.periodCap as string))return bad();
 const policy=structuredClone(value) as unknown as MarketPolicy;
 for(const field of ["subscriptionAmount","perRequestAmount","periodCap"] as const)policy.budget[field]=D(policy.budget[field]).toFixed(8);
 policy.budget.from=new Date(policy.budget.from).toISOString();policy.budget.to=new Date(policy.budget.to).toISOString();
 policy.rights.validFrom=new Date(policy.rights.validFrom).toISOString();policy.rights.validUntil=new Date(policy.rights.validUntil).toISOString();return policy;
}
export interface MarketQuery {profileId:string;snapshotId:string;requestKey:string;refresh:boolean;geography:string;categoryId:string;from:string;to:string}
/** No transport URL, provider override, instructions or client-authored evidence can enter a lookup request. */
export function parseMarketQuery(v:unknown):MarketQuery{
 if(!isRecord(v)||!keys(v,["profileId","snapshotId","requestKey","refresh","geography","categoryId","from","to"])||typeof v.refresh!=="boolean"||typeof v.geography!=="string"||!/^[A-Z]{2}$/.test(v.geography)||!marketDate(v.from)||!marketDate(v.to)||v.from>v.to||Date.parse(v.to)-Date.parse(v.from)>365*86400000)throw new MarketEvidenceError("INVALID_MARKET_QUERY");
 for(const key of ["profileId","snapshotId","requestKey","categoryId"])marketId(v[key]);return structuredClone(v) as unknown as MarketQuery;
}
export interface MarketObservation {
 version:1;sourceUrl:string;publishedAt:string;geography:string;externalCategory:string;externalAttribute:string|null;
 period:{from:string;to:string};metric:MarketPolicy["metric"];points:Array<{date:string;value:string|null}>;
}
/** Validate normalized adapter evidence as untrusted data; scope/units remain exact and source text never becomes instructions. */
export function normalizeMarketObservation(v:unknown,p:MarketPolicy,q:MarketQuery,now:Date):MarketObservation{
 const bad=():never=>{throw new MarketEvidenceError("INVALID_MARKET_OBSERVATION",502);};
 if(!isRecord(v)||!keys(v,["version","sourceUrl","publishedAt","geography","externalCategory","externalAttribute","period","metric","points"])||v.version!==1||!marketUrl(v.sourceUrl)||new URL(v.sourceUrl).origin!==new URL(p.sourceUrl).origin||!utcInstant(v.publishedAt)||Date.parse(v.publishedAt)>now.getTime()||v.geography!==p.scope.geography||v.geography!==q.geography||v.externalCategory!==p.scope.externalCategory||v.externalAttribute!==(p.scope.attribute?.externalValue??null)||!isRecord(v.period)||!keys(v.period,["from","to"])||v.period.from!==q.from||v.period.to!==q.to||!isRecord(v.metric)||!keys(v.metric,["name","unit","normalization","definitionReference","currency"])||Object.keys(p.metric).some(k=>p.metric[k as keyof typeof p.metric]!== (v.metric as Record<string,unknown>)[k])||!Array.isArray(v.points)||!v.points.length||v.points.length>366)return bad();
 const dates=new Set<string>();
 for(const point of v.points){
  if(!isRecord(point)||!keys(point,["date","value"])||!marketDate(point.date)||point.date<q.from||point.date>q.to||dates.has(point.date)||Date.parse(point.date)>Date.parse(v.publishedAt))return bad();dates.add(point.date);
  if(point.value!==null){if(!marketMoney(point.value)||p.metric.unit==="index"&&D(point.value).gt(100)||p.metric.unit==="count"&&!D(point.value).isInteger())return bad();}
 }
 if(Buffer.byteLength(JSON.stringify(v),"utf8")>64*1024)return bad();
 if(v.points.every(point=>point.value===null))throw new MarketEvidenceError("SOURCE_DATA_UNAVAILABLE",502);
 const observation=structuredClone(v) as unknown as MarketObservation;observation.points.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);return observation;
}
/** Only observed endpoints contribute to descriptive change; missing endpoints never become a forecast or estimated uplift. */
export function marketObservationSummary(observation:MarketObservation){
 const first=observation.points[0],last=observation.points.at(-1)!;
 return {firstDate:first.date,lastDate:last.date,firstValue:first.value,lastValue:last.value,absoluteChange:observation.points.length>1&&first.value!==null&&last.value!==null?D(last.value).minus(first.value).toString():null,observationCount:observation.points.length,nullPointCount:observation.points.filter(p=>p.value===null).length,coverage:"source_points_only",causality:"not_established",forecastInput:false};
}
