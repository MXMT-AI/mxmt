import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {recoverMarketRequest} from "@/lib/market-evidence-store";
import {marketEvidenceApiError} from "@/lib/market-evidence-api";
import {MarketEvidenceError} from "@/lib/market-evidence";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{requestKey:string}>}){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 try{if(request.nextUrl.search)throw new MarketEvidenceError("INVALID_MARKET_QUERY");return NextResponse.json(await recoverMarketRequest({tenantId:user.tenantId,userId:user.userId},(await params).requestKey),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return marketEvidenceApiError(error);}
}
