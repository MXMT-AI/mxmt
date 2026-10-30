import {NextRequest,NextResponse} from "next/server";
import {requireApiUser} from "@/lib/server-auth";
import {parseJsonBody} from "@/lib/api-contracts";
import {approveSupplierCancellation} from "@/lib/supplier-delivery-store";
import {SupplierDeliveryError} from "@/lib/supplier-delivery";
import {supplierDeliveryApiError} from "@/lib/supplier-delivery-api";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function POST(request:NextRequest){const {user,response}=await requireApiUser("ADMIN");if(response)return response;const {data,response:invalid}=await parseJsonBody(request);if(invalid)return invalid;try{if(request.nextUrl.search)throw new SupplierDeliveryError("INVALID_SUPPLIER_DELIVERY_REQUEST");return NextResponse.json(await approveSupplierCancellation({tenantId:user.tenantId,userId:user.userId},data),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return supplierDeliveryApiError(error);}}
