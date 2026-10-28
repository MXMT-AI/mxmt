import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {sampleProductAttributes} from "@/lib/product-attribute-store";
import {productAttributeApiError} from "@/lib/product-attribute-api";
import {ProductAttributeError} from "@/lib/product-attributes";
export const runtime="nodejs";export const dynamic="force-dynamic";
/** Return bounded projections of selected source fields for owner review, never entire raw feed bodies. */
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new ProductAttributeError("INVALID_ATTRIBUTE_QUERY");return NextResponse.json(await sampleProductAttributes({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return productAttributeApiError(error);}
}
