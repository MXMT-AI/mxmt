import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {evaluateAnalogForecasts} from "@/lib/analog-forecast-store";
import {analogForecastApiError} from "@/lib/analog-forecast-api";
import {AnalogForecastError} from "@/lib/analog-forecast";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser("ANALYST");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new AnalogForecastError("INVALID_FORECAST_QUERY");return NextResponse.json(await evaluateAnalogForecasts({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return analogForecastApiError(error);}
}
