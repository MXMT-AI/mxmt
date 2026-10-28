import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),preview:vi.fn(),save:vi.fn(),read:vi.fn(),evaluate:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{}}));vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/analog-forecast-store",()=>({createAnalogPreview:m.preview,saveAnalogPolicy:m.save,readAnalogPolicy:m.read,evaluateAnalogForecasts:m.evaluate}));
import {POST as preview} from "@/app/api/merchandising/forecasts/preview/route";
import {POST as evaluate} from "@/app/api/merchandising/forecasts/evaluate/route";
import {POST as save,GET as read} from "@/app/api/merchandising/forecasts/policies/[profileId]/route";
import {signAccessToken} from "@/lib/auth";
import {AnalogForecastError} from "@/lib/analog-forecast";
const request=(value:unknown={},query="")=>new NextRequest(`https://app.test/api/forecasts${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify(value)});
const params=()=>({params:Promise.resolve({profileId:"watch"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-forecast-api-secret");vi.clearAllMocks();m.cookies.clear();m.preview.mockResolvedValue({state:"draft_preview",businessRulesApproved:false});m.save.mockResolvedValue({state:"draft"});m.read.mockResolvedValue({revision:1});m.evaluate.mockResolvedValue({releaseApproved:false});});afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity and viewer access",async()=>{
 expect((await preview(request())).status).toBe(401);await login("VIEWER");for(const response of [await preview(request()),await evaluate(request()),await save(request(),params()),await read(request(),params())])expect(response.status).toBe(403);expect(m.preview).not.toHaveBeenCalled();
});
it("uses signed tenant identity for previews and evaluation and retains private no-store",async()=>{
 await login();const body={profileId:"watch",snapshotId:"snapshot",targetId:"target",preview:true},response=await preview(request(body));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(m.preview).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},body);expect((await evaluate(request({profileId:"watch",cases:[]}))).status).toBe(200);expect((await read(request(),params())).status).toBe(200);
});
it("requires owner role for policy writes and rejects query overrides before service access",async()=>{
 await login();expect((await save(request(),params())).status).toBe(403);await login("ADMIN");expect((await save(request({expectedRevision:0,policy:{}}),params())).status).toBe(201);
 vi.clearAllMocks();for(const response of [await preview(request({},"?tenant=forged")),await evaluate(request({},"?quantity=999")),await save(request({},"?activate=true"),params()),await read(request({},"?tenant=forged"),params())])expect(response.status).toBe(400);expect(m.preview).not.toHaveBeenCalled();expect(m.evaluate).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it("returns policy/context errors without leaking private storage faults",async()=>{
 await login();m.preview.mockRejectedValue(new AnalogForecastError("ANALOG_PREVIEW_ONLY",409));expect((await preview(request())).status).toBe(409);const log=vi.spyOn(console,"error").mockImplementation(()=>{});m.preview.mockRejectedValue(Error("private source history"));const response=await preview(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private source");expect(log).toHaveBeenCalledTimes(1);
});
