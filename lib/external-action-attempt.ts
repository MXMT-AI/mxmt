import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import type {AiPrincipal} from "./ai-execution/contracts";
import {aiTransaction} from "./ai-execution/budget";
import {payloadHash} from "./connectors/order-storage";
export async function reserveExternalActionAttempt(p:AiPrincipal,tx:SqlClient,input:{entityType:string;prefix:string;kind:string;operationId:string|null;quotaKey:string;from:string;to:string;limit:number;policy:unknown;now:Date;quotaError:()=>Error}){
 const [used]=await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"=${input.entityType} AND context->>'quotaKey'=${input.quotaKey} AND context->>'from'=${input.from} AND context->>'to'=${input.to} AND action=${input.kind}`);
 if(used.n>=input.limit)throw input.quotaError();
 const id=randomUUID();await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",context,"createdAt") VALUES (${id},${p.tenantId},${p.userId},${input.kind},${input.entityType},${input.operationId},${`${input.prefix}:${id}`},${JSON.stringify({kind:`${input.entityType}_V1`,quotaKey:input.quotaKey,from:input.from,to:input.to,state:"RESERVED",policyHash:payloadHash(input.policy),accessPolicy:input.policy})}::jsonb,${input.now})`);return id;
}
export async function settleExternalActionAttempt(p:AiPrincipal,db:SqlDatabase,id:string,entityType:string,state:string,evidence:unknown=null){
 return aiTransaction(p,db,tx=>tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET context=context||jsonb_build_object('state',${state}::text,'evidence',${JSON.stringify(evidence)}::jsonb) WHERE "tenantId"=${p.tenantId} AND id=${id} AND "entityType"=${entityType}`),true);
}
export async function withExternalActionTimeout<T>(timeoutMs:number|undefined,timeoutError:()=>Error,fn:(signal:AbortSignal)=>Promise<T>){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeoutError());},Math.max(1,Math.min(timeoutMs??8000,8000)));})]);}finally{if(timer)clearTimeout(timer);}
}
