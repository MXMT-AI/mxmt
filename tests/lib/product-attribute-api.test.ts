import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),analyze:vi.fn(),save:vi.fn(),read:vi.fn(),approve:vi.fn(),sample:vi.fn(),legacy:vi.fn(),update:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{agentRun:{update:m.update}}}));vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/product-attribute-report",()=>({analyzeProductAttributes:m.analyze}));vi.mock("@/lib/product-attribute-store",()=>({saveAttributeDictionary:m.save,readAttributeDictionary:m.read,approveAttributeDictionary:m.approve,sampleProductAttributes:m.sample}));
vi.mock("@/lib/attribute-metrics",()=>({getAttributeMetrics:m.legacy}));vi.mock("@/lib/agent-runs",()=>({startAgentRun:async()=>({run:{id:"legacy-run"},response:null})}));
import {POST as analyze} from "@/app/api/agents/product-attributes/route";
import {POST as save,GET as read} from "@/app/api/merchandising/attributes/dictionaries/[dictionaryId]/route";
import {POST as approve} from "@/app/api/merchandising/attributes/dictionaries/[dictionaryId]/approve/route";
import {POST as sample} from "@/app/api/merchandising/attributes/samples/route";
import {signAccessToken} from "@/lib/auth";
import {ProductAttributeError} from "@/lib/product-attributes";
const request=(value:unknown={},query="")=>new NextRequest(`https://app.test/api/attributes${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify(value)});
const params=()=>({params:Promise.resolve({dictionaryId:"watch"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-attribute-api-secret");vi.clearAllMocks();m.cookies.clear();m.analyze.mockResolvedValue({mode:"attributes_v2",state:"draft_preview"});m.save.mockResolvedValue({state:"draft"});m.read.mockResolvedValue({revision:1});m.approve.mockResolvedValue({state:"approved"});m.sample.mockResolvedValue({samples:[]});m.legacy.mockResolvedValue({byCategory:[]});});afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity and viewer access",async()=>{
 expect((await analyze(request({mode:"attributes_v2"}))).status).toBe(401);await login("VIEWER");for(const response of [await analyze(request({mode:"attributes_v2"})),await save(request(),params()),await read(request(),params()),await approve(request(),params()),await sample(request())])expect(response.status).toBe(403);expect(m.analyze).not.toHaveBeenCalled();
});
it("uses signed actor identity for deterministic v2 analysis and retains no-store headers",async()=>{
 await login();const body={mode:"attributes_v2",dictionaryId:"watch",snapshotId:"snapshot",preview:true},response=await analyze(request(body));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(m.analyze).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},body);expect(m.legacy).not.toHaveBeenCalled();
});
it("requires owner role for drafts, samples and approval, and keeps reads tenant-scoped",async()=>{
 await login();expect((await save(request(),params())).status).toBe(403);expect((await sample(request())).status).toBe(403);expect((await approve(request(),params())).status).toBe(403);expect((await read(request(),params())).status).toBe(200);
 await login("ADMIN");expect((await save(request({expectedRevision:0,dictionary:{}}),params())).status).toBe(201);expect((await approve(request({configId:"config"}),params())).status).toBe(200);expect((await sample(request({dictionaryId:"watch",skuIds:["sku"]}))).status).toBe(200);expect(m.approve).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},"watch",{configId:"config"});
});
it("does not present legacy category-only output as physical-attribute evidence",async()=>{
 await login();const response=await analyze(request({}));expect(response.status).toBe(200);expect(m.legacy).toHaveBeenCalledWith("tenant",undefined,undefined);expect(m.analyze).not.toHaveBeenCalled();expect((await analyze(request({mode:"unknown"}))).status).toBe(400);
});
it("preserves explicit approval errors and sanitizes unexpected database faults",async()=>{
 await login();m.analyze.mockRejectedValue(new ProductAttributeError("ATTRIBUTE_DICTIONARY_NOT_APPROVED",409));expect((await analyze(request({mode:"attributes_v2"}))).status).toBe(409);const log=vi.spyOn(console,"error").mockImplementation(()=>{});m.analyze.mockRejectedValue(Error("synthetic private DB data"));const response=await analyze(request({mode:"attributes_v2"}));expect(response.status).toBe(503);expect(await response.text()).not.toContain("private DB");expect(log).toHaveBeenCalledTimes(1);
});
it("rejects query overrides before accessing dictionary services",async()=>{
 await login("ADMIN");for(const response of [await save(request({},"?tenant=forged"),params()),await read(request({},"?tenant=forged"),params()),await approve(request({},"?tenant=forged"),params()),await sample(request({},"?tenant=forged"))])expect(response.status).toBe(400);expect(m.save).not.toHaveBeenCalled();expect(m.sample).not.toHaveBeenCalled();
});
