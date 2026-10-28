import {expect,it} from "vitest";
import {parseAttributeDictionary,normalizeProductAttribute,productAttributeEvidence,type AttributeDictionary} from "@/lib/product-attributes";
const dictionary=():AttributeDictionary=>({version:1,sourceId:"source",attribution:"exclusive_bucket",rubric:{kind:"coverage_only",minGroupSize:3},dimensions:[{id:"color",label:"Колір циферблата",cardinality:"multiple",selectors:[{path:["attributes","color"]}],values:[{id:"blue",label:"Синій",aliases:["blue","синiй"]},{id:"red",label:"Червоний",aliases:["red"]}]}]});
it("normalizes Unicode, case, whitespace and approved aliases without inferring from product names",()=>{
 const d=parseAttributeDictionary(dictionary()).dimensions[0];
 expect(normalizeProductAttribute(d,{attributes:{color:"  ＢＬＵＥ  "},name:"Red watch"})).toMatchObject({state:"KNOWN",valueIds:["blue"],bucket:"blue"});
 expect(normalizeProductAttribute(d,{name:"Blue watch"})).toMatchObject({state:"MISSING",valueIds:[],bucket:"__unknown__"});
});
it("deduplicates repeated aliases and puts multi-value membership in a single exclusive bucket",()=>{
 const d=dictionary().dimensions[0];expect(normalizeProductAttribute(d,{attributes:{color:["blue","СИНІЙ","blue"]}})).toMatchObject({state:"KNOWN",valueIds:["blue"]});
 expect(normalizeProductAttribute(d,{attributes:{color:["blue","red","blue"]}})).toMatchObject({state:"MULTI_VALUE",valueIds:["blue","red"],bucket:"__multiple__"});
 expect(normalizeProductAttribute({...d,cardinality:"single"},{attributes:{color:["blue","red"]}})).toMatchObject({state:"CONFLICT",bucket:"__conflict__"});
 expect(normalizeProductAttribute({...d,cardinality:"single"},{attributes:{color:["blue","red","unmapped"]}})).toMatchObject({state:"CONFLICT",bucket:"__conflict__"});
});
it("keeps mixed known/unknown values, missing fields and unavailable source evidence explicit",()=>{
 const d=dictionary().dimensions[0];expect(normalizeProductAttribute(d,{attributes:{color:["blue","unexpected"]}})).toMatchObject({state:"UNMAPPED",bucket:"__unknown__"});
 expect(normalizeProductAttribute(d,null).state).toBe("SOURCE_UNAVAILABLE");expect(normalizeProductAttribute(d,{attributes:{color:[]}}).state).toBe("MISSING");
});
it("matches an explicit YML/option-style named field while preserving unknown physical names",()=>{
 const d={...dictionary().dimensions[0],selectors:[{path:["param"],match:{key:"@_name",value:"Колір циферблата"},valueKey:"#text"}]};
 expect(normalizeProductAttribute(d,{param:[{"@_name":"Матеріал","#text":"red"},{"@_name":"Колір циферблата","#text":"blue"}]}).valueIds).toEqual(["blue"]);
 expect(normalizeProductAttribute(d,{param:[{"@_name":"Колір корпусу","#text":"blue"}]}).state).toBe("MISSING");
});
it("rejects ambiguous dictionary aliases instead of letting value order choose the result",()=>{
 const v=dictionary();v.dimensions[0].values[1].aliases=[" BLUE "];expect(()=>parseAttributeDictionary(v)).toThrow("INVALID_ATTRIBUTE_DICTIONARY");
});
it.each(["name","title","description","image_link","__proto__","constructor"])("forbids using %s as a physical attribute source",path=>{
 const v=dictionary();v.dimensions[0].selectors=[{path:[path]}];expect(()=>parseAttributeDictionary(v)).toThrow();
});
it("rejects legacy thresholds, unapproved attribution policies and oversized dictionaries",()=>{
 expect(()=>parseAttributeDictionary({...dictionary(),rubric:{kind:"legacy_str",minGroupSize:3}})).toThrow();expect(()=>parseAttributeDictionary({...dictionary(),attribution:"duplicate_all"})).toThrow();
 expect(()=>parseAttributeDictionary({...dictionary(),dimensions:Array(6).fill(dictionary().dimensions[0])})).toThrow();
});
it("retains structured raw data for remapping and labels missing/oversized evidence instead of truncating it",()=>{
 const raw={attributes:{color:"blue"}};expect(productAttributeEvidence("p",raw)).toMatchObject({kind:"PRODUCT_ATTRIBUTE_EVIDENCE_V1",state:"AVAILABLE",data:raw});
 expect(productAttributeEvidence("p",undefined).state).toBe("MISSING");expect(productAttributeEvidence("p",{description:"x".repeat(65536)})).toMatchObject({state:"TOO_LARGE",data:null});
});
