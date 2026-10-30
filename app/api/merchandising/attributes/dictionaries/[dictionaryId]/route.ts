import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {saveAttributeDictionary,readAttributeDictionary} from "@/lib/product-attribute-store";
import {productAttributeApiError} from "@/lib/product-attribute-api";
import {ProductAttributeError} from "@/lib/product-attributes";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{dictionaryId:string}>}){
 const {user,response}=await requireApiUser("ADMIN");if(response)return response;
 const {data,response:invalid}=await parseJsonBody(request,undefined,4*1024*1024);if(invalid)return invalid;
 try{if(request.nextUrl.search)throw new ProductAttributeError("INVALID_ATTRIBUTE_QUERY");return NextResponse.json(await saveAttributeDictionary({tenantId:user.tenantId,userId:user.userId},(await params).dictionaryId,data),{status:201,headers:{"Cache-Control":"private, no-store"}});}catch(error){return productAttributeApiError(error);}
}
export async function GET(request:NextRequest,{params}:{params:Promise<{dictionaryId:string}>}){
 const {user,response}=await requireApiUser("ANALYST");if(response)return response;
 try{if(request.nextUrl.search)throw new ProductAttributeError("INVALID_ATTRIBUTE_QUERY");return NextResponse.json(await readAttributeDictionary({tenantId:user.tenantId,userId:user.userId},(await params).dictionaryId),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return productAttributeApiError(error);}
}
