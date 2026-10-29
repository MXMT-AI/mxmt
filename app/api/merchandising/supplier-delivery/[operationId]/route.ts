import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {readSupplierDelivery} from "@/lib/supplier-delivery-store";
import {SupplierDeliveryError} from "@/lib/supplier-delivery";
import {supplierDeliveryApiError} from "@/lib/supplier-delivery-api";
export const runtime="nodejs";export const dynamic="force-dynamic";
/** Bounded same-tenant audit/catalog read, without external dispatch. */
export async function GET(request:NextRequest,{params}:{params:Promise<{operationId:string}>}){const {user,response}=await requireApiUser("ADMIN");if(response)return response;try{if(request.nextUrl.search)throw new SupplierDeliveryError("INVALID_SUPPLIER_DELIVERY_REQUEST");return NextResponse.json(await readSupplierDelivery({tenantId:user.tenantId,userId:user.userId},(await params).operationId),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return supplierDeliveryApiError(error);}}
