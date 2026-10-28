import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import {Prisma} from "@prisma/client";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const ai=vi.hoisted(()=>({chat:vi.fn(),chatWithUsage:vi.fn()}));vi.mock("@/lib/ai",()=>ai);
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {approveCustomLabelProfile,readCustomLabelProfile,previewCustomLabels,createCustomLabelExport,readCustomLabelFile,readCustomLabelHistory} from "@/lib/custom-label-store";
import {classificationLabelRules,type LabelProfile,type LabelInputRow} from "@/lib/custom-labels";
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot;
const p={tenantId:"a",userId:"owner"},id="96aabbcc-1122-4123-8123-001122334455",now=screenSelection.now;
const profile=(provider:"google"|"meta"="google"):LabelProfile=>({version:1,sourceId:"source",target:{provider,accountId:"fixture-catalog",primaryFeedReference:"fixture-primary",...(provider==="google"?{feedLabel:"UA",language:"uk"}:{})},ownedSlots:[0],precedence:"first_match",emptyPolicy:"omit_item",
 rules:classificationLabelRules(),mappings:["sku-a","sku-b","sku-c","sku-d"].map((skuId,i)=>({skuId,itemId:`0000${i+1}`,verificationReference:`synthetic-primary-row-${i+1}`}))});
const scope=()=>({profileId:"campaign",snapshotId:snapshot.snapshotId});
const approve=(value=profile(),expectedRevision=0,actor=p)=>approveCustomLabelProfile(actor,"campaign",{expectedRevision,profile:value,approvalReference:"synthetic owner approval"},f.db,now);
const preview=(value:unknown=scope())=>previewCustomLabels(p,value,f.db);
const create=(previewId:string,exportId=id)=>createCustomLabelExport(p,{scope:scope(),previewId,exportId},f.db,now);
beforeAll(async()=>{
 f=await createScreenDb();snapshot=await createScreenSnapshot("a",screenSelection,f.db);
 await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst96','analyst96@test.invalid','test','Analyst','ANALYST','a',now()),('viewer96','viewer96@test.invalid','test','Viewer','VIEWER','a',now()),('other96','other96@test.invalid','test','Other','ADMIN','b',now());`);
},30000);
beforeEach(async()=>{vi.clearAllMocks();await f.pg.exec(`DELETE FROM "MerchandisingAction" WHERE "entityType" IN ('CUSTOM_LABEL_PROFILE','CUSTOM_LABEL_EXPORT');DELETE FROM "MerchandisingConfig" WHERE key LIKE 'custom-labels:%';`);});
afterEach(async()=>{await f.pg.exec(`DELETE FROM "ConnectorSelection";`);});
afterAll(async()=>f?.pg.close());
it("requires explicit owner approval and never invents a default profile",async()=>{
 await expect(preview()).rejects.toMatchObject({code:"LABEL_PROFILE_NOT_FOUND",status:404});
 await expect(approve(profile(),0,{tenantId:"a",userId:"analyst96"})).rejects.toMatchObject({code:"AI_FORBIDDEN"});
 const saved=await approve();expect(saved).toMatchObject({revision:1,approvedBy:"owner",approvedAt:now.toISOString()});
 expect(await readCustomLabelProfile(p,"campaign",f.db)).toMatchObject({revision:1,id:saved.configId});
 expect((await f.pg.query<{isActive:boolean}>(`SELECT "isActive" FROM "MerchandisingConfig" WHERE id=$1`,[saved.configId])).rows[0].isActive).toBe(false);
 expect((await preview()).summary.accepted).toBeGreaterThan(0);expect(ai.chat).not.toHaveBeenCalled();expect(ai.chatWithUsage).not.toHaveBeenCalled();
});
it("produces stable previews and an exact audited CSV with unchanged repeat downloads",async()=>{
 await approve();const a=await preview(),b=await preview();expect(b).toEqual(a);expect(a.file).not.toHaveProperty("content");
 const receipt=await create(a.previewId);expect(await create(a.previewId)).toEqual(receipt);
 expect(receipt).toMatchObject({actorId:"owner",createdAt:now.toISOString(),ruleRevision:1,profileId:"campaign",previewId:a.previewId});
 expect(receipt.provenance.source.snapshotId).toBe(snapshot.snapshotId);expect(receipt.provenance.snapshotCreatedAt).toBe(snapshot.createdAt);
 const file=await readCustomLabelFile(p,id,f.db);expect(file.sha256).toBe(a.file.sha256);expect(file.byteLength).toBe(Buffer.byteLength(file.content,"utf8"));expect(file.content).toContain('"id","custom_label_0"\r\n');
 for(const row of a.assignments)expect(file.content).toContain(`"${row.itemId}","${row.labels.custom_label_0}"\r\n`);
 expect(await readCustomLabelFile(p,id,f.db)).toEqual(file);expect((await readCustomLabelHistory(p,f.db)).rows).toEqual([receipt]);
 expect((await f.pg.query(`SELECT id FROM "MerchandisingAction" WHERE "entityType"='CUSTOM_LABEL_EXPORT'`)).rows).toHaveLength(1);
 expect((await f.pg.query(`SELECT id FROM "AiExecution"`)).rows).toHaveLength(0);
});
it("keeps Meta and Google target contracts explicit, with separate auditable catalog scope",async()=>{
 await approve(profile("meta"));const a=await preview();expect(a.target.provider).toBe("meta");const receipt=await create(a.previewId);expect(receipt.file.name).toMatch(/^meta-custom-labels-/);expect(receipt.target).not.toHaveProperty("feedLabel");
});
it("invalidates stale previews after rules, mapping or ownership revisions while preserving old downloads",async()=>{
 await approve();const a=await preview(),receipt=await create(a.previewId),oldFile=await readCustomLabelFile(p,id,f.db);
 const next=profile();next.rules=next.rules.map(r=>({...r,value:`new-${r.value}`}));await approve(next,1);
 const b=await preview();expect(b.previewId).not.toBe(a.previewId);
 await expect(create(a.previewId,"96aabbcc-1122-4123-8123-001122334456")).rejects.toMatchObject({code:"LABEL_PREVIEW_CHANGED"});
 expect(await create(a.previewId)).toEqual(receipt);expect(await readCustomLabelFile(p,id,f.db)).toEqual(oldFile);
 await expect(approve(next,0)).rejects.toMatchObject({code:"LABEL_PROFILE_REVISION_CONFLICT"});
});
it("does not accept browser assignments or another actor's reused export ID",async()=>{
 await approve();const a=await preview();await create(a.previewId);
 await expect(createCustomLabelExport({tenantId:"a",userId:"analyst96"},{scope:scope(),previewId:a.previewId,exportId:id},f.db,now)).rejects.toMatchObject({code:"LABEL_EXPORT_ID_CONFLICT"});
 await expect(createCustomLabelExport(p,{scope:scope(),previewId:a.previewId,exportId:id,assignments:[]},f.db,now)).rejects.toMatchObject({code:"INVALID_LABEL_EXPORT"});
});
it("reports duplicate, unverified and missing mappings without exporting their items",async()=>{
 const v=profile();v.mappings=v.mappings.filter(m=>m.skuId!=="sku-d");v.mappings.find(m=>m.skuId==="sku-b")!.verificationReference=null;v.mappings.push({...v.mappings[0]});await approve(v);
 const result=await preview();expect(result.assignments.some(a=>["sku-a","sku-b","sku-d"].includes(a.skuId))).toBe(false);
 expect(result.rejected.find(r=>r.skuId==="sku-a")?.reasons).toContain("DUPLICATE_SKU_MAPPING");expect(result.rejected.find(r=>r.skuId==="sku-b")?.reasons).toContain("UNVERIFIED_MAPPING");expect(result.rejected.find(r=>r.skuId==="sku-d")?.reasons).toContain("MISSING_MAPPING");
});
it("requires all mapped canonical SKUs to belong to the approving tenant",async()=>{
 const v=profile();v.mappings[0].skuId="foreign-or-missing";await expect(approve(v)).rejects.toMatchObject({code:"LABEL_MAPPING_SKU_NOT_FOUND",status:404});
 expect((await f.pg.query(`SELECT id FROM "MerchandisingConfig" WHERE key LIKE 'custom-labels:%'`)).rows).toHaveLength(0);
});
it("rejects duplicate profiles for the same target rather than hiding competing mappings",async()=>{
 await approve();await expect(approveCustomLabelProfile(p,"conflict",{expectedRevision:0,profile:profile(),approvalReference:"synthetic"},f.db,now)).rejects.toMatchObject({code:"LABEL_TARGET_PROFILE_CONFLICT"});
});
it("enforces current tenant membership for previews, history and download",async()=>{
 await approve();const a=await preview();await create(a.previewId);
 const other={tenantId:"b",userId:"other96"};await expect(readCustomLabelFile(other,id,f.db)).rejects.toMatchObject({code:"LABEL_EXPORT_NOT_FOUND",status:404});expect((await readCustomLabelHistory(other,f.db)).rows).toHaveLength(0);
 await expect(previewCustomLabels(other,scope(),f.db)).rejects.toMatchObject({code:"LABEL_PROFILE_NOT_FOUND"});
 await expect(readCustomLabelFile({tenantId:"a",userId:"viewer96"},id,f.db)).rejects.toMatchObject({code:"AI_FORBIDDEN"});
});
it("does not export a stale source snapshot or silently switch provider sources",async()=>{
 await approve();const a=await preview();
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',9,now());`);
 await expect(preview()).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});await expect(create(a.previewId)).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
});
it("limits source rows before exporting instead of silently truncating the selection",async()=>{
 await approve();const broken={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$queryRaw:async<T>(q:Prisma.Sql)=>q.text.startsWith('SELECT s."skuId",d.classification')?Array.from({length:5001},(_,i)=>({skuId:`synthetic-${i}`,classification:"HEALTHY",productKind:"MERCHANDISE",quantity:"1",shortage:false} satisfies LabelInputRow)) as T:tx.$queryRaw<T>(q)}))};
 await expect(previewCustomLabels(p,scope(),broken)).rejects.toMatchObject({code:"LABEL_ROW_LIMIT",status:422});
});
it("enforces the daily tenant quota while keeping replay/download free",async()=>{
 await approve();const a=await preview(),receipt=await create(a.previewId);
 await f.pg.query(`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","idempotencyKey","createdAt") SELECT 'quota-'||n,'a','owner','CUSTOM_LABEL_EXPORT','CUSTOM_LABEL_EXPORT','quota:'||n,$1::timestamptz FROM generate_series(1,19) n`,[now.toISOString()]);
 await expect(create(a.previewId,"96aabbcc-1122-4123-8123-001122334457")).rejects.toMatchObject({code:"LABEL_EXPORT_QUOTA",status:429});
 expect(await create(a.previewId)).toEqual(receipt);expect((await readCustomLabelFile(p,id,f.db)).byteLength).toBe(a.file.byteLength);
});
