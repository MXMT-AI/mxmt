import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),request:vi.fn(),read:vi.fn(),step:vi.fn(),schedule:vi.fn(),resume:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock('@/lib/connectors/sync-cycles',()=>({requestSyncCycle:m.request,getSyncProgress:m.read,resumeSyncCycle:m.resume,resumeSyncBackfill:m.resume}));
vi.mock('@/lib/connectors/sync-worker',()=>({processSalesDriveSync:m.step,scheduleSalesDriveSyncs:m.schedule}));
import {GET,POST} from '@/app/api/connectors/salesdrive/sync/route';
import {GET as CRON} from '@/app/api/cron/salesdrive-sync/route';
import {signAccessToken} from '@/lib/auth';
function req(action?:string,headers:Record<string,string>={}){return new NextRequest('https://app.test/api/connectors/salesdrive/sync?tenantId=b',{method:action?'POST':'GET',headers:{'Content-Type':'application/json','x-tenant-id':'b','x-user-role':'ADMIN',...headers},...(action?{body:JSON.stringify({action,tenantId:'b'})}:{})});}
async function login(role:string){m.cookies.set('access_token',await signAccessToken({sub:'user',tenantId:'a',role}));}
beforeEach(()=>{vi.stubEnv('JWT_ACCESS_SECRET','sync-test-secret');vi.stubEnv('CRON_SECRET','sync-cron-secret');vi.resetAllMocks();m.cookies.clear();m.read.mockResolvedValue({cycle:null,resources:[],calculation:null});m.step.mockResolvedValue({processed:false});m.schedule.mockResolvedValue({requested:0});});
afterEach(()=>vi.unstubAllEnvs());
describe('unified sync boundary',()=>{
 it('ignores forged tenant and role headers without a session',async()=>{expect((await POST(req('refresh'))).status).toBe(401);expect(m.request).not.toHaveBeenCalled();});
 it.each(['VIEWER','ANALYST'])('allows %s to read but not trigger work',async(role)=>{await login(role);expect((await GET(req())).status).toBe(200);expect((await POST(req('refresh'))).status).toBe(403);expect((await POST(req('step'))).status).toBe(403);});
 it('binds refresh and bounded processing to the authenticated tenant',async()=>{await login('ADMIN');expect((await POST(req('refresh'))).status).toBe(200);expect(m.request).toHaveBeenCalledWith('a','both');expect((await POST(req('step'))).status).toBe(200);expect(m.step).toHaveBeenCalledWith('a');});
 it('returns a verifiable completion ID and separates recalculation readiness',async()=>{await login('VIEWER');m.read.mockResolvedValue({cycle:{id:'cycle-a',state:'COMPLETE',requestedAt:'2026-10-24T03:00:00Z',completedAt:'2026-10-24T03:01:00Z'},resources:[],calculation:{state:'WAITING_ENGINE'}});const response=await GET(req());expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toMatchObject({job:{id:'cycle-a',state:'COMPLETE',updatedAt:'2026-10-24T03:01:00Z'},calculation:{state:'WAITING_ENGINE'}});});
 it('sanitizes private errors and rejects inherited action names',async()=>{await login('ADMIN');m.request.mockRejectedValueOnce(new Error('private-account-key'));const response=await POST(req('refresh'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-account-key');expect((await POST(req('toString'))).status).toBe(400);});
 it('requires scheduler authentication before enqueueing and drains one worker step',async()=>{expect((await CRON(req())).status).toBe(401);expect(m.schedule).not.toHaveBeenCalled();expect((await CRON(req(undefined,{authorization:'Bearer sync-cron-secret'}))).status).toBe(200);expect(m.schedule).toHaveBeenCalledOnce();expect(m.step).toHaveBeenCalledOnce();});
 it('returns a retryable scheduler failure without source payloads',async()=>{m.schedule.mockRejectedValueOnce(new Error('private-account-key'));const response=await CRON(req(undefined,{authorization:'Bearer sync-cron-secret'}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-account-key');expect(m.step).not.toHaveBeenCalled();});
});
