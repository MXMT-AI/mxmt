import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {approveSupplierRecipient} from "@/lib/supplier-recipient-store";
import {SupplierDeliveryError} from "@/lib/supplier-delivery";
import {supplierDeliveryApiError} from "@/lib/supplier-delivery-api";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{recipientId:string}>}){const {user,response}=await requireApiUser("ADMIN");if(response)return response;const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;try{if(request.nextUrl.search)throw new SupplierDeliveryError("INVALID_SUPPLIER_DELIVERY_REQUEST");return NextResponse.json(await approveSupplierRecipient({tenantId:user.tenantId,userId:user.userId},(await params).recipientId,data),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return supplierDeliveryApiError(error);}}
