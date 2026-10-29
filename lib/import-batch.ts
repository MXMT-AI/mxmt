import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";

export function isImportConnectionError(error:unknown):boolean{
  return (error instanceof Prisma.PrismaClientKnownRequestError||error instanceof Prisma.PrismaClientInitializationError)&&["P1001","P1017"].includes(error instanceof Prisma.PrismaClientKnownRequestError?error.code:error.errorCode??"");
}

/** Only immutable rows of a private, not-yet-published import run may use this helper. */
export async function insertImportBatch<T extends object>(
  rows:T[],
  insert:(input:{data:Array<T&{id:string}>;skipDuplicates:boolean})=>Promise<unknown>,
  wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
){
  // Allocate once: a lost response may follow a committed INSERT. Retrying must
  // hit the same primary keys, including issue rows without a natural unique key.
  const data=rows.map(row=>({...row,id:randomUUID()}));
  for(let attempt=0;;attempt++){
    try{return await insert({data,skipDuplicates:attempt>0});}
    catch(error){
      if(!isImportConnectionError(error)||attempt>=2)throw error;
      await wait(100*(attempt+1));
    }
  }
}
