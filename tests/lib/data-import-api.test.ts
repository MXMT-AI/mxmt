import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),pipeline:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>({value:m.cookies.get(name)})})}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/gdrive',()=>({isDriveConfigured:()=>true}));
vi.mock('@/lib/data-pipeline',()=>({runDataPipeline:m.pipeline}));
import {POST} from '@/app/api/data/import/route';
import {signAccessToken} from '@/lib/auth';
const request=()=>new NextRequest('https://app.test/api/data/import',{method:'POST',headers:{'content-type':'application/json','x-tenant-id':'forged'},body:JSON.stringify({dateFrom:'2026-01-01',dateTo:'2026-10-31'})});
beforeEach(()=>{vi.stubEnv('JWT_ACCESS_SECRET','synthetic-import-api-secret');vi.clearAllMocks();m.cookies.clear();});afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('requires signed ADMIN before importing',async()=>{
 expect((await POST(request())).status).toBe(401);m.cookies.set('access_token',await signAccessToken({sub:'actor',tenantId:'tenant',role:'ANALYST'}));expect((await POST(request())).status).toBe(403);expect(m.pipeline).not.toHaveBeenCalled();
});
it('returns an actionable sanitized connection error after bounded import recovery fails',async()=>{
 m.cookies.set('access_token',await signAccessToken({sub:'actor',tenantId:'tenant',role:'ADMIN'}));m.pipeline.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('private DB address and SQL',{code:'P1017',clientVersion:'5.22.0'}));
 const r=await POST(request()),body=await r.json();expect(r.status).toBe(503);expect(body).toMatchObject({code:'IMPORT_DATABASE_CONNECTION_INTERRUPTED',error:expect.stringContaining('Please retry')});expect(JSON.stringify(body)).not.toMatch(/private DB|SQL/);
 expect(m.pipeline).toHaveBeenCalledWith({tenantId:'tenant',calculate:true,dateFrom:'2026-01-01',dateTo:'2026-10-31',asOfDate:undefined});
});
it('does not disguise unexpected failures as retryable connection errors',async()=>{
 m.cookies.set('access_token',await signAccessToken({sub:'actor',tenantId:'tenant',role:'ADMIN'}));vi.spyOn(console,'error').mockImplementation(()=>{});m.pipeline.mockRejectedValue(Error('P1017 private text'));
 const r=await POST(request());expect(r.status).toBe(500);expect(await r.text()).not.toContain('private text');
});
