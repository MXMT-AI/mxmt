import {beforeAll,afterAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createStockWorkspaceDb} from "../helpers/stock-workspace-db";
import {screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot} from "@/lib/merchandising-snapshot";
import {createRepricingInputs,getRepricingPreview} from "@/lib/repricing-store";
import {createScenarioExport} from "@/lib/scenario-export-store";
import {parseRetrospectiveRequest} from "@/lib/scenario-retrospective";
import {prepareScenarioRetrospective} from "@/lib/scenario-retrospective-store";
const exportId="11111111-1111-4111-8111-111111111111",p={tenantId:"a",userId:"owner"},request=()=>({exportId,kind:"reprice",period:{from:"2026-10-26",to:"2026-11-26"}});
let f:Awaited<ReturnType<typeof createStockWorkspaceDb>>,command:Record<string,unknown>;
beforeAll(async()=>{
 f=await createStockWorkspaceDb();await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('other54','other54@test.invalid','test','Other','ANALYST','a',now()),('viewer54','viewer54@test.invalid','test','Viewer','VIEWER','a',now()),('foreign54','foreign54@test.invalid','test','Foreign','ADMIN','b',now());`);
 const snapshot=await createScreenSnapshot("a",screenSelection,f.db),inputs=await createRepricingInputs("a",snapshot.snapshotId,f.db,screenSelection.now),scenario={inputSetId:inputs.inputSetId,pageSize:1},preview=await getRepricingPreview("a",scenario,f.db);command={exportId,kind:"reprice",previewId:preview.previewId,scenario};await createScenarioExport("a","owner",command,f.db,screenSelection.now);
},30000);afterAll(async()=>f?.pg.close());
it("rejects inferred activation, GMROI, client actuals and invalid/unbounded windows",()=>{
 expect(parseRetrospectiveRequest(request()).period.to).toBe("2026-11-26");for(const bad of [{...request(),launched:true},{...request(),gmroi:2},{...request(),actualSales:100},{...request(),period:{from:"2026-02-30",to:"2026-03-01"}},{...request(),period:{from:"2026-10-26",to:"2028-10-26"}},{...request(),period:{from:"2026-11-26",to:"2026-10-26"}}])expect(()=>parseRetrospectiveRequest(bad)).toThrow();
});
it("reproduces immutable export parameters and checksums without treating planned actions as real outcomes",async()=>{
 const r=await prepareScenarioRetrospective(p,request(),f.db);expect(r).toMatchObject({state:"PREPARATION_ONLY",executionState:"UNCONFIRMED",metricsState:"NOT_EVALUATED",actualSales:null,gmroi:null,causalUplift:null,externalActionExecuted:false,export:{receipt:{exportId},parameters:{previewId:command.previewId,scenario:{inputSetId:(command.scenario as {inputSetId:string}).inputSetId}}},gates:{gmroi:{state:"POLICY_NOT_APPROVED"}}});expect(r.export.exportedRowCount).toBeGreaterThan(0);expect(r.export.exportedRowsHash).toMatch(/^[a-f0-9]{32}$/);expect(r.export.receipt.files.every(f=>f.sha256.length===64)).toBe(true);expect(JSON.stringify(r)).not.toContain('"content":');expect(await prepareScenarioRetrospective(p,request(),f.db)).toEqual(r);
});
it("limits preparation to authorized actor/tenant exports and does not append actions or recalculate scenarios",async()=>{
 const before=(await f.pg.query(`SELECT id FROM "MerchandisingAction"`)).rows.length;await prepareScenarioRetrospective(p,request(),f.db);expect((await f.pg.query(`SELECT id FROM "MerchandisingAction"`)).rows.length).toBe(before);
 for(const actor of [{tenantId:"a",userId:"other54"},{tenantId:"b",userId:"foreign54"}])await expect(prepareScenarioRetrospective(actor,request(),f.db)).rejects.toMatchObject({code:"RETROSPECTIVE_EXPORT_NOT_FOUND"});await expect(prepareScenarioRetrospective({tenantId:"a",userId:"viewer54"},request(),f.db)).rejects.toMatchObject({code:"AI_FORBIDDEN"});await expect(prepareScenarioRetrospective(p,{...request(),kind:"reorder"},f.db)).rejects.toMatchObject({code:"RETROSPECTIVE_EXPORT_NOT_FOUND"});
});

it("rejects oversized metadata before transferring it into the preparation response",async()=>{
 const tx={ $queryRaw:vi.fn().mockResolvedValue([{actorId:"owner",receipt:null,request:null,dataVersion:{},rowsHash:"test",rowCount:1,metadataBytes:524289}]),$executeRaw:async()=>0 };
 const db={...tx,$transaction:async<T>(fn:(client:typeof tx)=>Promise<T>)=>fn({...tx,$queryRaw:vi.fn().mockImplementation(async q=>q.text.includes('FROM "MerchandisingAction"')?tx.$queryRaw(q):q.text.includes('FROM "User"')?[{id:"owner",tenantId:"a",role:"ADMIN"}]:[{id:"a"}])})};
 await expect(prepareScenarioRetrospective(p,request(),db)).rejects.toMatchObject({code:"RETROSPECTIVE_METADATA_LIMIT"});
});
