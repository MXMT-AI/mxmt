import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizedBrandKey } from "@/lib/data-normalization";
import type { SqlDatabase, SqlClient } from "@/lib/connectors/database";

/** Audit metadata changes in the existing tenant action log, inside their transaction. */
async function audit(tx: SqlClient, tenantId:string, actorId:string, action:string, entityId:string, before:unknown, after:unknown) {
 const id=randomUUID();
 await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",before,after) VALUES (${id},${tenantId},${actorId},${action},'NORMALIZATION',${entityId},${id},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`);
}

/** An explicit alias points at one existing tenant brand; no names or financial terms are merged. */
export async function saveBrandAlias(tenantId:string,actorId:string,alias:string,brandId:string|null,db:SqlDatabase=prisma) {
 const key=normalizedBrandKey(alias); if(!key || key.length>200)throw new Error('INVALID_ALIAS');
 return db.$transaction(async tx=>{
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`);
  const [before]=await tx.$queryRaw<Array<{brandId:string;revision:number}>>(Prisma.sql`SELECT "brandId",revision FROM "BrandAlias" WHERE "tenantId"=${tenantId} AND value=${key}`);
  if(before?.brandId===brandId || !before && brandId===null)return;
  if(brandId){
   const [target]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "Brand" WHERE id=${brandId} AND "tenantId"=${tenantId}`);
   if(!target)throw new Error('BRAND_NOT_FOUND');
   await tx.$executeRaw(Prisma.sql`INSERT INTO "BrandAlias" (id,"tenantId",value,"brandId","updatedAt") VALUES (${randomUUID()},${tenantId},${key},${brandId},now()) ON CONFLICT ("tenantId",value) DO UPDATE SET "brandId"=EXCLUDED."brandId",revision="BrandAlias".revision+1,"updatedAt"=now()`);
  }else await tx.$executeRaw(Prisma.sql`DELETE FROM "BrandAlias" WHERE "tenantId"=${tenantId} AND value=${key}`);
  await audit(tx,tenantId,actorId,'BRAND_ALIAS_CHANGED',key,before??null,brandId?{brandId}:null);
 });
}

/** Explicit product-kind overrides control exclusions; imports never overwrite this field. */
export async function saveProductKind(tenantId:string,actorId:string,skuId:string,kind:string,db:SqlDatabase=prisma) {
 if(!['UNKNOWN','MERCHANDISE','SERVICE','GIFT_CARD'].includes(kind))throw new Error('INVALID_PRODUCT_KIND');
 return db.$transaction(async tx=>{
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`);
  const [before]=await tx.$queryRaw<Array<{productKind:string;sourceId:string|null}>>(Prisma.sql`SELECT "productKind","catalogAttributes"->>'sourceId' "sourceId" FROM "Sku" WHERE "tenantId"=${tenantId} AND id=${skuId} FOR UPDATE`);
  if(!before)throw new Error('SKU_NOT_FOUND');
  if(before.productKind===kind)return;
  await tx.$executeRaw(Prisma.sql`UPDATE "Sku" SET "productKind"=${kind}::"MerchandiseProductKind" WHERE "tenantId"=${tenantId} AND id=${skuId}`);
  await audit(tx,tenantId,actorId,'PRODUCT_KIND_CHANGED',skuId,before,{productKind:kind});
  if(before.sourceId) await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorRecalculation" SET state='WAITING_ENGINE',"requestedAt"=now(),"inputProvenance"="inputProvenance"||jsonb_build_object('metadataChangedAt',now()) WHERE "tenantId"=${tenantId} AND "sourceId"=${before.sourceId}`);
 });
}
