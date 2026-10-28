import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),generate:vi.fn(),approve:vi.fn(),dependencies:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/marketing-briefs",()=>({generateMarketingBrief:m.generate,approveMarketingBrief:m.approve}));
vi.mock("@/lib/agent-dependencies",()=>({resolveAgentRunContext:vi.fn(async()=>({})),getCurrentDependencyRun:m.dependencies}));
import {POST as generate} from "@/app/api/agents/commercial-marketer/route";
import {POST as approve} from "@/app/api/agents/calendar-agent/recommendations/approve/route";
import {signAccessToken} from "@/lib/auth";
import {AiExecutionError} from "@/lib/ai-execution/contracts";
const req=(data:unknown)=>new NextRequest("https://app.test/api/agents/commercial-marketer",{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify(data)});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-marketing-api-secret");vi.clearAllMocks();m.cookies.clear();m.generate.mockResolvedValue({version:1,status:"draft"});m.approve.mockResolvedValue({created:0});m.dependencies.mockResolvedValue({ready:false,reason:"missing"});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("requires signed identity and rejects viewer generation and approval",async()=>{
 expect((await generate(req({mode:"marketing_v2"}))).status).toBe(401);await login("VIEWER");expect((await generate(req({mode:"marketing_v2"}))).status).toBe(403);expect((await approve(req({mode:"marketing_v2"}))).status).toBe(403);expect(m.generate).not.toHaveBeenCalled();expect(m.approve).not.toHaveBeenCalled();
});
it("dispatches explicit v2 briefs with the authenticated actor and no cached response",async()=>{
 await login();const body={mode:"marketing_v2",briefId:"test"};const response=await generate(req(body));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(m.generate).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},body);expect(m.dependencies).not.toHaveBeenCalled();
});
it("passes v2 approval intent to the owner-checking service without forged identity",async()=>{
 await login("ADMIN");const response=await approve(req({mode:"marketing_v2",briefId:"test",draftId:"draft",phase:"offer"}));expect(response.status).toBe(200);expect(m.approve).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},{briefId:"test",draftId:"draft",phase:"offer"});expect(response.headers.get("cache-control")).toBe("no-store");
});
it("preserves expected service errors without logging private details",async()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});await login();m.generate.mockRejectedValue(new AiExecutionError("AI_SCENARIO_NOT_FOUND",404));expect((await generate(req({mode:"marketing_v2"}))).status).toBe(404);m.approve.mockRejectedValue(new AiExecutionError("AI_FORBIDDEN",403));expect((await approve(req({mode:"marketing_v2"}))).status).toBe(403);expect(log).not.toHaveBeenCalled();
});
it("logs unexpected server causes and returns a sanitized error",async()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});await login();m.generate.mockRejectedValue(new AiExecutionError("AI_EXECUTION_FAILED",500,{cause:new Error("synthetic private DB failure")}));const response=await generate(req({mode:"marketing_v2"}));expect(response.status).toBe(500);expect(await response.text()).not.toContain("private DB");expect(log).toHaveBeenCalledTimes(1);
});
it("keeps legacy commercial dependency behavior and rejects unknown modes",async()=>{
 await login();expect((await generate(req({}))).status).toBe(409);expect(m.dependencies).toHaveBeenCalledTimes(2);expect(m.generate).not.toHaveBeenCalled();expect((await generate(req({mode:"unknown"}))).status).toBe(400);expect((await approve(req({mode:"unknown"}))).status).toBe(400);
});
