import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody,apiError} from "@/lib/api-contracts";
import {confirmScenarioExecution} from "@/lib/retrospective-execution-store";
import {RetrospectiveExecutionError} from "@/lib/retrospective-contract";
import {AiExecutionError} from "@/lib/ai-execution/contracts";
import {ScreenApiError} from "@/lib/merchandising-snapshot";
import {logError} from "@/lib/observability";
export const maxDuration=60;export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new RetrospectiveExecutionError("INVALID_RETROSPECTIVE_REQUEST");return NextResponse.json(await confirmScenarioExecution({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){if(error instanceof RetrospectiveExecutionError||error instanceof AiExecutionError||error instanceof ScreenApiError)return apiError("Check retrospective scope, execution evidence and complete saved periods.",error.status,error.code);logError("Retrospective operation failed",error);return apiError("Could not process retrospective.",503,"RETROSPECTIVE_UNAVAILABLE");}
}
