import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest} from 'next/server';
import {Prisma} from '@prisma/client';
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{brand:{findFirst:m.find,update:m.update}}}));
vi.mock('@/lib/server-auth',()=>({requireApiUser:async()=>({user:{tenantId:'a',userId:'owner',role:'ANALYST'},response:null})}));
import {PUT} from '@/app/api/planner/brands/[id]/route';
let pg:PGlite;
beforeAll(async()=>{
 pg=new PGlite();const root=new URL('../../prisma/migrations/',import.meta.url);
 for(const name of(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort())await pg.exec(await readFile(new URL(`${name}/migration.sql`,root),'utf8'));
 await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now())`);
},30000);
afterAll(async()=>pg?.close());
beforeEach(async()=>{
 await pg.exec(`DELETE FROM "Brand"; INSERT INTO "Brand" (id,"tenantId",name,currency,"normalizationKey") VALUES ('one','a','Seiko','UAH',NULL),('two','a',' SEIKO ','EUR',NULL),('canonical','a','Citizen','UAH','CITIZEN')`);
 m.find.mockImplementation(async({where}:{where:{tenantId:string;id:string|{not:string};name?:{equals:string}}})=>{
  const result=typeof where.id==='string'?await pg.query('SELECT * FROM "Brand" WHERE id=$1 AND "tenantId"=$2',[where.id,where.tenantId]):await pg.query('SELECT id FROM "Brand" WHERE id<>$1 AND "tenantId"=$2 AND lower(name)=lower($3)',[where.id.not,where.tenantId,where.name!.equals]);
  return result.rows[0]??null;
 });
 m.update.mockImplementation(async({where,data}:{where:{id:string};data:Record<string,unknown>})=>{
  const entries=Object.entries(data);
  try{return (await pg.query(`UPDATE "Brand" SET ${entries.map(([key],i)=>`"${key}"=$${i+1}`).join(',')} WHERE id=$${entries.length+1} RETURNING *`,[...entries.map(([,value])=>value),where.id])).rows[0];}
  catch(error){if((error as {code:string}).code==='23505')throw new Prisma.PrismaClientKnownRequestError('Duplicate',{code:'P2002',clientVersion:'test'});throw error;}
 });
});
async function edit(id:string,body:unknown){return PUT(new NextRequest(`https://app.test/api/planner/brands/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})});}
describe('legacy ambiguous brand edits',()=>{
 it('edits terms on both records without taking a canonical key or trimming either identity',async()=>{
  expect((await edit('one',{budget:50})).status).toBe(200);
  expect((await edit('two',{moq:3})).status).toBe(200);
  expect((await pg.query('SELECT id,name,currency,"normalizationKey",budget,moq FROM "Brand" WHERE id IN (\'one\',\'two\') ORDER BY id')).rows).toEqual([{id:'one',name:'Seiko',currency:'UAH',normalizationKey:null,budget:50,moq:1},{id:'two',name:' SEIKO ',currency:'EUR',normalizationKey:null,budget:0,moq:3}]);
 });
 it('preserves ambiguity for a case/whitespace-only name edit',async()=>{
  const response=await edit('two',{name:' seiko ',paymentDays:45});expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({name:' SEIKO ',normalizationKey:null,paymentDays:45});
 });
 it('normalizes an explicit rename to a different identity',async()=>{
  const response=await edit('two',{name:'  Briston  '});expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({name:'Briston',normalizationKey:'BRISTON'});
 });
 it('keeps canonical keys on ordinary edits and reports an actual rename conflict',async()=>{
  const response=await edit('canonical',{budget:100});expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({normalizationKey:'CITIZEN',budget:100});
  expect((await edit('two',{name:'Citizen'})).status).toBe(409);
 });
});
