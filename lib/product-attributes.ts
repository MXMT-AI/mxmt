import {isRecord} from "./api-contracts";

export class ProductAttributeError extends Error {
  constructor(readonly code:string,readonly status=400){super(code);}
}
export const attributeKey=(value:string)=>value.normalize("NFKC").replace(/\s+/gu," ").trim().toLowerCase();
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const text=(v:unknown,max=200):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=max&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export interface AttributeSelector {path:string[];match?:{key:string;value:string};valueKey?:string}
export interface AttributeDimension {id:string;label:string;cardinality:"single"|"multiple";selectors:AttributeSelector[];values:Array<{id:string;label:string;aliases:string[]}>}
export interface AttributeDictionary {version:1;sourceId:string;attribution:"exclusive_bucket";rubric:{kind:"coverage_only";minGroupSize:number};dimensions:AttributeDimension[]}
export type AttributeState="KNOWN"|"MULTI_VALUE"|"CONFLICT"|"UNMAPPED"|"MISSING"|"SOURCE_UNAVAILABLE";
export interface AttributeMembership {state:AttributeState;valueIds:string[];rawValues:string[];bucket:string}
const invalid=():never=>{throw new ProductAttributeError("INVALID_ATTRIBUTE_DICTIONARY");};
const exact=(v:Record<string,unknown>,fields:string[])=>Object.keys(v).every(k=>fields.includes(k));
const forbidden=new Set(["__proto__","prototype","constructor","name","title","description","image","image_link","images","sku","barcode","article"]);
export function parseAttributeDictionary(v:unknown):AttributeDictionary {
  if(!isRecord(v)||Object.keys(v).sort().join()!=="attribution,dimensions,rubric,sourceId,version"||v.version!==1||v.attribution!=="exclusive_bucket"||!text(v.sourceId,160)||!isRecord(v.rubric)||Object.keys(v.rubric).sort().join()!=="kind,minGroupSize"||v.rubric.kind!=="coverage_only"||!Number.isInteger(v.rubric.minGroupSize)||Number(v.rubric.minGroupSize)<1||Number(v.rubric.minGroupSize)>1000||!Array.isArray(v.dimensions)||!v.dimensions.length||v.dimensions.length>5)return invalid();
  const dims=new Set<string>();
  for(const d of v.dimensions){
    if(!isRecord(d)||Object.keys(d).sort().join()!=="cardinality,id,label,selectors,values"||!id(d.id)||dims.has(d.id)||!text(d.label)||!["single","multiple"].includes(String(d.cardinality))||!Array.isArray(d.selectors)||!d.selectors.length||d.selectors.length>3||!Array.isArray(d.values)||!d.values.length||d.values.length>50)return invalid();dims.add(d.id);
    for(const s of d.selectors){
      if(!isRecord(s)||!exact(s,["path","match","valueKey"])||!Array.isArray(s.path)||!s.path.length||s.path.length>8||s.path.some(p=>!text(p)||forbidden.has(attributeKey(p))))return invalid();
      if(s.match!==undefined&&(!isRecord(s.match)||Object.keys(s.match).sort().join()!=="key,value"||!text(s.match.key)||["__proto__","prototype","constructor"].includes(s.match.key)||!text(s.match.value)))return invalid();
      if(s.valueKey!==undefined&&(!text(s.valueKey)||forbidden.has(attributeKey(s.valueKey))))return invalid();
      if((s.match===undefined)!==(s.valueKey===undefined))return invalid();
    }
    const values=new Set<string>(),aliases=new Map<string,string>();
    for(const value of d.values){
      if(!isRecord(value)||Object.keys(value).sort().join()!=="aliases,id,label"||!id(value.id)||values.has(value.id)||!text(value.label)||!Array.isArray(value.aliases)||value.aliases.length>20||value.aliases.some(a=>!text(a)))return invalid();values.add(value.id);
      for(const alias of [value.label,...value.aliases]){const key=attributeKey(alias);if(aliases.has(key)&&aliases.get(key)!==value.id)return invalid();aliases.set(key,value.id);}
    }
  }
  return structuredClone(v) as unknown as AttributeDictionary;
}
export function productAttributeEvidence(productId:string,raw:unknown){
  if(!isRecord(raw))return {kind:"PRODUCT_ATTRIBUTE_EVIDENCE_V1",productId,state:"MISSING",data:null};
  const bytes=JSON.stringify(raw);if(Buffer.byteLength(bytes,"utf8")>64*1024)return {kind:"PRODUCT_ATTRIBUTE_EVIDENCE_V1",productId,state:"TOO_LARGE",data:null};
  return {kind:"PRODUCT_ATTRIBUTE_EVIDENCE_V1",productId,state:"AVAILABLE",data:JSON.parse(bytes) as Record<string,unknown>};
}
export function normalizeProductAttribute(d:AttributeDimension,raw:unknown):AttributeMembership {
  if(!isRecord(raw))return {state:"SOURCE_UNAVAILABLE",valueIds:[],rawValues:[],bucket:"__unknown__"};
  const extracted:unknown[]=[];
  for(const selector of d.selectors){
    let v:unknown=raw;
    for(const key of selector.path)v=isRecord(v)&&Object.hasOwn(v,key)?v[key]:undefined;
    if(selector.match){for(const item of Array.isArray(v)?v:[v])if(isRecord(item)&&typeof item[selector.match.key]==="string"&&attributeKey(String(item[selector.match.key]))===attributeKey(selector.match.value))extracted.push(item[selector.valueKey!]);}
    else if(v!==undefined&&v!==null)extracted.push(v);
  }
  const flattened=extracted.flatMap(v=>Array.isArray(v)?v:[v]);
  if(flattened.length>100||flattened.some(v=>typeof v!=="string"&&typeof v!=="number"||typeof v==="number"&&!Number.isFinite(v)))return {state:"CONFLICT",valueIds:[],rawValues:[],bucket:"__conflict__"};
  const rawValues=[...new Set(flattened.map(String).filter(v=>v.trim()))];
  if(rawValues.some(v=>v.length>500))return {state:"CONFLICT",valueIds:[],rawValues:[],bucket:"__conflict__"};
  const aliases=new Map(d.values.flatMap(v=>[v.label,...v.aliases].map(a=>[attributeKey(a),v.id] as const)));
  const valueIds=[...new Set(rawValues.flatMap(v=>aliases.has(attributeKey(v))?[aliases.get(attributeKey(v))!]:[]))].sort();
  const state:AttributeState=!rawValues.length?"MISSING":d.cardinality==="single"&&valueIds.length>1?"CONFLICT":rawValues.some(v=>!aliases.has(attributeKey(v)))?"UNMAPPED":valueIds.length>1?"MULTI_VALUE":"KNOWN";
  return {state,valueIds,rawValues,bucket:state==="KNOWN"?valueIds[0]:state==="MULTI_VALUE"?"__multiple__":state==="CONFLICT"?"__conflict__":"__unknown__"};
}
