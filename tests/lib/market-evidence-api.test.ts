import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),get:vi.fn(),save:vi.fn(),read:vi.fn(),approve:vi.fn(),recover:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{}}));vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/market-evidence-store",()=>({getMarketEvidence:m.get,recoverMarketRequest:m.recover}));
vi.mock("@/lib/market-source-store",()=>({saveMarketSource:m.save,readMarketSource:m.read,approveMarketSource:m.approve}));
import {POST as get} from "@/app/api/merchandising/market-evidence/route";
import {POST as save,GET as read} from "@/app/api/merchandising/market-sources/[profileId]/route";
import {POST as approve} from "@/app/api/merchandising/market-sources/[profileId]/approve/route";
import {POST as recover} from "@/app/api/merchandising/market-sources/requests/[requestKey]/recover/route";
import {signAccessToken} from "@/lib/auth";
import {MarketEvidenceError} from "@/lib/market-evidence";
import {marketQuery} from "../fixtures/market-evidence";
const request=(value:unknown={},query="")=>new NextRequest(`https://app.test/api/market-evidence${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify(value)});
const params=()=>({params:Promise.resolve({profileId:"market"})});const recovery=()=>({params:Promise.resolve({requestKey:"lookup"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-market-api-secret");vi.clearAllMocks();m.cookies.clear();m.get.mockResolvedValue({status:"unavailable",reason:"SOURCE_ADAPTER_NOT_CONFIGURED"});m.save.mockResolvedValue({state:"draft"});m.read.mockResolvedValue({revision:1});m.approve.mockResolvedValue({state:"approved"});m.recover.mockResolvedValue({state:"RECOVERED"});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity and viewer access across evidence and policy endpoints",async()=>{
 expect((await get(request())).status).toBe(401);await login("VIEWER");for(const response of [await get(request()),await save(request(),params()),await read(request(),params()),await approve(request(),params()),await recover(request(),recovery())])expect(response.status).toBe(403);expect(m.get).not.toHaveBeenCalled();
});
it("uses the signed tenant and no-store response with no client adapter injection",async()=>{
 await login();const q=marketQuery(),response=await get(request(q));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(m.get).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},q);expect(await response.json()).toMatchObject({status:"unavailable",reason:"SOURCE_ADAPTER_NOT_CONFIGURED"});
});
it("restricts source policy approval and recovery to owners",async()=>{
 await login();for(const response of [await save(request(),params()),await approve(request(),params()),await recover(request(),recovery())])expect(response.status).toBe(403);expect((await read(request(),params())).status).toBe(200);
 await login("ADMIN");expect((await save(request({expectedRevision:0,policy:{}}),params())).status).toBe(201);expect((await approve(request({configId:"config",approvalReference:"synthetic"}),params())).status).toBe(200);expect((await recover(request(),recovery())).status).toBe(200);expect(m.recover).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},"lookup");
});
it("rejects URL/query overrides before dispatch and preserves sanitized policy errors",async()=>{
 await login("ADMIN");for(const response of [await get(request({},"?url=private")),await save(request({},"?tenant=forged"),params()),await read(request({},"?tenant=forged"),params()),await approve(request({},"?tenant=forged"),params()),await recover(request({},"?tenant=forged"),recovery())])expect(response.status).toBe(400);expect(m.get).not.toHaveBeenCalled();
 m.get.mockRejectedValue(new MarketEvidenceError("SOURCE_REVISION_CONFLICT",409));expect((await get(request(marketQuery()))).status).toBe(409);
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});m.get.mockRejectedValue(Error("private upstream data"));const failed=await get(request(marketQuery()));expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("private upstream");expect(log).toHaveBeenCalledTimes(1);
});
