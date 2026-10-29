import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {readPriceWriteback} from "@/lib/price-writeback-store";
import {PriceWritebackError} from "@/lib/price-writeback";
import {priceWritebackApiError} from "@/lib/price-writeback-api";
export const runtime="nodejs";export const dynamic="force-dynamic";
/** Read a single bounded actor-owned audit record without invoking any transport. */
export async function GET(request:NextRequest,{params}:{params:Promise<{operationId:string}>}){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 try{if(request.nextUrl.search)throw new PriceWritebackError("INVALID_PRICE_REQUEST");return NextResponse.json(await readPriceWriteback({tenantId:user.tenantId,userId:user.userId},(await params).operationId),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return priceWritebackApiError(error);}
}
