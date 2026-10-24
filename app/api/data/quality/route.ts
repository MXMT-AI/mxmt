import {NextRequest,NextResponse} from 'next/server';
import {requireApiUser} from '@/lib/server-auth';
import {apiError,isRecord,parseJsonBody} from '@/lib/api-contracts';
import {getProductQuality} from '@/lib/product-quality';
import {saveBrandAlias,saveProductKind} from '@/lib/product-normalization';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
/** Current tenant diagnostics only; source secrets/raw customer payloads are never returned. */
export async function GET(request:NextRequest){
 const {user,response}=await requireApiUser();if(response)return response;
 const p=request.nextUrl.searchParams, page=Number(p.get('page')??1),q=p.get('q')??'';
 if(!Number.isSafeInteger(page)||page<1||page>100000||q.length>200)return apiError('Invalid page or search',400,'INVALID_QUERY');
 try{return NextResponse.json(await getProductQuality(user.tenantId,{page,q}),{headers});}
 catch{return apiError('Data quality is unavailable',503,'QUALITY_UNAVAILABLE');}
}
/** Administrative normalization overrides are validated, tenant-scoped and audited atomically. */
export async function POST(request:NextRequest){
 const {user,response}=await requireApiUser('ADMIN');if(response)return response;
 const body=await parseJsonBody(request,crypto.randomUUID(),4096);if(body.response)return body.response;
 const value=body.data;if(!isRecord(value))return apiError('Choose an action',400,'INVALID_ACTION');
 try{
  if(value.action==='alias'&&typeof value.alias==='string'&&value.alias.length<=200&&(value.brandId===null||typeof value.brandId==='string'&&value.brandId.length<=200))await saveBrandAlias(user.tenantId,user.userId,value.alias,value.brandId);
  else if(value.action==='productKind'&&typeof value.skuId==='string'&&value.skuId.length<=200&&typeof value.productKind==='string')await saveProductKind(user.tenantId,user.userId,value.skuId,value.productKind);
  else return apiError('Choose a valid normalization action',400,'INVALID_ACTION');
  return NextResponse.json({ok:true},{headers});
 }catch(error){const code=error instanceof Error&&['INVALID_ALIAS','BRAND_NOT_FOUND','SKU_NOT_FOUND','INVALID_PRODUCT_KIND'].includes(error.message)?error.message:'NORMALIZATION_UNAVAILABLE';return apiError('Normalization change could not be saved',code==='NORMALIZATION_UNAVAILABLE'?503:400,code);}
}
