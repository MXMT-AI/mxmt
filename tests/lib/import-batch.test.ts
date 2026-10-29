import {it,expect,vi} from "vitest";
import {Prisma} from "@prisma/client";
import {insertImportBatch} from "@/lib/import-batch";
const closed=()=>new Prisma.PrismaClientKnownRequestError("Server has closed the connection.",{code:"P1017",clientVersion:"5.22.0"});
it("does not silently skip duplicate input during the first insertion",async()=>{
 const insert=vi.fn(async()=>({count:1}));await insertImportBatch([{value:1}],insert);expect(insert).toHaveBeenCalledWith({data:[{value:1,id:expect.any(String)}],skipDuplicates:false});
});
it("reuses exact row IDs after timeout-after-commit without duplicate immutable import rows",async()=>{
 const stored=new Map<string,object>(),calls:Array<{data:Array<{value:number;id:string}>;skipDuplicates:boolean}>=[];
 const insert=vi.fn(async input=>{calls.push(input);for(const row of input.data){if(stored.has(row.id)&&!input.skipDuplicates)throw Error("duplicate");stored.set(row.id,row);}if(calls.length===1)throw closed();return {count:0};});
 await insertImportBatch([{value:1},{value:2}],insert,async()=>{});expect(stored.size).toBe(2);expect(calls[1].data).toEqual(calls[0].data);expect(calls[1].skipDuplicates).toBe(true);
});
it("recovers a pre-commit connection loss and bounds repeated failures to three attempts",async()=>{
 const wait=vi.fn(async()=>{}),insert=vi.fn().mockRejectedValueOnce(closed()).mockResolvedValue({count:1});await insertImportBatch([{value:1}],insert,wait);expect(insert).toHaveBeenCalledTimes(2);expect(wait).toHaveBeenCalledWith(100);
 insert.mockReset().mockRejectedValue(closed());wait.mockClear();await expect(insertImportBatch([{value:1}],insert,wait)).rejects.toMatchObject({code:"P1017"});expect(insert).toHaveBeenCalledTimes(3);expect(wait.mock.calls).toEqual([[100],[200]]);
});
it.each(["P2002","P2003","P2024","P2028"])("does not retry %s or hide integrity/transaction errors",async code=>{
 const error=new Prisma.PrismaClientKnownRequestError("synthetic",{code,clientVersion:"5.22.0"}),insert=vi.fn().mockRejectedValue(error),wait=vi.fn(async()=>{});await expect(insertImportBatch([{}],insert,wait)).rejects.toBe(error);expect(insert).toHaveBeenCalledTimes(1);expect(wait).not.toHaveBeenCalled();
});
it("does not classify arbitrary message text as a retryable connection failure",async()=>{
 const error=Error("P1017 Server has closed the connection"),insert=vi.fn().mockRejectedValue(error);await expect(insertImportBatch([{}],insert,async()=>{})).rejects.toBe(error);expect(insert).toHaveBeenCalledTimes(1);
});
it("recovers initial connectivity errors but never retries an unclassified failure",async()=>{
 const insert=vi.fn().mockRejectedValueOnce(new Prisma.PrismaClientInitializationError('synthetic','5.22.0','P1001')).mockResolvedValue({count:1});await insertImportBatch([{}],insert,async()=>{});expect(insert).toHaveBeenCalledTimes(2);
});
it("does not duplicate PostgreSQL rows when the first committed insert loses its response",async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{await db.exec('CREATE TABLE staged_import (id text PRIMARY KEY, value int NOT NULL)');let first=true;
 await insertImportBatch([{value:1},{value:2}],async({data,skipDuplicates})=>{
  for(const row of data)await db.query(`INSERT INTO staged_import VALUES ($1,$2) ${skipDuplicates?'ON CONFLICT DO NOTHING':''}`,[row.id,row.value]);
  if(first){first=false;throw closed();}return {count:0};
 },async()=>{});
 expect((await db.query('SELECT count(*)::int count,sum(value)::int total FROM staged_import')).rows).toEqual([{count:2,total:3}]);
 }finally{await db.close();}
},30000);
