import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody,apiError} from "@/lib/api-contracts";
import {prepareScenarioRetrospective} from "@/lib/scenario-retrospective-store";
import {RetrospectiveError} from "@/lib/scenario-retrospective";
import {AiExecutionError} from "@/lib/ai-execution/contracts";
import {logError} from "@/lib/observability";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser("ANALYST");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{
  if(request.nextUrl.search)throw new RetrospectiveError("INVALID_RETROSPECTIVE_REQUEST");
  return NextResponse.json(await prepareScenarioRetrospective({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof RetrospectiveError||error instanceof AiExecutionError)return apiError("Could not prepare retrospective. Check the original export and evaluation period.",error.status,error.code);
  logError("Retrospective preparation failed",error);return apiError("Could not prepare retrospective.",503,"RETROSPECTIVE_UNAVAILABLE");
 }
}
