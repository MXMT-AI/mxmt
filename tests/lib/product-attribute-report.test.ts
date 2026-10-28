import {beforeAll,afterAll,beforeEach,afterEach,expect,it,vi} from "vitest";
import {Prisma} from "@prisma/client";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const ai=vi.hoisted(()=>({chat:vi.fn(),chatWithUsage:vi.fn()}));vi.mock("@/lib/ai",()=>ai);
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {saveAttributeDictionary,approveAttributeDictionary,sampleProductAttributes,readAttributeEvidenceBatch} from "@/lib/product-attribute-store";
import {analyzeProductAttributes} from "@/lib/product-attribute-report";
import {productAttributeEvidence,type AttributeDictionary} from "@/lib/product-attributes";
import {payloadHash} from "@/lib/connectors/order-storage";
import {financialDecimal as D} from "@/lib/financial-decimal.mjs";
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot;
const p={tenantId:"a",userId:"owner"},now=screenSelection.now;
const definition=():AttributeDictionary=>({version:1,sourceId:"source",attribution:"exclusive_bucket",rubric:{kind:"coverage_only",minGroupSize:3},dimensions:[{id:"color",label:"Колір",cardinality:"multiple",selectors:[{path:["attributes","color"]}],values:[{id:"blue",label:"Синій",aliases:["blue"]},{id:"red",label:"Червоний",aliases:["red"]}]}]});
const request=(preview=true)=>({mode:"attributes_v2",dictionaryId:"watch",snapshotId:snapshot.snapshotId,preview});
const save=(dictionary=definition(),expectedRevision=0)=>saveAttributeDictionary(p,"watch",{dictionary,expectedRevision},f.db);
async function evidence(skuId:string,color:unknown,observedAt="2026-10-24T10:00:00Z",sourceId="source",recordId=`evidence-${skuId}`){
 const payload=productAttributeEvidence(skuId,{attributes:{color},name:"must-not-be-inferred"});
 await f.pg.query(`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES ($1,'a',$2,'inventory-run','product-attributes',$3,$4,$5,$6)`,[recordId,sourceId,`${skuId}:${payloadHash(payload)}`,JSON.stringify(payload),payloadHash(payload),observedAt]);
 return recordId;
}
const approve=(configId:string,samples=[{skuId:"sku-a",dimensionId:"color",recordId:"evidence-sku-a",valueIds:["blue"]}])=>approveAttributeDictionary(p,"watch",{configId,samples,approvalReference:"synthetic mapping approval",rubricApprovalReference:"synthetic coverage-only approval"},f.db,now);
beforeAll(async()=>{f=await createScreenDb();snapshot=await createScreenSnapshot("a",screenSelection,f.db);await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('viewer97','viewer97@test.invalid','test','Viewer','VIEWER','a',now()),('other97','other97@test.invalid','test','Other','ADMIN','b',now());`);},30000);
beforeEach(async()=>{vi.clearAllMocks();await f.pg.exec(`DELETE FROM "MerchandisingAction" WHERE "entityType"='ATTRIBUTE_DICTIONARY';DELETE FROM "MerchandisingConfig" WHERE key LIKE 'attributes:%';DELETE FROM "DataSourceRecord" WHERE resource='product-attributes';`);await evidence("sku-a","blue");await evidence("sku-b",["blue","red","blue"]);await evidence("sku-c","unmapped");});
afterEach(async()=>{await f.pg.exec(`DELETE FROM "ConnectorSelection";DELETE FROM "SkuAlias" WHERE id='ambiguous-97';`);});afterAll(async()=>f?.pg.close());
it("keeps a prepared dictionary in draft mode and blocks activation without real sample/rubric approval",async()=>{
 const draft=await save();expect(draft.state).toBe("draft");
 await expect(analyzeProductAttributes(p,request(false),f.db)).rejects.toMatchObject({code:"ATTRIBUTE_DICTIONARY_NOT_APPROVED"});
 const preview=await analyzeProductAttributes(p,request(),f.db);expect(preview.state).toBe("draft_preview");expect(preview.by_category).toEqual([]);expect(preview.statusMeaning).toBe("ATTRIBUTE_MAPPING_COVERAGE_ONLY");
 await expect(approveAttributeDictionary(p,"watch",{configId:draft.configId,samples:[],approvalReference:"x",rubricApprovalReference:"x"},f.db,now)).rejects.toMatchObject({code:"ATTRIBUTE_SAMPLE_APPROVAL_REQUIRED"});expect(ai.chat).not.toHaveBeenCalled();expect(ai.chatWithUsage).not.toHaveBeenCalled();
});
it("approves checked source evidence and keeps dictionary settings separate from financial config",async()=>{
 const d=await save();expect(await approve(d.configId)).toMatchObject({state:"approved"});expect((await analyzeProductAttributes(p,request(false),f.db)).state).toBe("approved");
 expect((await f.pg.query<{isActive:boolean}>(`SELECT "isActive" FROM "MerchandisingConfig" WHERE id=$1`,[d.configId])).rows[0].isActive).toBe(false);
});
it("reconciles exclusive single/multiple/unknown groups to saved stock and sales without duplicate SKU memberships",async()=>{
 await save();const report=await analyzeProductAttributes(p,request(),f.db);expect(report.memberships).toHaveLength(report.coverage.eligibleSkus);
 expect(report.memberships.find(m=>m.skuId==="sku-b")).toMatchObject({state:"MULTI_VALUE",valueIds:["blue","red"],bucket:"__multiple__"});
 expect(report.memberships.find(m=>m.skuId==="sku-d")?.state).toBe("SOURCE_UNAVAILABLE");expect(report.groups.reduce((n,g)=>n+g.skuCount,0)).toBe(report.coverage.eligibleSkus);
 const stocks=report.groups.flatMap(g=>g.stock).filter(s=>s.currency==="UAH");expect(stocks.reduce((n,s)=>n.plus(s.quantity??0),D(0)).toString()).toBe("15");
 const sales=report.groups.flatMap(g=>g.sales);expect(sales.some(s=>s.current.returnOrderCount>0)).toBe(true);expect(sales.every(s=>s.current.coverage&&"returnUnits" in s)).toBe(true);
 const expected=(await f.pg.query<{currency:string;revenue:string}>(`SELECT currency,sum(revenue)::text revenue FROM "MerchandisingScreenFact" WHERE "snapshotId"=$1 AND "inCurrent" AND kind<>'PREORDER' AND "productKind"='MERCHANDISE' AND "skuId" IN ('sku-a','sku-b','sku-c','sku-d') GROUP BY currency`,[snapshot.snapshotId])).rows;
 for(const e of expected)expect(sales.filter(s=>s.currency===e.currency).reduce((sum,s)=>sum.plus(s.current.revenue??0),D(0)).toString()).toBe(D(e.revenue).toString());
 expect(report.groups.find(g=>g.valueId==="blue")?.status).toBe("SPARSE");expect(report.groups.find(g=>g.valueId==="__unknown__")?.status).toBe("REVIEW_MAPPING");
});
it("separates currencies and keeps source publication provenance/unknown history visible",async()=>{
 await save();const r=await analyzeProductAttributes(p,request(),f.db);expect(new Set(r.groups.flatMap(g=>g.stock).map(s=>s.currency))).toEqual(new Set(["UAH","USD"]));expect(r.provenance.source.daily.id).toBe(snapshot.stock.calculationId);expect(r.provenance.source.sales.id).toBe(snapshot.sales.calculationId);
 expect(r.groups.flatMap(g=>g.sales).some(s=>s.lyGrossUnits===null||s.lyGrossUnits!==undefined)).toBe(true);
});
it("invalidates result identity and approval after a new mapping revision",async()=>{
 const d=await save();await approve(d.configId);const a=await analyzeProductAttributes(p,request(false),f.db),next=definition();next.dimensions[0].values[0].id="navy";await save(next,1);
 const b=await analyzeProductAttributes(p,request(),f.db);expect(b.analysisId).not.toBe(a.analysisId);expect(b.provenance.revision).toBe(2);expect(b.memberships.find(m=>m.skuId==="sku-a")?.valueIds).toEqual(["navy"]);await expect(analyzeProductAttributes(p,request(false),f.db)).rejects.toMatchObject({code:"ATTRIBUTE_DICTIONARY_NOT_APPROVED"});
});
it("rejects incorrect or incomplete owner sample mappings instead of trusting submitted labels",async()=>{
 const d=await save();await expect(approve(d.configId,[{skuId:"sku-a",dimensionId:"color",recordId:"evidence-sku-a",valueIds:["red"]}])).rejects.toMatchObject({code:"ATTRIBUTE_SAMPLE_NOT_VERIFIED"});
 await expect(approve(d.configId,[{skuId:"sku-a",dimensionId:"color",recordId:"foreign",valueIds:["blue"]}])).rejects.toMatchObject({code:"ATTRIBUTE_SAMPLE_NOT_VERIFIED"});
});
it("returns only selected sample fields with record provenance, never the entire product raw body",async()=>{
 await save();const samples=await sampleProductAttributes(p,{dictionaryId:"watch",skuIds:["sku-a"]},f.db);expect(samples.samples[0].dimensions[0]).toMatchObject({state:"KNOWN",rawValues:["blue"]});expect(JSON.stringify(samples)).not.toContain("must-not-be-inferred");expect(samples.samples[0].evidence?.recordId).toBe("evidence-sku-a");
});
it("does not use future attribute observations or ambiguous canonical aliases",async()=>{
 await save();await evidence("sku-a","red","2026-11-01T00:00:00Z","source","future-a");expect((await analyzeProductAttributes(p,request(),f.db)).memberships.find(m=>m.skuId==="sku-a")?.valueIds).toEqual(["blue"]);
 await f.pg.exec(`INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('ambiguous-97','a','source','sku-a','SOURCE_PRODUCT_ID','another-provider-product');`);
 expect((await analyzeProductAttributes(p,request(),f.db)).memberships.find(m=>m.skuId==="sku-a")?.state).toBe("SOURCE_UNAVAILABLE");
});
it("does not choose arbitrarily between simultaneous conflicting observations",async()=>{
 await save();await evidence("sku-a","red","2026-10-24T10:00:00Z","source","conflict-a");const r=await analyzeProductAttributes(p,request(),f.db);expect(r.memberships.find(m=>m.skuId==="sku-a")?.state).toBe("SOURCE_UNAVAILABLE");
});
it("detects simultaneous conflicts even when two newer duplicate hashes would mask a third observation",async()=>{
 await save();await evidence("sku-a","red","2026-10-24T10:00:00Z","source","old-conflict-a");
 await f.pg.exec(`INSERT INTO "DataImportRun" SELECT (jsonb_populate_record(NULL::"DataImportRun",to_jsonb(r)||'{"id":"duplicate-attribute-run","idempotencyKey":"duplicate-attribute-run"}'::jsonb)).* FROM "DataImportRun" r WHERE id='inventory-run';
 INSERT INTO "DataSourceRecord" SELECT (jsonb_populate_record(NULL::"DataSourceRecord",to_jsonb(r)||'{"id":"duplicate-blue-a","importRunId":"duplicate-attribute-run","createdAt":"2026-10-28T10:00:00Z"}'::jsonb)).* FROM "DataSourceRecord" r WHERE id='evidence-sku-a';
 UPDATE "DataSourceRecord" SET "createdAt"='2026-10-28T11:00:00Z' WHERE id='evidence-sku-a';UPDATE "DataSourceRecord" SET "createdAt"='2026-10-28T09:00:00Z' WHERE id='old-conflict-a';`);
 expect((await analyzeProductAttributes(p,request(),f.db)).memberships.find(m=>m.skuId==="sku-a")?.state).toBe("SOURCE_UNAVAILABLE");
});
it("distinguishes recorded-but-unavailable evidence from actual physical-field coverage",async()=>{
 await save();await f.pg.exec(`UPDATE "DataSourceRecord" SET payload=jsonb_set(payload,'{kind}','"FUTURE_ATTRIBUTE_FORMAT"') WHERE id='evidence-sku-a'`);
 const r=await analyzeProductAttributes(p,request(),f.db);expect(r.memberships.find(m=>m.skuId==="sku-a")).toMatchObject({state:"SOURCE_UNAVAILABLE",evidence:{state:"UNSUPPORTED_VERSION"}});expect(r.coverage.sourceEvidenceRecorded).toBe(3);expect(r.coverage.sourceEvidenceAvailable).toBe(2);
});
it("rejects excessive total source bytes before fetching raw product bodies",async()=>{
 await save();let bodiesRead=false;const bounded={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$queryRaw:async<T>(q:Prisma.Sql)=>{
  if(q.text.startsWith("SELECT id,payload->'data'"))bodiesRead=true;
  const rows=await tx.$queryRaw<T>(q);return q.text.includes('req("skuId")')?(rows as Array<{records:Array<Record<string,unknown>>|null}>).map(row=>({...row,records:row.records?.map(h=>({...h,bytes:5*1024*1024}))})) as T:rows;
 }}))};
 await expect(analyzeProductAttributes(p,request(),bounded)).rejects.toMatchObject({code:"ATTRIBUTE_EVIDENCE_LIMIT"});expect(bodiesRead).toBe(false);
});
it("keeps tenants, roles and current source freshness isolated",async()=>{
 await save();await expect(analyzeProductAttributes({tenantId:"b",userId:"other97"},request(),f.db)).rejects.toMatchObject({code:"ATTRIBUTE_DICTIONARY_NOT_FOUND"});await expect(analyzeProductAttributes({tenantId:"a",userId:"viewer97"},request(),f.db)).rejects.toMatchObject({code:"AI_FORBIDDEN"});
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',11,now());`);await expect(analyzeProductAttributes(p,request(),f.db)).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
});
it("bounds source evidence reads independently of the number of memberships",async()=>{
 await save();const queries:string[]=[];const traced={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$queryRaw:async<T>(q:Prisma.Sql)=>{queries.push(q.text);return tx.$queryRaw<T>(q);}}))};
 await analyzeProductAttributes(p,request(),traced);expect(queries.filter(q=>q.includes('FROM "DataSourceRecord"')).length).toBe(2);
 await expect(f.db.$transaction(tx=>readAttributeEvidenceBatch(p,"source",Array(501).fill("sku-a"),now.toISOString(),tx))).rejects.toMatchObject({code:"ATTRIBUTE_SKU_LIMIT"});
});
