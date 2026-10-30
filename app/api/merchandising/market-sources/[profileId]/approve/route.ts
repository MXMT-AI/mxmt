import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {approveMarketSource} from "@/lib/market-source-store";
import {marketEvidenceApiError} from "@/lib/market-evidence-api";
import {MarketEvidenceError} from "@/lib/market-evidence";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{profileId:string}>}){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new MarketEvidenceError("INVALID_MARKET_QUERY");return NextResponse.json(await approveMarketSource({tenantId:user.tenantId,userId:user.userId},(await params).profileId,data),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return marketEvidenceApiError(error);}
}
