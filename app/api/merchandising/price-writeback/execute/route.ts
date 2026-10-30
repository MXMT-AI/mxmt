import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {executePriceWriteback} from "@/lib/price-writeback-store";
import {PriceWritebackError} from "@/lib/price-writeback";
import {priceWritebackApiError} from "@/lib/price-writeback-api";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new PriceWritebackError("INVALID_PRICE_REQUEST");return NextResponse.json(await executePriceWriteback({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return priceWritebackApiError(error);}
}
