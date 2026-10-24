import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),enqueue:vi.fn(),progress:vi.fn(),step:vi.fn(),resume:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/connectors/inventory-jobs",()=>({enqueueInventoryImport:m.enqueue,getInventoryProgress:m.progress,processInventoryJob:m.step,resumeInventoryImport:m.resume}));
import { GET, POST } from "@/app/api/connectors/salesdrive/inventory/route";
import { GET as CRON } from "@/app/api/cron/salesdrive-inventory/route";
import { signAccessToken } from "@/lib/auth";
function request(action?: string) { return new NextRequest('https://app.example/api/connectors/salesdrive/inventory?tenantId=other',{method:action?'POST':'GET',headers:{'Content-Type':'application/json','x-tenant-id':'other','x-user-role':'ADMIN'},...(action?{body:JSON.stringify({action,tenantId:'other'})}:{})}); }
async function login(role:string) { m.cookies.set('access_token',await signAccessToken({sub:'user',tenantId:'tenant-a',role})); }
beforeEach(()=>{vi.stubEnv('JWT_ACCESS_SECRET','inventory-test-secret');vi.stubEnv('CRON_SECRET','inventory-cron-secret');vi.resetAllMocks();m.cookies.clear();m.progress.mockResolvedValue({job:null,coverage:{firstObservedAt:null,observedDays:0,historicalStockAvailable:false}});m.step.mockResolvedValue({processed:false});});
afterEach(()=>vi.unstubAllEnvs());
describe('inventory import API',()=>{
 it('does not trust identity headers without an access cookie',async()=>{expect((await GET(request())).status).toBe(401);expect(m.progress).not.toHaveBeenCalled();});
 it.each(['VIEWER','ANALYST'])('allows %s to inspect coverage but not start, resume or process work',async(role)=>{
  await login(role);expect((await GET(request())).status).toBe(200);expect(m.progress).toHaveBeenCalledWith('tenant-a');
  for(const action of ['start','resume','step']) expect((await POST(request(action))).status).toBe(403);
  expect(m.enqueue).not.toHaveBeenCalled();
 });
 it('scopes all admin actions to the verified tenant',async()=>{await login('ADMIN');for(const action of ['start','resume','step']) expect((await POST(request(action))).status).toBe(200);
  for(const fn of [m.enqueue,m.resume,m.step]) expect(fn).toHaveBeenCalledWith('tenant-a');
 });
 it('exposes fixed configuration errors and does not leak raw database errors',async()=>{await login('ADMIN');m.enqueue.mockRejectedValueOnce(new Error('CATALOG_NOT_CONFIGURED'));
  expect((await POST(request('start'))).status).toBe(409);m.enqueue.mockRejectedValueOnce(new Error('secret-raw-customer-data'));
  const response=await POST(request('start'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret-raw');
 });
 it('requires the cron secret and processes at most one protected worker invocation',async()=>{expect((await CRON(new NextRequest('https://app.example/api/cron/salesdrive-inventory'))).status).toBe(401);
  expect(m.step).not.toHaveBeenCalled();expect((await CRON(new NextRequest('https://app.example/api/cron/salesdrive-inventory',{headers:{authorization:'Bearer inventory-cron-secret'}}))).status).toBe(200);expect(m.step).toHaveBeenCalledOnce();
 });
});
