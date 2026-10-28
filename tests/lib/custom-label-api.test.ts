import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),approve:vi.fn(),profile:vi.fn(),preview:vi.fn(),create:vi.fn(),history:vi.fn(),file:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/custom-label-store",()=>({approveCustomLabelProfile:m.approve,readCustomLabelProfile:m.profile,previewCustomLabels:m.preview,createCustomLabelExport:m.create,readCustomLabelHistory:m.history,readCustomLabelFile:m.file}));
import {POST as approve,GET as profile} from "@/app/api/merchandising/custom-labels/profiles/[profileId]/route";
import {POST as preview} from "@/app/api/merchandising/custom-labels/preview/route";
import {POST as create,GET as history} from "@/app/api/merchandising/custom-labels/exports/route";
import {GET as download} from "@/app/api/merchandising/custom-labels/exports/[exportId]/route";
import {signAccessToken} from "@/lib/auth";
import {CustomLabelError} from "@/lib/custom-labels";
const id="96aabbcc-1122-4123-8123-001122334455";
const req=(value?:unknown,query="")=>new NextRequest(`https://app.test/api/merchandising/custom-labels${query}`,{method:value===undefined?"GET":"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"SUPER_ADMIN"},...(value===undefined?{}:{body:JSON.stringify(value)})});
const params=()=>({params:Promise.resolve({profileId:"campaign"})});
const login=async(role="ANALYST")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-label-api-secret");vi.clearAllMocks();m.cookies.clear();m.approve.mockResolvedValue({revision:1});m.profile.mockResolvedValue({revision:1});m.preview.mockResolvedValue({previewId:"preview"});m.create.mockResolvedValue({exportId:id});m.history.mockResolvedValue({rows:[]});m.file.mockResolvedValue({content:'"id","custom_label_0"\r\n"0001","HEALTHY"\r\n',name:"labels.csv",byteLength:42});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects forged identity and viewer access at every public entry point",async()=>{
 expect((await preview(req({}))).status).toBe(401);await login("VIEWER");
 for(const response of [await preview(req({})),await approve(req({}),params()),await profile(req(),params()),await create(req({})),await history(req()),await download(req(),{params:Promise.resolve({exportId:id})})])expect(response.status).toBe(403);
 expect(m.preview).not.toHaveBeenCalled();expect(m.file).not.toHaveBeenCalled();
});
it("restricts profile approval to owners while passing signed identity and bounded inputs",async()=>{
 await login();expect((await approve(req({}),params())).status).toBe(403);await login("ADMIN");const body={expectedRevision:0,approvalReference:"owner",profile:{}};
 const response=await approve(req(body),params());expect(response.status).toBe(201);expect(m.approve).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},"campaign",body);expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("uses the signed tenant for preview/export/history and keeps responses uncached",async()=>{
 await login();const body={profileId:"campaign",snapshotId:"snapshot"};
 expect((await preview(req(body))).status).toBe(200);expect(m.preview).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},body);
 expect((await create(req({scope:body,previewId:"preview",exportId:id}))).status).toBe(201);
 expect((await profile(req(),params())).headers.get("cache-control")).toBe("private, no-store");expect((await history(req())).headers.get("cache-control")).toBe("private, no-store");expect(m.history).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"});
});
it("returns exact stored file bytes with download headers without calling export again",async()=>{
 await login();const response=await download(req(),{params:Promise.resolve({exportId:id})});expect(await response.text()).toBe('"id","custom_label_0"\r\n"0001","HEALTHY"\r\n');
 expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");expect(response.headers.get("content-disposition")).toBe('attachment; filename="labels.csv"');expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(m.file).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},id);expect(m.create).not.toHaveBeenCalled();
});
it("preserves validation/quota status codes and sanitizes unexpected storage faults",async()=>{
 await login();m.create.mockRejectedValue(new CustomLabelError("LABEL_EXPORT_QUOTA",429));expect((await create(req({}))).status).toBe(429);
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});m.preview.mockRejectedValue(Error("synthetic private DB failure"));const response=await preview(req({}));expect(response.status).toBe(503);expect(await response.text()).not.toContain("private DB");expect(log).toHaveBeenCalledTimes(1);
});
it("rejects unexpected query overrides before invoking any service",async()=>{
 await login("ADMIN");const query="?tenantId=forged";
 for(const response of [await preview(req({},query)),await approve(req({},query),params()),await profile(req(undefined,query),params()),await create(req({},query)),await history(req(undefined,query)),await download(req(undefined,query),{params:Promise.resolve({exportId:id})})])expect(response.status).toBe(400);
 expect(m.preview).not.toHaveBeenCalled();expect(m.approve).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.file).not.toHaveBeenCalled();
});
