import { NextRequest,NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { createCustomLabelExport,readCustomLabelHistory } from "@/lib/custom-label-store";
import { customLabelApiError } from "@/lib/custom-label-api";
import { CustomLabelError } from "@/lib/custom-labels";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Explicitly compare the server preview and persist its exact file as one audited action. */
export async function POST(request:NextRequest){
  const {user,response}=await requireApiUser("ANALYST");if(response)return response;
  const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
  try{
    if(request.nextUrl.search)throw new CustomLabelError("INVALID_LABEL_SCOPE");
    return NextResponse.json(await createCustomLabelExport({tenantId:user.tenantId,userId:user.userId},data),{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return customLabelApiError(error);}
}
/** History contains bounded provenance/metadata, without loading file or assignment bodies. */
export async function GET(request:NextRequest){
  const {user,response}=await requireApiUser("ANALYST");if(response)return response;
  try{
    if(request.nextUrl.search)throw new CustomLabelError("INVALID_LABEL_SCOPE");
    return NextResponse.json(await readCustomLabelHistory({tenantId:user.tenantId,userId:user.userId}),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return customLabelApiError(error);}
}
