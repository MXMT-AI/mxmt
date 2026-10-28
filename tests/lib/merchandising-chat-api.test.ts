import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),read:vi.fn(),legacy:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/merchandising-chat",()=>({merchandisingChat:m.read}));
vi.mock("@/lib/ai",()=>({chat:m.legacy}));
import {POST} from "@/app/api/ai/route";
import {signAccessToken} from "@/lib/auth";
import {AiExecutionError} from "@/lib/ai-execution/contracts";
const body={mode:"merchandising",requestKey:"client-key",snapshotId:"snapshot",topic:"sales",question:"Який дохід?"};
const req=(data:unknown=body)=>new NextRequest("https://app.test/api/ai",{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"SUPER_ADMIN"},body:JSON.stringify(data)});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"user",tenantId:"a",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-chat-api-key");vi.clearAllMocks();m.cookies.clear();m.read.mockResolvedValue({mode:"generated",cards:[],citations:[],answer:{summary:"Серверна відповідь",recommendations:[]}});m.legacy.mockResolvedValue("legacy answer");});
afterEach(()=>vi.unstubAllEnvs());
it("rejects forged identity headers and viewer execution",async()=>{
 expect((await POST(req())).status).toBe(401);await login("VIEWER");expect((await POST(req())).status).toBe(403);expect(m.read).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});
it("uses the signed actor/tenant and returns a noncached v2 reply with a request ID",async()=>{
 await login();const response=await POST(req());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect((await response.json()).requestId).toBeTruthy();expect(m.read).toHaveBeenCalledWith({tenantId:"a",userId:"user"},body);expect(m.legacy).not.toHaveBeenCalled();
});
it.each([["AI_POLICY_REQUIRED",409],["AI_BUDGET_EXCEEDED",429],["AI_INPUT_LIMIT",413],["AI_PROVIDER_UNAVAILABLE",502]] as const)("keeps deterministic fallback cards and HTTP semantics for %s",async(code,status)=>{
 await login();m.read.mockResolvedValue({mode:"fallback",code,answer:null,cards:[{value:"123.4500"}]});const response=await POST(req());expect(response.status).toBe(status);expect((await response.json()).cards[0].value).toBe("123.4500");
});
it("returns explicit context errors without exposing server exception data",async()=>{
 await login();m.read.mockRejectedValue(new AiExecutionError("AI_CONTEXT_STALE",409));const response=await POST(req());expect(response.status).toBe(409);expect((await response.json()).code).toBe("AI_CONTEXT_STALE");
});
it("does not silently route unknown v2 modes into unrestricted legacy chat",async()=>{
 await login();expect((await POST(req({...body,mode:"untrusted"}))).status).toBe(400);expect(m.read).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled();
});
it("preserves existing planner/analyst request compatibility without opting it into v2",async()=>{
 await login();const legacy={systemPrompt:"existing planner context",messages:[{role:"user",content:"existing question"}]};const response=await POST(req(legacy));expect(response.status).toBe(200);expect((await response.json()).content).toBe("legacy answer");expect(m.legacy).toHaveBeenCalledWith(expect.objectContaining(legacy));expect(m.read).not.toHaveBeenCalled();
});
