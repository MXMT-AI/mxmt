import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {assignCustomLabels,customLabelCsv,labelCellIssue,parseLabelProfile,parseLabelScope,classificationLabelRules,type LabelProfile,type LabelInputRow} from "@/lib/custom-labels";
export const labelProfile=(provider:"meta"|"google"="google"):LabelProfile=>({version:1,sourceId:"source",target:{provider,accountId:"catalog",primaryFeedReference:"primary",...(provider==="google"?{feedLabel:"UA",language:"uk"}:{})},ownedSlots:[0],precedence:"first_match",emptyPolicy:"omit_item",
 rules:[{id:"healthy",slot:0,value:"healthy",when:{classifications:["HEALTHY"]}},{id:"risk",slot:0,value:"risk",when:{classifications:["RISK"]}}],mappings:[{skuId:"a",itemId:"00001",verificationReference:"primary-row-1"},{skuId:"b",itemId:"00002",verificationReference:"primary-row-2"}]});
const row=(skuId="a",classification="HEALTHY"):LabelInputRow=>({skuId,classification,productKind:"MERCHANDISE",quantity:"12.0000",shortage:false});
it("implements the owner's approved initial slot-zero policy using saved class values verbatim",()=>{
 const p=labelProfile();p.rules=classificationLabelRules();
 expect(p.rules.every(r=>r.slot===0&&r.when.classifications.length===1&&r.value===r.when.classifications[0])).toBe(true);
 expect(assignCustomLabels(p,[row()]).assignments[0].labels).toEqual({custom_label_0:"HEALTHY"});expect(p.rules.some(r=>r.value==="DATA_ERROR"||r.value==="SERVICE")).toBe(false);
});
it("keeps stable exact labels and item IDs regardless of row/mapping order",()=>{
 const p=labelProfile(),rows=[row("a"),row("b","RISK")];
 expect(assignCustomLabels(p,rows)).toEqual(assignCustomLabels({...p,mappings:p.mappings.slice().reverse()},rows.slice().reverse()));
 expect(assignCustomLabels(p,rows).assignments[0]).toMatchObject({itemId:"00001",labels:{custom_label_0:"healthy"},ruleIds:{custom_label_0:"healthy"}});
});
it("uses explicitly ordered first-match precedence and never overwrites an unowned slot",()=>{
 const p=labelProfile();p.rules.unshift({id:"shortage-first",slot:0,value:"shortage",when:{classifications:["HEALTHY"],shortage:true}});
 const r=assignCustomLabels(p,[{...row(),shortage:true}]);expect(r.assignments[0].labels).toEqual({custom_label_0:"shortage"});expect(r.assignments[0].ruleIds.custom_label_0).toBe("shortage-first");
 expect(()=>parseLabelProfile({...p,rules:[...p.rules,{id:"unowned",slot:1,value:"bad",when:{classifications:["HEALTHY"]}}]})).toThrow();
});
it("does not bypass an earlier possible match when its input is missing",()=>{
 const p=labelProfile();p.rules.unshift({id:"stock-first",slot:0,value:"available",when:{classifications:["HEALTHY"],inStock:true}});
 const r=assignCustomLabels(p,[{...row(),quantity:null}]);expect(r.assignments).toHaveLength(0);expect(r.rejected[0].reasons).toContain("SLOT_0_INPUT_UNAVAILABLE");
});
it("allows a later rule when an earlier rule is conclusively false despite another missing condition",()=>{
 const p=labelProfile();p.rules.unshift({id:"false-first",slot:0,value:"special",when:{classifications:["HEALTHY"],inStock:false,shortage:true}});
 expect(assignCustomLabels(p,[{...row(),shortage:null}]).assignments[0].labels.custom_label_0).toBe("healthy");
});
it.each(["DATA_ERROR","SERVICE","INVENTED",null])("never fabricates a label for unavailable classification %s",classification=>{
 expect(assignCustomLabels(labelProfile(),[{...row(),classification}]).rejected[0].reasons).toContain("CLASSIFICATION_UNAVAILABLE");
});
it("rejects unknown/service product kinds even with a known class",()=>{
 expect(assignCustomLabels(labelProfile(),[{...row(),productKind:"GIFT_CARD"}]).rejected[0].reasons).toContain("INELIGIBLE_PRODUCT_KIND");
});
it("reports absent, duplicate and unverified mappings explicitly",()=>{
 const p=labelProfile();p.mappings[0].verificationReference=null;p.mappings.push({...p.mappings[0]});
 const r=assignCustomLabels(p,[row(),row("missing")]);expect(r.assignments).toHaveLength(0);expect(r.rejected[0].reasons).toEqual(expect.arrayContaining(["UNVERIFIED_MAPPING","DUPLICATE_SKU_MAPPING"]));expect(r.rejected[1].reasons).toEqual(["MISSING_MAPPING"]);
});
it("checks Google case collisions across the entire profile, including mappings outside a filtered preview",()=>{
 const p=labelProfile();p.mappings[0].itemId="ID";p.mappings[1].itemId="id";
 expect(assignCustomLabels(p,[row()]).rejected[0].reasons).toContain("DUPLICATE_TARGET_ID");
 p.target={provider:"meta",accountId:"catalog",primaryFeedReference:"primary"};expect(assignCustomLabels(p,[row()]).assignments).toHaveLength(1);
 p.mappings[1].itemId="ID";expect(assignCustomLabels(p,[row()]).rejected[0].reasons).toContain("DUPLICATE_TARGET_ID");
});
it.each(["google","meta"] as const)("applies %s ID boundaries without truncation",provider=>{
 const p=labelProfile(provider),limit=provider==="google"?50:100;p.mappings[0].itemId="a".repeat(limit);
 expect(assignCustomLabels(p,[row()]).assignments).toHaveLength(1);p.mappings[0].itemId+="a";expect(assignCustomLabels(p,[row()]).rejected[0].reasons).toContain("ITEM_ID_VALUE_TOO_LONG");
});
it("omits the whole item instead of generating empty cells when one owned slot is unknown",()=>{
 const p=labelProfile();p.ownedSlots=[0,4];p.rules.push({id:"only-risk",slot:4,value:"risk-detail",when:{classifications:["RISK"]}});
 const result=assignCustomLabels(p,[row(),row("b","RISK")]);expect(result.assignments.map(a=>a.skuId)).toEqual(["b"]);expect(result.rejected[0].reasons).toContain("SLOT_4_NO_MATCH");
 expect(customLabelCsv(p,result.assignments)).toBe('"id","custom_label_0","custom_label_4"\r\n"00002","risk","risk-detail"\r\n');
});
it("rejects an explicit empty first-match value instead of clearing or falling through",()=>{
 const p=labelProfile();p.rules[0].value="";p.rules.push({id:"later",slot:0,value:"later",when:{classifications:["HEALTHY"]}});
 expect(assignCustomLabels(p,[row()]).rejected[0].reasons).toContain("SLOT_0_EMPTY_VALUE");
});
it("uses target CSV quoting and Unicode without BOM, altered IDs or added metadata columns",()=>{
 const p=labelProfile();p.rules[0].value='Весна, "нова" колекція';const csv=customLabelCsv(p,assignCustomLabels(p,[row()]).assignments);
 expect(csv).toBe('"id","custom_label_0"\r\n"00001","Весна, ""нова"" колекція"\r\n');expect(csv.startsWith("\uFEFF")).toBe(false);
 p.rules[0].value="і".repeat(100);expect(assignCustomLabels(p,[row()]).assignments).toHaveLength(1);p.rules[0].value+="і";expect(assignCustomLabels(p,[row()]).rejected[0].reasons).toContain("SLOT_0_VALUE_TOO_LONG");
});
it.each(["=SUM(A1)","+1","-1","@SUM(A1)","＝SUM(A1)","\u200B=SUM(A1)","\t=SUM(A1)"," abc","abc ","a\nnewline","a\uE000b","a\uD800b"])("rejects unsafe cell %j instead of mutating its feed identity",value=>{
 expect(labelCellIssue(value,100)).not.toBeNull();const p=labelProfile();p.mappings[0].itemId=value;expect(assignCustomLabels(p,[row()]).assignments).toHaveLength(0);
 p.mappings[0].itemId="ok";p.rules[0].value=value;expect(assignCustomLabels(p,[row()]).assignments).toHaveLength(0);
});
it("bounds source rows and UTF-8 bytes even for large Unicode output",()=>{
 const p=labelProfile();expect(()=>assignCustomLabels(p,Array.from({length:5001},()=>row()))).toThrow("LABEL_ROW_LIMIT");
 p.ownedSlots=[0,1,2,3,4];const a={skuId:"a",itemId:"id",labels:Object.fromEntries(p.ownedSlots.map(s=>[`custom_label_${s}`,"і".repeat(100)])),ruleIds:{}};
 expect(()=>customLabelCsv(p,Array.from({length:5000},()=>a))).toThrow("LABEL_FILE_LIMIT");
});
it("requires explicit target scope, slot ownership and omission policy; clients cannot inject assignments",()=>{
 const p=labelProfile();expect(parseLabelProfile(p)).toEqual(p);
 expect(()=>parseLabelProfile({...p,target:{provider:"google",accountId:"merchant",primaryFeedReference:"primary"}})).toThrow();
 expect(()=>parseLabelProfile({...p,ownedSlots:[0,0]})).toThrow();expect(()=>parseLabelProfile({...p,emptyPolicy:"clear"})).toThrow();
 expect(()=>parseLabelScope({profileId:"p",snapshotId:"s",assignments:[]})).toThrow();expect(()=>parseLabelScope({profileId:"p",snapshotId:"s",filters:{channelId:"secret"}})).toThrow();
});
