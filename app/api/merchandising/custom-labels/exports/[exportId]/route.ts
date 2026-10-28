import { NextRequest,NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { readCustomLabelFile } from "@/lib/custom-label-store";
import { customLabelApiError } from "@/lib/custom-label-api";
import { CustomLabelError } from "@/lib/custom-labels";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Stream only an authenticated tenant's already audited bytes; downloading performs no external action. */
export async function GET(request:NextRequest,{params}:{params:Promise<{exportId:string}>}){
  const {user,response}=await requireApiUser("ANALYST");if(response)return response;
  try{
    if(request.nextUrl.search)throw new CustomLabelError("INVALID_LABEL_SCOPE");
    const file=await readCustomLabelFile({tenantId:user.tenantId,userId:user.userId},(await params).exportId);
    return new NextResponse(file.content,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${file.name}"`,"Content-Length":String(file.byteLength),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return customLabelApiError(error);}
}
