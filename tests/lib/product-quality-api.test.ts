import {NextRequest} from 'next/server';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),read:vi.fn(),alias:vi.fn(),kind:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock('@/lib/product-quality',()=>({getProductQuality:m.read}));
vi.mock('@/lib/product-normalization',()=>({saveBrandAlias:m.alias,saveProductKind:m.kind}));
import {GET,POST} from '@/app/api/data/quality/route';
import {signAccessToken} from '@/lib/auth';
function req(body?:unknown,query=''){return new NextRequest('https://app.example/api/data/quality'+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-tenant-id':'b','x-user-role':'ADMIN'},...(body?{body:JSON.stringify(body)}:{})});}
async function login(role:string){m.cookies.set('access_token',await signAccessToken({sub:'owner-a',tenantId:'a',role}));}
beforeEach(()=>{vi.stubEnv('JWT_ACCESS_SECRET','quality-test-secret');vi.resetAllMocks();m.cookies.clear();m.read.mockResolvedValue({rows:[],summary:[]});});afterEach(()=>vi.unstubAllEnvs());
describe('normalization and quality API',()=>{
 it('rejects forged identity headers',async()=>{expect((await GET(req())).status).toBe(401);expect((await POST(req({action:'alias',alias:'Seiko',brandId:'1'}))).status).toBe(401);expect(m.read).not.toHaveBeenCalled();});
 it.each(['VIEWER','ANALYST'])('allows %s diagnostics but no normalization changes',async(role)=>{await login(role);expect((await GET(req())).status).toBe(200);expect((await POST(req({action:'productKind',skuId:'sku',productKind:'SERVICE'}))).status).toBe(403);expect(m.kind).not.toHaveBeenCalled();});
 it('binds administrative aliases and type changes to the signed tenant/actor',async()=>{await login('ADMIN');expect((await POST(req({action:'alias',tenantId:'b',actorId:'b',alias:' seiko ',brandId:'brand-a'}))).status).toBe(200);expect(m.alias).toHaveBeenCalledWith('a','owner-a',' seiko ','brand-a');expect((await POST(req({action:'productKind',skuId:'sku-a',productKind:'GIFT_CARD'}))).status).toBe(200);expect(m.kind).toHaveBeenCalledWith('a','owner-a','sku-a','GIFT_CARD');});
 it('paginates/searches within the signed tenant and rejects invalid input',async()=>{await login('VIEWER');const result=await GET(req(undefined,'?tenantId=b&page=2&q=SKU'));expect(result.headers.get('Cache-Control')).toBe('no-store');expect(m.read).toHaveBeenCalledWith('a',{page:2,q:'SKU'});expect((await GET(req(undefined,'?page=-1'))).status).toBe(400);expect((await GET(req(undefined,'?q='+'x'.repeat(201)))).status).toBe(400);});
 it('bounds action payloads and sanitizes failures',async()=>{await login('ADMIN');expect((await POST(req({action:'alias',alias:'x'.repeat(5000),brandId:'x'}))).status).toBe(413);m.kind.mockRejectedValueOnce(new Error('private-key-and-customer-payload'));const response=await POST(req({action:'productKind',skuId:'sku',productKind:'SERVICE'}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-key');expect((await POST(req({action:'toString'}))).status).toBe(400);});
});
