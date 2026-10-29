import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));const m=vi.hoisted(()=>({cookies:new Map<string,string>(),confirm:vi.fn(),report:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/retrospective-execution-store",()=>({confirmScenarioExecution:m.confirm}));vi.mock("@/lib/retrospective-report",()=>({calculateScenarioRetrospective:m.report}));
import {POST as confirm} from "@/app/api/merchandising/retrospectives/executions/route";
import {POST as report} from "@/app/api/merchandising/retrospectives/report/route";
import {signAccessToken} from "@/lib/auth";
import {RetrospectiveExecutionError} from "@/lib/retrospective-contract";
const request=(query="")=>new NextRequest(`https://app.test/api/retrospectives${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify({executionId:"selector"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-retrospective108-secret");vi.clearAllMocks();m.cookies.clear();m.confirm.mockResolvedValue({executionId:"test"});m.report.mockResolvedValue({state:"AVAILABLE",causalUplift:null});});afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity/viewers and requires ADMIN to confirm execution",async()=>{
 expect((await confirm(request())).status).toBe(401);expect((await report(request())).status).toBe(401);await login("VIEWER");expect((await confirm(request())).status).toBe(403);expect((await report(request())).status).toBe(403);await login();expect((await confirm(request())).status).toBe(403);expect(m.confirm).not.toHaveBeenCalled();
});
it("uses signed actor/tenant with private no-store responses and rejects query overrides",async()=>{
 await login("ADMIN");const a=await confirm(request()),b=await report(request());expect(a.status).toBe(200);expect(b.status).toBe(200);expect(a.headers.get("cache-control")).toBe("private, no-store");expect(b.headers.get("cache-control")).toBe("private, no-store");expect(m.confirm).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},{executionId:"selector"});vi.clearAllMocks();expect((await confirm(request("?tenant=forged"))).status).toBe(400);expect((await report(request("?grossProfit=100"))).status).toBe(400);expect(m.confirm).not.toHaveBeenCalled();expect(m.report).not.toHaveBeenCalled();
});
it("preserves expected evidence errors and sanitizes unexpected storage details",async()=>{
 await login("ADMIN");m.confirm.mockRejectedValue(new RetrospectiveExecutionError("EXECUTION_SUBSET_MISMATCH",409));expect((await confirm(request())).status).toBe(409);vi.spyOn(console,"error").mockImplementation(()=>{});m.report.mockRejectedValue(Error("private financial data"));const r=await report(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("private financial");
});
