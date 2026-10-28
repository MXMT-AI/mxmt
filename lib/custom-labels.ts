import { isRecord } from "./api-contracts";
import { SKU_STATUSES, type SkuStatus } from "./classify";
import { csvCell } from "./scenario-csv";
import { financialDecimal as D } from "./financial-decimal.mjs";

export const LABEL_CONTRACT_VERSION = "custom-label-feed-2026-10-28-v1";
export const LABEL_MAX_ROWS = 5000;
export const LABEL_MAX_BYTES = 4 * 1024 * 1024;
export const LABEL_EXPORTS_PER_DAY = 20;
export class CustomLabelError extends Error {
  constructor(readonly code:string,readonly status=400,readonly details?:string[]){super(code);}
}
export type LabelProvider="meta"|"google";
export interface LabelTarget {provider:LabelProvider;accountId:string;primaryFeedReference:string;feedLabel?:string;language?:string}
export interface LabelRule {
  id:string;slot:number;value:string;
  when:{classifications:SkuStatus[];shortage?:boolean;inStock?:boolean};
}
export interface LabelProfile {
  version:1;sourceId:string;target:LabelTarget;ownedSlots:number[];
  precedence:"first_match";emptyPolicy:"omit_item";
  rules:LabelRule[];
  mappings:Array<{skuId:string;itemId:string;verificationReference:string|null}>;
}
export interface LabelScope {profileId:string;snapshotId:string;filters?:{brandId?:string;categoryId?:string;skuId?:string}}
export interface LabelInputRow {
  skuId:string;classification:string|null;productKind:string|null;
  quantity:string|null;shortage:boolean|null;
}
export interface LabelAssignment {skuId:string;itemId:string;labels:Record<string,string>;ruleIds:Record<string,string>}
export interface LabelRejection {skuId:string;reasons:string[]}
/** Owner-approved initial policy: slot zero carries the saved class verbatim; unavailable/error classes are omitted. */
export function classificationLabelRules():LabelRule[]{
  return SKU_STATUSES.filter(c=>c!=="SERVICE"&&c!=="DATA_ERROR").map(c=>({id:`class-${c}`,slot:0,value:c,when:{classifications:[c]}}));
}
const invalid=(detail:string):never=>{throw new CustomLabelError("INVALID_LABEL_PROFILE",400,[detail]);};
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&!!v.trim()&&v.length<=max;
export const labelIdentifier=(v:unknown):string=>{
  if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new CustomLabelError("INVALID_LABEL_ID");return v;
};
/** Validate bounded versioned policy; imported mapping/label defects remain visible in preview. */
export function parseLabelProfile(value:unknown):LabelProfile {
  if(!isRecord(value)||Object.keys(value).sort().join()!=="emptyPolicy,mappings,ownedSlots,precedence,rules,sourceId,target,version"||value.version!==1||value.precedence!=="first_match"||value.emptyPolicy!=="omit_item")return invalid("unsupported profile policy");
  labelIdentifier(value.sourceId);
  const t=value.target;
  if(!isRecord(t)||!keys(t,["provider","accountId","primaryFeedReference","feedLabel","language"])||!["meta","google"].includes(String(t.provider))||!text(t.accountId,160)||!text(t.primaryFeedReference,500))return invalid("invalid target scope");
  if(t.provider==="google"&&(!text(t.feedLabel,20)||!/^[A-Z0-9_-]+$/.test(t.feedLabel)||!text(t.language,35)||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(t.language)))return invalid("Google feed label and language required");
  if(t.provider==="meta"&&(t.feedLabel!==undefined||t.language!==undefined))return invalid("Meta target must not use Google matching fields");
  if(!Array.isArray(value.ownedSlots)||!value.ownedSlots.length||value.ownedSlots.length>5||new Set(value.ownedSlots).size!==value.ownedSlots.length||value.ownedSlots.some(s=>!Number.isInteger(s)||s<0||s>4))return invalid("owned slots must be unique integers 0–4");
  if(!Array.isArray(value.rules)||!value.rules.length||value.rules.length>100)return invalid("rules must contain 1–100 entries");
  const ids=new Set<string>();
  for(const r of value.rules){
    if(!isRecord(r)||Object.keys(r).sort().join()!=="id,slot,value,when"||typeof r.value!=="string"||r.value.length>500||!value.ownedSlots.includes(r.slot))return invalid("invalid rule");
    const id=labelIdentifier(r.id);if(ids.has(id))return invalid("duplicate rule ID");ids.add(id);
    const w=r.when;
    if(!isRecord(w)||!keys(w,["classifications","shortage","inStock"])||!Array.isArray(w.classifications)||!w.classifications.length||w.classifications.length>8||w.classifications.some(c=>!SKU_STATUSES.includes(c))||new Set(w.classifications).size!==w.classifications.length||[w.shortage,w.inStock].some(v=>v!==undefined&&typeof v!=="boolean"))return invalid("unsupported rule conditions");
  }
  if(!Array.isArray(value.mappings)||value.mappings.length>LABEL_MAX_ROWS)return invalid("mapping limit exceeded");
  for(const m of value.mappings){
    if(!isRecord(m)||Object.keys(m).sort().join()!=="itemId,skuId,verificationReference"||typeof m.itemId!=="string"||m.itemId.length>500||!(m.verificationReference===null||text(m.verificationReference,500)))return invalid("invalid mapping");labelIdentifier(m.skuId);
  }
  const profile=structuredClone(value) as unknown as LabelProfile;
  profile.ownedSlots.sort((a,b)=>a-b);
  // Rule order is meaningful; mapping order is not. Keep duplicates for explicit preview rejection.
  profile.mappings.sort((a,b)=>a.skuId<b.skuId?-1:a.skuId>b.skuId?1:a.itemId<b.itemId?-1:a.itemId>b.itemId?1:0);
  return profile;
}
/** Never normalize or prefix provider identity; reject cells that spreadsheets could execute. */
export function labelCellIssue(value:string,max:number):string|null {
  if(!value.length)return "EMPTY_VALUE";
  if(value.length>max)return "VALUE_TOO_LONG";
  if(value!==value.trim()||/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(value))return "UNSUPPORTED_UNICODE_OR_WHITESPACE";
  if(/^[=+\-@＝＋－＠]/u.test(value))return "UNSAFE_FORMULA_PREFIX";
  return null;
}
const targetKey=(id:string,provider:LabelProvider)=>provider==="google"?id.normalize("NFC").toLowerCase():id;
/** Assign first matching rules per owned slot using only saved daily states, never reclassifying. */
export function assignCustomLabels(profile:LabelProfile,rows:LabelInputRow[]):{assignments:LabelAssignment[];rejected:LabelRejection[]} {
  if(rows.length>LABEL_MAX_ROWS)throw new CustomLabelError("LABEL_ROW_LIMIT",422);
  const bySku=new Map<string,LabelProfile["mappings"]>(),byItem=new Map<string,Set<string>>();
  for(const m of profile.mappings){
    bySku.set(m.skuId,[...(bySku.get(m.skuId)??[]),m]);
    const key=targetKey(m.itemId,profile.target.provider),skus=byItem.get(key)??new Set<string>();skus.add(m.skuId);byItem.set(key,skus);
  }
  const assignments:LabelAssignment[]=[],rejected:LabelRejection[]=[];
  for(const row of rows){
    const reasons:string[]=[],maps=bySku.get(row.skuId)??[],m=maps[0];
    if(!maps.length)reasons.push("MISSING_MAPPING");
    else {
      if(maps.length!==1)reasons.push("DUPLICATE_SKU_MAPPING");
      if(!m.verificationReference)reasons.push("UNVERIFIED_MAPPING");
      const issue=labelCellIssue(m.itemId,profile.target.provider==="google"?50:100);
      if(issue)reasons.push(`ITEM_ID_${issue}`);
      if((byItem.get(targetKey(m.itemId,profile.target.provider))?.size??0)>1)reasons.push("DUPLICATE_TARGET_ID");
    }
    if(row.productKind!=="MERCHANDISE")reasons.push("INELIGIBLE_PRODUCT_KIND");
    if(!row.classification||!SKU_STATUSES.includes(row.classification as SkuStatus)||["DATA_ERROR","SERVICE"].includes(row.classification))reasons.push("CLASSIFICATION_UNAVAILABLE");
    const labels:Record<string,string>={},ruleIds:Record<string,string>={};
    if(!reasons.length)for(const slot of profile.ownedSlots){
      let missing=false;
      const rule=profile.rules.find(r=>{
        if(r.slot!==slot||!r.when.classifications.includes(row.classification as SkuStatus))return false;
        const shortage=r.when.shortage===undefined?true:row.shortage===null?null:row.shortage===r.when.shortage;
        const stock=r.when.inStock===undefined?true:row.quantity===null?null:D(row.quantity).gt(0)===r.when.inStock;
        if(shortage===false||stock===false)return false;
        if(shortage===null||stock===null){missing=true;return false;}
        return true;
      });
      // An earlier rule with unknown inputs must not be bypassed by a later one.
      if(missing){reasons.push(`SLOT_${slot}_INPUT_UNAVAILABLE`);continue;}
      if(!rule){reasons.push(`SLOT_${slot}_NO_MATCH`);continue;}
      const issue=labelCellIssue(rule.value,100);if(issue){reasons.push(`SLOT_${slot}_${issue}`);continue;}
      const field=`custom_label_${slot}`;labels[field]=rule.value;ruleIds[field]=rule.id;
    }
    if(reasons.length)rejected.push({skuId:row.skuId,reasons});
    else assignments.push({skuId:row.skuId,itemId:m.itemId,labels,ruleIds});
  }
  const compare=(a:{skuId:string},b:{skuId:string})=>a.skuId<b.skuId?-1:a.skuId>b.skuId?1:0;
  return {assignments:assignments.sort(compare),rejected:rejected.sort(compare)};
}
/** Reuse safe CSV quoting while retaining the target's comma/no-BOM dialect and exact ID bytes. */
export function customLabelCsv(profile:LabelProfile,assignments:LabelAssignment[]):string {
  const fields=profile.ownedSlots.map(s=>`custom_label_${s}`),headers=["id",...fields];
  const quote=(value:string,max:number)=>{const issue=labelCellIssue(value,max);if(issue)throw new CustomLabelError("INVALID_LABEL_EXPORT_CELL",422,[issue]);return csvCell({type:"text",value});};
  const content=[headers.map(h=>quote(h,100)).join(","),...assignments.map(a=>[quote(a.itemId,profile.target.provider==="google"?50:100),...fields.map(f=>quote(a.labels[f]??"",100))].join(","))].join("\r\n")+"\r\n";
  if(Buffer.byteLength(content,"utf8")>LABEL_MAX_BYTES)throw new CustomLabelError("LABEL_FILE_LIMIT",422);
  return content;
}
/** Explicit scope parsing forbids client assignments, provider IDs or rule overrides at export time. */
export function parseLabelScope(value:unknown):LabelScope {
  if(!isRecord(value)||!keys(value,["profileId","snapshotId","filters"]))throw new CustomLabelError("INVALID_LABEL_SCOPE");
  labelIdentifier(value.profileId);labelIdentifier(value.snapshotId);
  if(value.filters!==undefined){if(!isRecord(value.filters)||!keys(value.filters,["brandId","categoryId","skuId"]))throw new CustomLabelError("INVALID_LABEL_SCOPE");for(const v of Object.values(value.filters))if(v!=="__unassigned__")labelIdentifier(v);}
  return structuredClone(value) as unknown as LabelScope;
}
