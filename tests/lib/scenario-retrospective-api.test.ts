import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));const m=vi.hoisted(()=>({cookies:new Map<string,string>(),prepare:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));vi.mock("@/lib/scenario-retrospective-store",()=>({prepareScenarioRetrospective:m.prepare}));
import {POST} from "@/app/api/merchandising/retrospectives/prepare/route";
import {signAccessToken} from "@/lib/auth";
import {RetrospectiveError} from "@/lib/scenario-retrospective";
const request=(query="")=>new NextRequest(`https://app.test/api/retrospectives${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify({exportId:"test"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-retrospective-secret");vi.clearAllMocks();m.cookies.clear();m.prepare.mockResolvedValue({state:"PREPARATION_ONLY",gmroi:null});});afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity, viewer access and query overrides",async()=>{
 expect((await POST(request())).status).toBe(401);await login("VIEWER");expect((await POST(request())).status).toBe(403);await login();expect((await POST(request("?actualSales=100"))).status).toBe(400);expect(m.prepare).not.toHaveBeenCalled();
});
it("binds preparation to signed identity and returns no-store evidence",async()=>{
 await login();const r=await POST(request());expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");expect(m.prepare).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},{exportId:"test"});
});
it("keeps expected scope errors and hides unexpected private faults",async()=>{
 await login();m.prepare.mockRejectedValue(new RetrospectiveError("RETROSPECTIVE_EXPORT_NOT_FOUND",404));expect((await POST(request())).status).toBe(404);vi.spyOn(console,"error").mockImplementation(()=>{});m.prepare.mockRejectedValue(Error("private export data"));const r=await POST(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("private export");
});
