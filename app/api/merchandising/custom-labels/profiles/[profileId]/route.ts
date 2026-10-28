import { NextRequest,NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { approveCustomLabelProfile,readCustomLabelProfile } from "@/lib/custom-label-store";
import { customLabelApiError } from "@/lib/custom-label-api";
import { CustomLabelError } from "@/lib/custom-labels";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Explicit owner approval covers this exact target, slot policy, rules and mapping revision. */
export async function POST(request:NextRequest,{params}:{params:Promise<{profileId:string}>}){
  const {user,response}=await requireApiUser("ADMIN");if(response)return response;
  const {data,response:invalid}=await parseJsonBody(request,undefined,4*1024*1024);if(invalid)return invalid;
  try{
    if(request.nextUrl.search)throw new CustomLabelError("INVALID_LABEL_SCOPE");
    return NextResponse.json(await approveCustomLabelProfile({tenantId:user.tenantId,userId:user.userId},(await params).profileId,data),{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return customLabelApiError(error);}
}
/** Existing verified configuration is readable to analysts; no default profile or mapping is manufactured. */
export async function GET(request:NextRequest,{params}:{params:Promise<{profileId:string}>}){
  const {user,response}=await requireApiUser("ANALYST");if(response)return response;
  try{
    if(request.nextUrl.search)throw new CustomLabelError("INVALID_LABEL_SCOPE");
    return NextResponse.json(await readCustomLabelProfile({tenantId:user.tenantId,userId:user.userId},(await params).profileId),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return customLabelApiError(error);}
}
