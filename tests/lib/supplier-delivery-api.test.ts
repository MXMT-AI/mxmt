import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({cookies:new Map<string,string>(),preview:vi.fn(),approve:vi.fn(),send:vi.fn(),reconcile:vi.fn(),cancelPreview:vi.fn(),cancelApprove:vi.fn(),cancel:vi.fn(),receipt:vi.fn(),read:vi.fn(),recipient:vi.fn(),save:vi.fn(),recipientApprove:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:m.cookies.get(key)})})}));
vi.mock("@/lib/supplier-delivery-store",()=>({previewSupplierDelivery:m.preview,approveSupplierDelivery:m.approve,sendSupplierDelivery:m.send,reconcileSupplierDelivery:m.reconcile,previewSupplierCancellation:m.cancelPreview,approveSupplierCancellation:m.cancelApprove,cancelSupplierDelivery:m.cancel,recordSupplierGoodsReceipt:m.receipt,readSupplierDelivery:m.read}));
vi.mock("@/lib/supplier-recipient-store",()=>({readSupplierRecipient:m.recipient,saveSupplierRecipient:m.save,approveSupplierRecipient:m.recipientApprove}));
import {POST as preview} from "@/app/api/merchandising/supplier-delivery/preview/route";
import {POST as approve} from "@/app/api/merchandising/supplier-delivery/approve/route";
import {POST as send} from "@/app/api/merchandising/supplier-delivery/send/route";
import {POST as reconcile} from "@/app/api/merchandising/supplier-delivery/reconcile/route";
import {POST as cancelPreview} from "@/app/api/merchandising/supplier-delivery/cancellation/preview/route";
import {POST as cancelApprove} from "@/app/api/merchandising/supplier-delivery/cancellation/approve/route";
import {POST as cancel} from "@/app/api/merchandising/supplier-delivery/cancellation/execute/route";
import {POST as receipt} from "@/app/api/merchandising/supplier-delivery/receipt/route";
import {GET as read} from "@/app/api/merchandising/supplier-delivery/[operationId]/route";
import {GET as recipient,POST as save} from "@/app/api/merchandising/supplier-recipients/[recipientId]/route";
import {POST as recipientApprove} from "@/app/api/merchandising/supplier-recipients/[recipientId]/approve/route";
import {signAccessToken} from "@/lib/auth";
import {SupplierDeliveryError} from "@/lib/supplier-delivery";
const request=(query="")=>new NextRequest(`https://app.test/api/supplier-delivery${query}`,{method:"POST",headers:{"content-type":"application/json","x-user-role":"ADMIN","x-tenant-id":"forged"},body:JSON.stringify({operationId:"selector"})});
const login=async(role="ADMIN")=>m.cookies.set("access_token",await signAccessToken({sub:"actor",tenantId:"tenant",role}));
const params={params:Promise.resolve({operationId:"selector",recipientId:"recipient"})};
const calls=[()=>preview(request()),()=>approve(request()),()=>send(request()),()=>reconcile(request()),()=>cancelPreview(request()),()=>cancelApprove(request()),()=>cancel(request()),()=>receipt(request()),()=>read(request(),params),()=>recipient(request(),params),()=>save(request(),params),()=>recipientApprove(request(),params)];
beforeEach(()=>{vi.stubEnv("JWT_ACCESS_SECRET","synthetic-supplier110-secret");vi.clearAllMocks();m.cookies.clear();for(const v of Object.values(m))if(vi.isMockFunction(v))v.mockResolvedValue({state:"DRAFT"});});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("requires signed ADMIN for every delivery, cancellation, receipt and catalog endpoint",async()=>{
 for(const call of calls)expect((await call()).status).toBe(401);
 for(const role of ["VIEWER","ANALYST"]){await login(role);for(const call of calls)expect((await call()).status).toBe(403);}
 expect(m.send).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it("passes only signed tenant/actor to services, without registering any production transport",async()=>{
 await login();for(const call of calls){const response=await call();expect([200,201]).toContain(response.status);expect(response.headers.get("cache-control")).toBe("private, no-store");}
 expect(m.send).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},{operationId:"selector"});
 expect(m.recipientApprove).toHaveBeenCalledWith({tenantId:"tenant",userId:"actor"},"recipient",{operationId:"selector"});
});
it("rejects query overrides and sanitizes provider/storage errors",async()=>{
 await login();expect((await send(request("?tenantId=forged"))).status).toBe(400);expect(m.send).not.toHaveBeenCalled();
 m.send.mockRejectedValueOnce(new SupplierDeliveryError("SUPPLIER_DELIVERY_DISABLED",409));expect((await send(request())).status).toBe(409);
 vi.spyOn(console,"error").mockImplementation(()=>{});m.send.mockRejectedValueOnce(Error("private recipient/provider body"));const r=await send(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain("private recipient");
});
