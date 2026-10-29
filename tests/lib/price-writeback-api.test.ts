import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
const cookies=vi.hoisted(()=>new Map<string,string>());vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:cookies.get(key)})})}));
import {POST as preview} from "@/app/api/merchandising/price-writeback/preview/route";
import {POST as approve} from "@/app/api/merchandising/price-writeback/approve/route";
import {POST as execute} from "@/app/api/merchandising/price-writeback/execute/route";
import {POST as reconcile} from "@/app/api/merchandising/price-writeback/reconcile/route";
import {signAccessToken} from "@/lib/auth";
const login=async(role="ADMIN")=>cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
const req=(body:unknown={},query="")=>new NextRequest(`https://app.test/api/price-writeback${query}`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"forged","x-user-role":"ADMIN"},body:JSON.stringify(body)});
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-price109-secret");cookies.clear();});afterEach(()=>vi.unstubAllEnvs());
it("rejects forged identity and non-ADMIN roles before evaluating any action",async()=>{
 for(const route of [preview,approve,execute,reconcile])expect((await route(req())).status).toBe(401);for(const role of ["VIEWER","ANALYST"]){await login(role);for(const route of [preview,approve,execute,reconcile])expect((await route(req())).status).toBe(403);}
});
it("keeps production disabled even for valid owner intent; browser-provided adapter/approval data cannot activate it",async()=>{
 await login();const requests=[{exportId:"export",skuIds:["sku"],compensatesId:null},{operationId:"operation",previewHash:"hash",reference:"owner"},{operationId:"operation",previewHash:"hash"},{operationId:"operation"}];
 for(const [i,route] of [preview,approve,execute,reconcile].entries()){const response=await route(req(requests[i]));expect(response.status).toBe(409);expect(await response.json()).toHaveProperty("code","PRICE_WRITEBACK_DISABLED");}
 expect((await execute(req({...requests[2],transport:{},access:{canaryReference:"forged"}}))).status).toBe(400);
});
it("rejects query overrides, extra fields and unsupported numerical inputs",async()=>{
 await login();for(const route of [preview,approve,execute,reconcile])expect((await route(req({},"?tenant=forged"))).status).toBe(400);expect((await preview(req({exportId:"x",skuIds:Array.from({length:21},(_,i)=>`sku-${i}`),compensatesId:null}))).status).toBe(400);expect((await preview(req({exportId:"x",skuIds:["sku"],compensatesId:null,newPrice:"1"}))).status).toBe(400);
});
